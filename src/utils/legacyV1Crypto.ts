/**
 * READ-ONLY Legacy v1.0.0 Vault Decoder (`ENC1:` / `LHPRIV1:`).
 *
 * Strictly reserved for detecting, unlocking, and migrating existing v1.0.0 user data
 * to LinkHub v2.0.0 AES-256-GCM (`ENC2:` / `LHPRIV2:`).
 * Zero encryption helpers exist in this module; new writes NEVER use v1 formats.
 */
import type { Category, LinkItem } from '../types.ts';

const LEGACY_ENC_PREFIX = 'ENC1:';
const LEGACY_PRIV_DESC_PREFIX = 'LHPRIV1:';
const LEGACY_ENCRYPTED_URL_PREFIX = 'https://encrypted.linkhub.vault/ENC1:';

function fromBase64UrlBytes(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function deriveLegacyStream(secret: string, salt: string, length: number): Uint8Array {
  const seedInput = `linkhub-v1|${secret}|${salt}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < seedInput.length; i++) {
      const ch = seedInput.charCodeAt(i) ^ (round & 0xff);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= (ch + round) & 0xff;
      h2 = Math.imul(h2, 0x1000193b);
    }
  }

  const out = new Uint8Array(length);
  let s0 = h1 >>> 0 || 0x12345678;
  let s1 = h2 >>> 0 || 0x9abcdef0;
  for (let i = 0; i < length; i++) {
    s0 ^= s0 << 13;
    s0 ^= s0 >>> 17;
    s0 ^= s0 << 5;
    s1 = Math.imul(s1 ^ (s0 >>> 3), 0x27d4eb2d);
    out[i] = ((s0 ^ s1) >>> ((i % 4) * 8)) & 0xff;
  }
  return out;
}

export function isLegacyEncryptedField(value?: string): boolean {
  if (!value) return false;
  return value.startsWith(LEGACY_ENC_PREFIX) || value.startsWith(LEGACY_ENCRYPTED_URL_PREFIX);
}

export function isLegacyCategory(cat: Pick<Category, 'description' | 'name' | 'privateVaultMeta'>): boolean {
  if (cat.privateVaultMeta?.startsWith('LHPRIV2:')) return false;
  return Boolean(
    cat.description?.startsWith(LEGACY_PRIV_DESC_PREFIX) ||
    cat.name?.startsWith(LEGACY_ENC_PREFIX)
  );
}

export function isLegacyLink(link: Pick<LinkItem, 'title' | 'url' | 'description'>): boolean {
  return (
    isLegacyEncryptedField(link.title) ||
    isLegacyEncryptedField(link.url) ||
    isLegacyEncryptedField(link.description)
  );
}

export function computeLegacyV1PinHash(pin: string, categorySlug: string): string {
  const cleanPin = (pin || '').replace(/\D/g, '').slice(0, 6);
  const normSlug = (categorySlug || '').toLowerCase().trim();
  const bytes = deriveLegacyStream(cleanPin, `pin-verify:${normSlug}`, 6);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function verifyLegacyV1Pin(
  enteredPin: string,
  categorySlug: string,
  storedPinHash?: string
): boolean {
  if (!storedPinHash) return false;
  return computeLegacyV1PinHash(enteredPin, categorySlug) === storedPinHash;
}

export function decryptLegacyV1Field(cipherText: string, secretKey: string): string {
  if (!cipherText || !cipherText.startsWith(LEGACY_ENC_PREFIX)) return cipherText;
  try {
    const rest = cipherText.slice(LEGACY_ENC_PREFIX.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) return cipherText;
    const salt = rest.slice(0, colonIdx);
    const cipherBytes = fromBase64UrlBytes(rest.slice(colonIdx + 1));
    const keyStream = deriveLegacyStream(secretKey, salt, cipherBytes.length);
    const plainBytes = new Uint8Array(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      plainBytes[i] = cipherBytes[i] ^ keyStream[i];
    }
    return new TextDecoder().decode(plainBytes);
  } catch {
    return cipherText;
  }
}

export function extractLegacyV1PinHash(cat: Pick<Category, 'description' | 'privatePinHash'>): string {
  if (cat.description?.startsWith(LEGACY_PRIV_DESC_PREFIX)) {
    const body = cat.description.slice(LEGACY_PRIV_DESC_PREFIX.length);
    const idx = body.indexOf(':');
    if (idx !== -1) return body.slice(0, idx);
  }
  return cat.privatePinHash || '';
}

export function decodeLegacyCategoryPlaintext(
  cat: Pick<Category, 'name' | 'slug' | 'description' | 'privatePinHash'>,
  userId: string
): { name: string; description: string; legacyPinHash: string } {
  const normSlug = (cat.slug || '').toLowerCase().trim();
  const legacyPinHash = extractLegacyV1PinHash(cat);
  const metaKey = `vaultmeta:${userId || 'default'}:${normSlug}`;
  const name = cat.name?.startsWith(LEGACY_ENC_PREFIX)
    ? decryptLegacyV1Field(cat.name, metaKey)
    : cat.name || 'Private Category';

  let description = cat.description || '';
  if (description.startsWith(LEGACY_PRIV_DESC_PREFIX)) {
    const body = description.slice(LEGACY_PRIV_DESC_PREFIX.length);
    const idx = body.indexOf(':');
    if (idx !== -1 && legacyPinHash) {
      const encDesc = body.slice(idx + 1);
      const dataKey = `catkey:${normSlug}:${legacyPinHash}`;
      description = encDesc ? decryptLegacyV1Field(encDesc, dataKey) : '';
    } else {
      description = '';
    }
  }

  return { name, description, legacyPinHash };
}

export function decryptLegacyLinkPlaintext(
  link: LinkItem,
  categorySlug: string,
  legacyPinHash: string
): { title: string; url: string; description: string } {
  const dataKey = `catkey:${categorySlug.toLowerCase().trim()}:${legacyPinHash}`;
  const title = link.title.startsWith(LEGACY_ENC_PREFIX)
    ? decryptLegacyV1Field(link.title, dataKey)
    : link.title;

  let url = link.url;
  if (url.startsWith(LEGACY_ENCRYPTED_URL_PREFIX)) {
    const encPart = LEGACY_ENC_PREFIX + url.slice(LEGACY_ENCRYPTED_URL_PREFIX.length);
    url = decryptLegacyV1Field(encPart, dataKey);
  } else if (url.startsWith(LEGACY_ENC_PREFIX)) {
    url = decryptLegacyV1Field(url, dataKey);
  }

  const description = link.description?.startsWith(LEGACY_ENC_PREFIX)
    ? decryptLegacyV1Field(link.description, dataKey)
    : link.description || '';

  return { title, url, description };
}
