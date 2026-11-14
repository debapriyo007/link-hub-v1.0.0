/**
 * Server-Backed Category Share Store (LinkHub v2.0.0)
 *
 * Replaces predictable client-side 6-digit codes with high-entropy tokens,
 * scrypt optional password protection, server-enforced expiration & revocation.
 * Uses Firebase Admin Firestore when configured, and a bounded in-memory store
 * for local development and automated testing.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { App as FirebaseAdminApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from './security.ts';

export interface ShareLinkSanitized {
  title: string;
  url: string;
  description?: string;
  tags?: string[];
}

export interface StoredShareRecord {
  id: string;
  shortCode: string;
  ownerId: string;
  categoryName: string;
  categorySlug: string;
  categoryIcon: string;
  categoryColor: string;
  readOnly: true;
  hasPassword: boolean;
  passwordHash: string;
  revoked: boolean;
  linkCount: number;
  links: ShareLinkSanitized[];
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface PublicSharePayload {
  shareToken: string;
  shortCode: string;
  categoryName: string;
  categorySlug: string;
  categoryIcon: string;
  categoryColor: string;
  readOnly: true;
  hasPassword: boolean;
  expiresAt: number;
  createdAt: number;
  links: ShareLinkSanitized[];
}

export interface CreateShareInput {
  ownerId: string;
  shortCode?: string;
  categoryName: string;
  categorySlug: string;
  categoryIcon?: string;
  categoryColor?: string;
  links: unknown[];
  ttlHours?: number;
  password?: string;
}

const SHARE_TOKEN_REGEX = /^[a-zA-Z0-9_-]{22,128}$/;
const SHORT_CODE_REGEX = /^LH-?([A-Z0-9]{3})-?([A-Z0-9]{3})$/i;

function readDatabaseId(): string | undefined {
  if (process.env.FIRESTORE_DATABASE_ID?.trim()) {
    return process.env.FIRESTORE_DATABASE_ID.trim();
  }
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as {
      firestoreDatabaseId?: string;
    };
    return parsed.firestoreDatabaseId || undefined;
  } catch {
    return undefined;
  }
}

export function generateShareToken(): string {
  return `lh2_${crypto.randomBytes(24).toString('base64url')}`;
}

export function normalizeShortShareCode(raw: string | undefined): string | null {
  const m = (raw || '').trim().match(SHORT_CODE_REGEX);
  if (!m) return null;
  return `LH-${m[1].toUpperCase()}-${m[2].toUpperCase()}`;
}

export function generateShortShareCode(): string {
  const num = crypto.randomInt(100000, 1000000);
  const digits = String(num);
  return `LH-${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
}

export function isValidShareTokenFormat(token: string): boolean {
  const clean = (token || '').trim();
  return SHARE_TOKEN_REGEX.test(clean) || Boolean(normalizeShortShareCode(clean));
}

export function hashSharePassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

export function verifySharePassword(candidate: string, encodedHash: string): boolean {
  if (!encodedHash.startsWith('scrypt:')) return false;
  const parts = encodedHash.split(':');
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    const actual = crypto.scryptSync(candidate, salt, expected.length, { N: 16384, r: 8, p: 1 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sanitizeShareLinks(rawLinks: unknown[]): ShareLinkSanitized[] {
  const out: ShareLinkSanitized[] = [];
  for (const raw of rawLinks.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const rawUrl = typeof item.url === 'string' ? item.url.trim().slice(0, 2048) : '';
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) continue;
    // Refuse to share un-decrypted internal encrypted vault placeholders
    if (rawUrl.startsWith('https://encrypted.linkhub.vault')) continue;

    let validatedUrl = '';
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      validatedUrl = u.toString();
    } catch {
      continue;
    }

    const title = (typeof item.title === 'string' ? item.title.trim() : '')
      .slice(0, 120) || 'Shared Bookmark';
    const description =
      typeof item.description === 'string' && item.description.trim()
        ? item.description.trim().slice(0, 240)
        : undefined;
    const tags = Array.isArray(item.tags)
      ? item.tags
          .map((t) => String(t).trim().replace(/^#/, '').slice(0, 32))
          .filter(Boolean)
          .slice(0, 6)
      : undefined;

    out.push({
      title,
      url: validatedUrl,
      ...(description ? { description } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
    });
  }
  return out;
}

export interface SharesRepository {
  create(input: CreateShareInput): Promise<StoredShareRecord>;
  getByToken(token: string): Promise<StoredShareRecord | null>;
  revoke(token: string, ownerId: string): Promise<'ok' | 'not_found' | 'forbidden'>;
  listByOwner(ownerId: string): Promise<Array<Omit<StoredShareRecord, 'passwordHash'>>>;
}

export class InMemorySharesRepository implements SharesRepository {
  private readonly store = new Map<string, StoredShareRecord>();
  private readonly shortIndex = new Map<string, string>();

  async create(input: CreateShareInput): Promise<StoredShareRecord> {
    const cleanLinks = sanitizeShareLinks(input.links);
    if (cleanLinks.length === 0) {
      throw new Error('At least one valid HTTP/HTTPS bookmark is required to create a share.');
    }

    const now = Date.now();
    const ttlHours = Math.max(1, Math.min(24 * 30, Number(input.ttlHours || 24 * 7)));
    const expiresAt = now + ttlHours * 3600 * 1000;
    const cleanPassword = (input.password || '').trim();
    const hasPassword = cleanPassword.length > 0;

    const id = generateShareToken();
    const requestedShort = normalizeShortShareCode(input.shortCode);
    const shortCode =
      requestedShort && !this.shortIndex.has(requestedShort)
        ? requestedShort
        : generateShortShareCode();

    const record: StoredShareRecord = {
      id,
      shortCode,
      ownerId: input.ownerId,
      categoryName: (input.categoryName || 'Shared Collection').trim().slice(0, 60) || 'Shared Collection',
      categorySlug:
        (input.categorySlug || 'shared')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || 'shared',
      categoryIcon: (input.categoryIcon || 'folder').trim().slice(0, 40) || 'folder',
      categoryColor: (input.categoryColor || '#ff9000').trim().slice(0, 20) || '#ff9000',
      readOnly: true,
      hasPassword,
      passwordHash: hasPassword ? hashSharePassword(cleanPassword) : '',
      revoked: false,
      linkCount: cleanLinks.length,
      links: cleanLinks,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(id, record);
    this.shortIndex.set(shortCode, id);
    return record;
  }

  async getByToken(token: string): Promise<StoredShareRecord | null> {
    const clean = (token || '').trim();
    if (this.store.has(clean)) {
      return this.store.get(clean) || null;
    }
    const shortCode = normalizeShortShareCode(clean);
    if (shortCode) {
      const targetId = this.shortIndex.get(shortCode);
      if (targetId) return this.store.get(targetId) || null;
    }
    return null;
  }

  async revoke(token: string, ownerId: string): Promise<'ok' | 'not_found' | 'forbidden'> {
    const clean = (token || '').trim();
    const shortCode = normalizeShortShareCode(clean);
    const resolvedId = this.store.has(clean) ? clean : shortCode ? this.shortIndex.get(shortCode) || clean : clean;
    const rec = this.store.get(resolvedId);
    if (!rec) return 'not_found';
    if (rec.ownerId !== ownerId) return 'forbidden';
    rec.revoked = true;
    rec.updatedAt = Date.now();
    this.store.set(resolvedId, rec);
    return 'ok';
  }

  async listByOwner(ownerId: string): Promise<Array<Omit<StoredShareRecord, 'passwordHash'>>> {
    const list: Array<Omit<StoredShareRecord, 'passwordHash'>> = [];
    for (const rec of this.store.values()) {
      if (rec.ownerId === ownerId) {
        const { passwordHash: _ph, ...safe } = rec;
        list.push(safe);
      }
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(0, 50);
  }
}

class FirestoreAdminSharesRepository implements SharesRepository {
  private readonly db: Firestore;

  constructor(adminApp: FirebaseAdminApp) {
    const dbId = readDatabaseId();
    this.db = dbId ? getFirestore(adminApp, dbId) : getFirestore(adminApp);
    try {
      this.db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Settings may already be applied if reused
    }
  }

  async create(input: CreateShareInput): Promise<StoredShareRecord> {
    const cleanLinks = sanitizeShareLinks(input.links);
    if (cleanLinks.length === 0) {
      throw new Error('At least one valid HTTP/HTTPS bookmark is required to create a share.');
    }

    const now = Date.now();
    const ttlHours = Math.max(1, Math.min(24 * 30, Number(input.ttlHours || 24 * 7)));
    const expiresAt = now + ttlHours * 3600 * 1000;
    const cleanPassword = (input.password || '').trim();
    const hasPassword = cleanPassword.length > 0;
    const passwordHash = hasPassword ? hashSharePassword(cleanPassword) : '';
    const id = generateShareToken();
    const shortCode = normalizeShortShareCode(input.shortCode) || generateShortShareCode();

    const record: StoredShareRecord = {
      id,
      shortCode,
      ownerId: input.ownerId,
      categoryName: (input.categoryName || 'Shared Collection').trim().slice(0, 60) || 'Shared Collection',
      categorySlug:
        (input.categorySlug || 'shared')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || 'shared',
      categoryIcon: (input.categoryIcon || 'folder').trim().slice(0, 40) || 'folder',
      categoryColor: (input.categoryColor || '#ff9000').trim().slice(0, 20) || '#ff9000',
      readOnly: true,
      hasPassword,
      passwordHash,
      revoked: false,
      linkCount: cleanLinks.length,
      links: cleanLinks,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.collection('shares').doc(id).set({
      id: record.id,
      shortCode: record.shortCode,
      ownerId: record.ownerId,
      categoryName: record.categoryName,
      categorySlug: record.categorySlug,
      categoryIcon: record.categoryIcon,
      categoryColor: record.categoryColor,
      readOnly: true,
      hasPassword: record.hasPassword,
      revoked: false,
      linkCount: record.linkCount,
      links: record.links,
      expiresAt: Timestamp.fromMillis(record.expiresAt),
      createdAt: Timestamp.fromMillis(record.createdAt),
      updatedAt: Timestamp.fromMillis(record.updatedAt),
    });

    if (hasPassword) {
      await this.db.collection('shareSecrets').doc(id).set({
        passwordHash,
        ownerId: record.ownerId,
        createdAt: Timestamp.fromMillis(record.createdAt),
      });
    }

    return record;
  }

  async getByToken(token: string): Promise<StoredShareRecord | null> {
    const clean = (token || '').trim();
    let snap = await this.db.collection('shares').doc(clean).get();
    if (!snap.exists) {
      const normalizedShort = normalizeShortShareCode(clean);
      if (normalizedShort) {
        const qSnap = await this.db
          .collection('shares')
          .where('shortCode', '==', normalizedShort)
          .limit(1)
          .get();
        if (!qSnap.empty) {
          snap = qSnap.docs[0];
        }
      }
    }
    if (!snap.exists) return null;
    const d = snap.data() as Record<string, unknown>;
    const resolvedId = String(d.id || snap.id);
    let passwordHash = '';
    if (d.hasPassword) {
      const secretSnap = await this.db.collection('shareSecrets').doc(resolvedId).get();
      passwordHash = String(secretSnap.data()?.passwordHash || '');
    }

    const toMs = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
        return (v as { toMillis: () => number }).toMillis();
      }
      return Date.now();
    };

    return {
      id: resolvedId,
      shortCode: String(d.shortCode || resolvedId.slice(0, 12)),
      ownerId: String(d.ownerId || ''),
      categoryName: String(d.categoryName || 'Shared Collection'),
      categorySlug: String(d.categorySlug || 'shared'),
      categoryIcon: String(d.categoryIcon || 'folder'),
      categoryColor: String(d.categoryColor || '#ff9000'),
      readOnly: true,
      hasPassword: Boolean(d.hasPassword),
      passwordHash,
      revoked: Boolean(d.revoked),
      linkCount: Number(d.linkCount || 0),
      links: Array.isArray(d.links) ? (d.links as ShareLinkSanitized[]) : [],
      expiresAt: toMs(d.expiresAt),
      createdAt: toMs(d.createdAt),
      updatedAt: toMs(d.updatedAt),
    };
  }

  async revoke(token: string, ownerId: string): Promise<'ok' | 'not_found' | 'forbidden'> {
    const clean = (token || '').trim();
    let ref = this.db.collection('shares').doc(clean);
    let snap = await ref.get();
    if (!snap.exists) {
      const normalizedShort = normalizeShortShareCode(clean);
      if (normalizedShort) {
        const qSnap = await this.db
          .collection('shares')
          .where('shortCode', '==', normalizedShort)
          .limit(1)
          .get();
        if (!qSnap.empty) {
          ref = qSnap.docs[0].ref;
          snap = qSnap.docs[0];
        }
      }
    }
    if (!snap.exists) return 'not_found';
    if (snap.data()?.ownerId !== ownerId) return 'forbidden';
    await ref.update({
      revoked: true,
      updatedAt: Timestamp.fromMillis(Date.now()),
    });
    return 'ok';
  }

  async listByOwner(ownerId: string): Promise<Array<Omit<StoredShareRecord, 'passwordHash'>>> {
    const snap = await this.db
      .collection('shares')
      .where('ownerId', '==', ownerId)
      .limit(50)
      .get();

    const toMs = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
        return (v as { toMillis: () => number }).toMillis();
      }
      return Date.now();
    };

    return snap.docs.map((doc) => {
      const d = doc.data();
      const id = String(d.id || doc.id);
      return {
        id,
        shortCode: String(d.shortCode || id.slice(0, 12)),
        ownerId: String(d.ownerId || ownerId),
        categoryName: String(d.categoryName || 'Shared Collection'),
        categorySlug: String(d.categorySlug || 'shared'),
        categoryIcon: String(d.categoryIcon || 'folder'),
        categoryColor: String(d.categoryColor || '#ff9000'),
        readOnly: true,
        hasPassword: Boolean(d.hasPassword),
        revoked: Boolean(d.revoked),
        linkCount: Number(d.linkCount || 0),
        links: Array.isArray(d.links) ? (d.links as ShareLinkSanitized[]) : [],
        expiresAt: toMs(d.expiresAt),
        createdAt: toMs(d.createdAt),
        updatedAt: toMs(d.updatedAt),
      };
    });
  }
}

export function createDefaultSharesRepository(): SharesRepository {
  const adminApp = getFirebaseAdminApp();
  if (adminApp) {
    return new FirestoreAdminSharesRepository(adminApp);
  }
  return new InMemorySharesRepository();
}

export function toPublicSharePayload(rec: StoredShareRecord): PublicSharePayload {
  return {
    shareToken: rec.id,
    shortCode: rec.shortCode,
    categoryName: rec.categoryName,
    categorySlug: rec.categorySlug,
    categoryIcon: rec.categoryIcon,
    categoryColor: rec.categoryColor,
    readOnly: true,
    hasPassword: rec.hasPassword,
    expiresAt: rec.expiresAt,
    createdAt: rec.createdAt,
    links: rec.links,
  };
}
