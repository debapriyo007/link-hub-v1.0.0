import { Category, LinkItem } from '../types.ts';

export interface SharedLinkEntry {
  title: string;
  url: string;
  description?: string;
  tags?: string[];
}

export interface SharedCategoryBundle {
  version: 1;
  shortCode: string;
  categoryName: string;
  categorySlug: string;
  categoryIcon?: string;
  categoryColor?: string;
  links: SharedLinkEntry[];
  createdAt: number;
}

export interface PendingSharedImport {
  chosenLinks: SharedLinkEntry[];
  targetCategorySlug: string;
  newCategoryMeta?: {
    name: string;
    slug: string;
    icon?: string;
    color?: string;
  };
  bundleName: string;
  savedAt: number;
}

const REGISTRY_STORAGE_KEY = 'linkhub_shared_category_bundles_v1';
const PENDING_IMPORT_STORAGE_KEY = 'linkhub_pending_shared_import_v1';

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Generates a deterministic 6-digit numeric share code (formatted as LH-XXX-XXX)
 * for a category + its links so the same category state produces a clean, memorable code.
 */
export function generateCategoryShortCode(categoryName: string, links: SharedLinkEntry[]): string {
  const seed = `${categoryName.trim().toLowerCase()}|${links.map((l) => l.url).join('|')}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = (Math.abs(hash) % 900000) + 100000;
  const digits = String(num);
  return `LH-${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
}

/**
 * Saves a bundle into localStorage registry so entering the short code (e.g. LH-123-456 or 123456)
 * or uploading a QR image resolves immediately.
 */
export function registerSharedCategoryBundle(bundle: SharedCategoryBundle): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    const registry: Record<string, SharedCategoryBundle> = raw ? JSON.parse(raw) : {};
    const normalizedKey = bundle.shortCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    registry[normalizedKey] = bundle;
    const digitsOnly = normalizedKey.replace(/^LH/, '');
    if (digitsOnly) {
      registry[digitsOnly] = bundle;
    }
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Creates a portable, self-contained share string ("LHCAT1:...") and a redirectable URL
 * ("https://.../?share=LHCAT1:...") that encodes the category and all its links.
 */
export function encodeCategorySharePayload(
  category: Pick<Category, 'name' | 'slug' | 'icon' | 'color'>,
  links: LinkItem[]
): {
  bundle: SharedCategoryBundle;
  qrPayload: string;
  shareUrl: string;
  shareCode: string;
} {
  const sharedLinks: SharedLinkEntry[] = links.slice(0, 40).map((l) => ({
    title: l.title,
    url: l.url,
    description: l.description ? l.description.slice(0, 120) : undefined,
    tags: l.tags ? l.tags.slice(0, 4) : undefined,
  }));

  const shortCode = generateCategoryShortCode(category.name, sharedLinks);

  const bundle: SharedCategoryBundle = {
    version: 1,
    shortCode,
    categoryName: category.name,
    categorySlug: category.slug,
    categoryIcon: category.icon,
    categoryColor: category.color,
    links: sharedLinks,
    createdAt: Date.now(),
  };

  registerSharedCategoryBundle(bundle);

  const compact = {
    c: bundle.categoryName,
    s: bundle.shortCode,
    i: bundle.categoryIcon || 'folder',
    k: bundle.categoryColor || '#ff9000',
    l: bundle.links.map((item) => [
      item.title,
      item.url,
      item.description || '',
      (item.tags || []).join(','),
    ]),
  };

  const qrPayload = `LHCAT1:${toBase64Url(JSON.stringify(compact))}`;
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://linkhub.cloud';
  const shareUrl = `${origin}/?share=${encodeURIComponent(qrPayload)}`;

  return {
    bundle,
    qrPayload,
    shareUrl,
    shareCode: shortCode,
  };
}

/**
 * Decodes either:
 * 1. A full QR Redirect URL ("https://.../?share=LHCAT1:...")
 * 2. A portable Share Token ("LHCAT1:...")
 * 3. A short code ("LH-123-456" or "123456") from the registry or matching active vault categories
 */
export function decodeCategoryShareInput(
  rawInput: string,
  existingCategories: Category[] = [],
  existingLinks: LinkItem[] = []
): SharedCategoryBundle | null {
  let trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Extract ?share= parameter if input is a full URL
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('?share=') || trimmed.includes('&share=')) {
    try {
      const urlObj = new URL(trimmed, 'https://linkhub.cloud');
      const shareParam = urlObj.searchParams.get('share');
      if (shareParam) {
        trimmed = decodeURIComponent(shareParam).trim();
      }
    } catch {
      const match = trimmed.match(/[?&]share=([^&#\s]+)/i);
      if (match?.[1]) {
        try {
          trimmed = decodeURIComponent(match[1]).trim();
        } catch {
          trimmed = match[1].trim();
        }
      }
    }
  }

  // Also check if LHCAT1: is embedded inside the string
  const tokenIdx = trimmed.indexOf('LHCAT1:');
  if (tokenIdx > 0) {
    trimmed = trimmed.slice(tokenIdx).trim();
  }

  // Case 1: Full portable LHCAT1 token
  if (trimmed.startsWith('LHCAT1:')) {
    try {
      const encoded = trimmed.slice('LHCAT1:'.length).trim();
      const jsonStr = fromBase64Url(encoded);
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.c === 'string' && Array.isArray(parsed.l)) {
        const links: SharedLinkEntry[] = parsed.l
          .filter((row: unknown) => Array.isArray(row) && row.length >= 2)
          .map((row: string[]) => ({
            title: String(row[0] || 'Shared Bookmark'),
            url: String(row[1] || ''),
            description: row[2] ? String(row[2]) : undefined,
            tags: row[3]
              ? String(row[3])
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
              : undefined,
          }))
          .filter((item: SharedLinkEntry) => Boolean(item.url));

        const bundle: SharedCategoryBundle = {
          version: 1,
          shortCode: parsed.s || generateCategoryShortCode(parsed.c, links),
          categoryName: parsed.c,
          categorySlug: parsed.c.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          categoryIcon: parsed.i || 'folder',
          categoryColor: parsed.k || '#ff9000',
          links,
          createdAt: Date.now(),
        };
        registerSharedCategoryBundle(bundle);
        return bundle;
      }
    } catch {
      return null;
    }
  }

  // Case 2: Short Code lookup in localStorage registry
  const normalizedCode = trimmed.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const digitsOnly = normalizedCode.replace(/^LH/, '');

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
      if (raw) {
        const registry: Record<string, SharedCategoryBundle> = JSON.parse(raw);
        if (registry[normalizedCode]) return registry[normalizedCode];
        if (digitsOnly && registry[digitsOnly]) return registry[digitsOnly];
      }
    } catch {
      // Ignore
    }
  }

  // Case 3: Check if the short code matches any current category in the vault
  for (const cat of existingCategories) {
    const catLinks = existingLinks.filter((l) => l.categorySlug === cat.slug);
    const { bundle } = encodeCategorySharePayload(cat, catLinks);
    const candidateNorm = bundle.shortCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const candidateDigits = candidateNorm.replace(/^LH/, '');
    if (normalizedCode === candidateNorm || (digitsOnly && digitsOnly === candidateDigits)) {
      return bundle;
    }
  }

  return null;
}

/**
 * Stores a user's selected shared links before login so they are automatically imported
 * into the user's vault immediately upon authentication.
 */
export function savePendingSharedImport(pending: PendingSharedImport): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_IMPORT_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Ignore storage errors
  }
}

export function peekPendingSharedImport(): PendingSharedImport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingSharedImport;
  } catch {
    return null;
  }
}

export function consumePendingSharedImport(): PendingSharedImport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_IMPORT_STORAGE_KEY);
    return JSON.parse(raw) as PendingSharedImport;
  } catch {
    return null;
  }
}
