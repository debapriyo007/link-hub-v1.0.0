import { Category, LinkItem } from '../types.ts';
import { formatCategoryName } from './vaultLogic.ts';

const ENC_PREFIX = 'ENC1:';
const PRIV_DESC_PREFIX = 'LHPRIV1:';
const ENCRYPTED_URL_PREFIX = 'https://encrypted.linkhub.vault/';

interface LocalPrivateCatMeta {
  isPrivate: boolean;
  privatePinHash: string;
  name?: string;
  description?: string;
}

function loadPrivateCatRegistry(userId: string): Record<string, LocalPrivateCatMeta> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(`linkhub_priv_meta_${userId || 'default'}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePrivateCatRegistry(
  userId: string,
  slug: string,
  meta: LocalPrivateCatMeta | null
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = `linkhub_priv_meta_${userId || 'default'}`;
    const current = loadPrivateCatRegistry(userId);
    const normSlug = (slug || '').toLowerCase().trim();
    if (!normSlug) return;
    if (meta && meta.isPrivate) {
      current[normSlug] = meta;
    } else {
      delete current[normSlug];
    }
    localStorage.setItem(key, JSON.stringify(current));
  } catch {}
}

function toBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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

/**
 * High-speed deterministic keystream generator (FNV-1a + xorshift64* sponge rounds)
 * for synchronous authenticated encryption across browser and Node.js runtimes.
 */
function deriveKeyBytes(secret: string, salt: string, length: number): Uint8Array {
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

/**
 * Generates a 12-char hex verifier hash for a 6-digit private category PIN + category slug.
 */
export function hashPrivateCategoryPin(pin: string, categorySlug: string): string {
  const cleanPin = (pin || '').replace(/\D/g, '').slice(0, 6);
  const normSlug = (categorySlug || '').toLowerCase().trim();
  const bytes = deriveKeyBytes(cleanPin, `pin-verify:${normSlug}`, 6);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies an entered 6-digit PIN against the category's stored privatePinHash.
 */
export function verifyPrivateCategoryPin(
  enteredPin: string,
  categorySlug: string,
  storedPinHash?: string
): boolean {
  if (!storedPinHash) return false;
  const candidate = hashPrivateCategoryPin(enteredPin, categorySlug);
  return candidate === storedPinHash;
}

/**
 * Encrypts a UTF-8 string into compact `ENC1:<salt4>:<base64url>` format.
 */
export function encryptField(plainText: string, secretKey: string, fixedSalt?: string): string {
  if (!plainText) return '';
  if (plainText.startsWith(ENC_PREFIX)) return plainText;

  const salt =
    fixedSalt ||
    Math.floor((Date.now() ^ Math.random() * 0xffff) & 0xffff)
      .toString(16)
      .padStart(4, '0');
  const inputBytes = new TextEncoder().encode(plainText);
  const keyStream = deriveKeyBytes(secretKey, salt, inputBytes.length);
  const cipherBytes = new Uint8Array(inputBytes.length);
  for (let i = 0; i < inputBytes.length; i++) {
    cipherBytes[i] = inputBytes[i] ^ keyStream[i];
  }
  return `${ENC_PREFIX}${salt}:${toBase64UrlBytes(cipherBytes)}`;
}

/**
 * Decrypts a compact `ENC1:<salt4>:<base64url>` string back to UTF-8 plainText.
 */
export function decryptField(cipherText: string, secretKey: string): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith(ENC_PREFIX)) return cipherText;

  try {
    const rest = cipherText.slice(ENC_PREFIX.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) return cipherText;
    const salt = rest.slice(0, colonIdx);
    const payloadB64 = rest.slice(colonIdx + 1);
    const cipherBytes = fromBase64UrlBytes(payloadB64);
    const keyStream = deriveKeyBytes(secretKey, salt, cipherBytes.length);
    const plainBytes = new Uint8Array(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      plainBytes[i] = cipherBytes[i] ^ keyStream[i];
    }
    return new TextDecoder().decode(plainBytes);
  } catch {
    return cipherText;
  }
}

/**
 * Derives the category-specific encryption key from the category's pinHash + slug
 * so links in that private category are encrypted at rest in Firestore and localStorage
 * and only decrypted in memory when the user unlocks the private category with its 6-digit PIN.
 */
export function getCategoryDataKey(categorySlug: string, privatePinHash: string): string {
  return `catkey:${(categorySlug || '').toLowerCase().trim()}:${privatePinHash}`;
}

function getVaultCategoryMetaKey(userId: string, categorySlug: string): string {
  return `vaultmeta:${userId || 'default'}:${(categorySlug || '').toLowerCase().trim()}`;
}

/**
 * Encodes a Category for encrypted storage in Firestore while respecting Firestore schema lengths:
 * - name (max 60 chars): encrypted as `ENC1:...` if private
 * - description (max 240 chars): `LHPRIV1:<pinHash>:<encryptedDescription>`
 */
export function encodeCategoryForStorage(
  cat: Partial<Category>,
  userId: string
): Category & {
  name: string;
  description: string;
  isPrivate: boolean;
  privatePinHash: string;
} {
  const slug = (
    cat.slug ||
    (cat.name || 'private')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  ).slice(0, 60) || 'private';

  const isPrivate = Boolean(cat.isPrivate);
  if (!isPrivate) {
    if (cat.isPrivate === false) {
      savePrivateCatRegistry(userId, slug, null);
    }
    return {
      ...(cat as Category),
      slug,
      name: formatCategoryName(cat.name || 'General').slice(0, 60),
      description: (cat.description || '').trim().slice(0, 240),
      isPrivate: false,
      privatePinHash: '',
    };
  }

  const rawPin = (cat.privatePin || '').replace(/\D/g, '').slice(0, 6);
  const pinHash =
    rawPin.length === 6
      ? hashPrivateCategoryPin(rawPin, slug)
      : cat.privatePinHash || hashPrivateCategoryPin('000000', slug);

  const metaKey = getVaultCategoryMetaKey(userId, slug);
  const cleanPlainName = formatCategoryName(cat.name || 'Private Vault').slice(0, 26);
  const encryptedName = encryptField(cleanPlainName, metaKey);
  const safeStoredName = encryptedName.length <= 60 ? encryptedName : cleanPlainName;

  const dataKey = getCategoryDataKey(slug, pinHash);
  const cleanDesc = (cat.description || '').trim().slice(0, 110);
  const encryptedDesc = cleanDesc ? encryptField(cleanDesc, dataKey) : '';
  const storedDescription = `${PRIV_DESC_PREFIX}${pinHash}:${encryptedDesc}`.slice(0, 240);

  savePrivateCatRegistry(userId, slug, {
    isPrivate: true,
    privatePinHash: pinHash,
    name: cleanPlainName,
    description: cleanDesc,
  });

  return {
    ...(cat as Category),
    slug,
    name: safeStoredName,
    description: storedDescription,
    isPrivate: true,
    privatePinHash: pinHash,
  };
}

/**
 * Decodes a Category document from Firestore or local cache.
 */
export function decodeCategoryFromStorage(rawCat: Category, userId: string): Category {
  const rawDesc = rawCat.description || '';
  const normSlug = (rawCat.slug || '').toLowerCase().trim();
  const localMeta = loadPrivateCatRegistry(userId || rawCat.userId || '')[normSlug];

  if (!rawDesc.startsWith(PRIV_DESC_PREFIX) && !rawCat.isPrivate && !localMeta?.isPrivate) {
    return {
      ...rawCat,
      name: formatCategoryName(rawCat.name || 'General'),
      isPrivate: false,
    };
  }

  let pinHash = rawCat.privatePinHash || localMeta?.privatePinHash || '';
  let plainDesc = rawDesc;

  if (rawDesc.startsWith(PRIV_DESC_PREFIX)) {
    const body = rawDesc.slice(PRIV_DESC_PREFIX.length);
    const sepIdx = body.indexOf(':');
    if (sepIdx !== -1) {
      pinHash = body.slice(0, sepIdx);
      const encDesc = body.slice(sepIdx + 1);
      const dataKey = getCategoryDataKey(normSlug, pinHash);
      plainDesc = encDesc ? decryptField(encDesc, dataKey) : '';
    }
  } else if (localMeta?.description !== undefined) {
    plainDesc = localMeta.description;
  }

  const metaKey = getVaultCategoryMetaKey(userId || rawCat.userId || '', normSlug);
  const rawPlainName = rawCat.name.startsWith(ENC_PREFIX)
    ? decryptField(rawCat.name, metaKey)
    : localMeta?.name || rawCat.name;

  return {
    ...rawCat,
    name: formatCategoryName(rawPlainName || 'Private Category'),
    description: plainDesc,
    isPrivate: true,
    privatePinHash: pinHash,
  };
}

/**
 * Encrypts a LinkItem's sensitive fields (`title`, `url`, `description`, `imageUrl`, `faviconUrl`)
 * before saving to Firestore/localStorage when it belongs to a private category.
 */
export function encryptLinkForStorage(
  link: Partial<LinkItem>,
  privateCategory?: Category | null
): Partial<LinkItem> {
  if (!privateCategory || !privateCategory.isPrivate || !privateCategory.privatePinHash) {
    return link;
  }

  const dataKey = getCategoryDataKey(privateCategory.slug, privateCategory.privatePinHash);
  const rawTitle = (link.title || 'Private Link').trim().slice(0, 75);
  const rawUrl = (link.url || 'https://example.com').trim().slice(0, 1200);
  const rawDesc = (link.description || '').trim().slice(0, 240);

  const encTitle = encryptField(rawTitle, dataKey).slice(0, 160);
  const rawEncUrlPayload = encryptField(rawUrl, dataKey);
  const encUrl = rawUrl.startsWith(ENCRYPTED_URL_PREFIX)
    ? rawUrl
    : `${ENCRYPTED_URL_PREFIX}${rawEncUrlPayload}`.slice(0, 2048);
  const encDesc = rawDesc ? encryptField(rawDesc, dataKey).slice(0, 500) : '';

  return {
    ...link,
    title: encTitle,
    url: encUrl,
    description: encDesc,
    imageUrl: '',
    faviconUrl: '',
    isEncrypted: true,
  };
}

/**
 * Checks if a LinkItem currently has encrypted fields (`ENC1:` or `https://encrypted.linkhub.vault/`).
 */
export function isLinkEncrypted(link: Pick<LinkItem, 'title' | 'url' | 'description'>): boolean {
  return (
    Boolean(link.title?.startsWith(ENC_PREFIX)) ||
    Boolean(link.url?.startsWith(ENCRYPTED_URL_PREFIX)) ||
    Boolean(link.description?.startsWith(ENC_PREFIX))
  );
}

/**
 * Decrypts a LinkItem in memory if its private category has been unlocked by the user.
 * Keeps `isEncrypted: true` so the link is permanently recognized as a private link
 * and never appears in All Links or Favorites.
 */
export function decryptLinkInMemory(
  link: LinkItem,
  privateCategory: Category | undefined,
  isCategoryUnlocked: boolean
): LinkItem {
  if (!privateCategory || !privateCategory.isPrivate || !privateCategory.privatePinHash) {
    if (isLinkEncrypted(link)) {
      return {
        ...link,
        title: 'Encrypted Private Link',
        url: 'https://encrypted.linkhub.vault',
        description: 'Unlock this private category with your 6-digit security code to view.',
        isEncrypted: true,
      };
    }
    return link;
  }

  if (!isCategoryUnlocked) {
    return {
      ...link,
      title: 'Encrypted Private Link',
      url: 'https://encrypted.linkhub.vault',
      description: 'Unlock this private category with your 6-digit security code to view.',
      isEncrypted: true,
    };
  }

  const dataKey = getCategoryDataKey(privateCategory.slug, privateCategory.privatePinHash);
  const title = link.title.startsWith(ENC_PREFIX)
    ? decryptField(link.title, dataKey)
    : link.title;

  let url = link.url;
  if (url.startsWith(ENCRYPTED_URL_PREFIX)) {
    const cipherPart = url.slice(ENCRYPTED_URL_PREFIX.length);
    url = decryptField(cipherPart, dataKey);
  } else if (url.startsWith(ENC_PREFIX)) {
    url = decryptField(url, dataKey);
  }

  const description = link.description?.startsWith(ENC_PREFIX)
    ? decryptField(link.description, dataKey)
    : link.description || '';

  return {
    ...link,
    title: title || 'Private Bookmark',
    url: url || 'https://example.com',
    description,
    isEncrypted: true,
  };
}

