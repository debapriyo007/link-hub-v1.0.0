/**
 * LinkHub v2.0.0 Production Cryptographic Engine (Web Crypto API)
 *
 * Security Guarantees:
 * - Uses only standard Web Crypto (`crypto.subtle` + `crypto.getRandomValues`).
 * - PBKDF2-HMAC-SHA256 (`210,000` iterations, random 128-bit salt) for PIN/secret key derivation & verification.
 * - Random 256-bit Data Encryption Keys (DEK) per private vault/category.
 * - AES-256-GCM authenticated encryption with unique random 96-bit (12-byte) nonces on every write.
 * - Additional Authenticated Data (AAD) binding user UID, category slug, link ID, and field name.
 * - Constant-time byte comparison for verifier validation.
 * - Raw PINs and plaintext DEKs are NEVER serialized to Firestore or localStorage.
 */

export const V2_ENC_PREFIX = 'ENC2:';
export const V2_ENC_URL_PREFIX = 'https://encrypted.linkhub.vault/ENC2:';
export const V2_PRIV_META_PREFIX = 'LHPRIV2:';
export const V2_PBKDF2_ITERATIONS = 210_000;

interface WrappedVaultMetadataV2 {
  v: 2;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  pinCheckSalt: string;
  pinCheckHash: string;
  wrapIv: string;
  wrappedDek: string;
  encName: string;
  encDesc: string;
}

function getSubtle(): SubtleCrypto {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SubtleCrypto API is required for LinkHub v2 encryption.');
  }
  return globalThis.crypto.subtle;
}

export function randomBytes(length: number): Uint8Array {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.getRandomValues) {
    throw new Error('CSPRNG crypto.getRandomValues is unavailable.');
  }
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(b64url: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64url, 'base64url'));
  }
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePbkdf2Bits(
  secret: string,
  salt: Uint8Array,
  iterations: number,
  bitLength = 256
): Promise<Uint8Array> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    bitLength
  );
  return new Uint8Array(bits);
}

async function deriveAesKeyFromSecret(
  secret: string,
  salt: Uint8Array,
  iterations: number,
  contextTag: string,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const derivedBytes = await derivePbkdf2Bits(`${contextTag}|${secret}`, salt, iterations, 256);
  return subtle.importKey('raw', toArrayBuffer(derivedBytes), { name: 'AES-GCM', length: 256 }, false, usages);
}

// ============================================================================
// Salted PBKDF2 Verifiers (Vault Lock PIN & Security Question Recovery)
// ============================================================================
export async function createSecretVerifier(
  secret: string,
  domainContext = 'vault-pin',
  iterations = V2_PBKDF2_ITERATIONS
): Promise<string> {
  const normalized = secret.trim();
  if (!normalized) {
    throw new Error('Secret cannot be empty when creating verifier.');
  }
  const salt = randomBytes(16);
  const hashBytes = await derivePbkdf2Bits(`${domainContext}|${normalized}`, salt, iterations, 256);
  return `PBKDF2_SHA256:${iterations}:${toBase64Url(salt)}:${toBase64Url(hashBytes)}`;
}

export async function verifySecretVerifier(
  candidate: string,
  encodedVerifier: string | undefined | null,
  domainContext = 'vault-pin'
): Promise<boolean> {
  if (!encodedVerifier || !encodedVerifier.startsWith('PBKDF2_SHA256:')) {
    return false;
  }
  const parts = encodedVerifier.split(':');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 2_000_000) {
    return false;
  }
  try {
    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);
    const actual = await derivePbkdf2Bits(`${domainContext}|${candidate.trim()}`, salt, iterations, expected.length * 8);
    return timingSafeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}

// ============================================================================
// AES-256-GCM Field Encryption with Random 96-bit IV & Contextual AAD
// ============================================================================
export async function generateRandomDek(): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptFieldV2(params: {
  plaintext: string;
  dek: CryptoKey;
  userId: string;
  categorySlug: string;
  linkId: string;
  fieldName: 'title' | 'url' | 'description' | 'catName' | 'catDesc';
}): Promise<string> {
  const { plaintext, dek, userId, categorySlug, linkId, fieldName } = params;
  if (!plaintext) return '';
  const subtle = getSubtle();
  const iv = randomBytes(12); // Unique random 96-bit nonce
  const aad = new TextEncoder().encode(
    `linkhub:v2:field:${userId}:${categorySlug.toLowerCase().trim()}:${linkId}:${fieldName}`
  );
  const encodedPlain = new TextEncoder().encode(plaintext);

  const cipherBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    dek,
    toArrayBuffer(encodedPlain)
  );

  return `${V2_ENC_PREFIX}${toBase64Url(iv)}:${toBase64Url(new Uint8Array(cipherBuffer))}`;
}

export async function decryptFieldV2(params: {
  ciphertext: string;
  dek: CryptoKey;
  userId: string;
  categorySlug: string;
  linkId: string;
  fieldName: 'title' | 'url' | 'description' | 'catName' | 'catDesc';
}): Promise<string> {
  const { ciphertext, dek, userId, categorySlug, linkId, fieldName } = params;
  if (!ciphertext) return '';
  const normalizedCipher = ciphertext.startsWith(V2_ENC_URL_PREFIX)
    ? V2_ENC_PREFIX + ciphertext.slice(V2_ENC_URL_PREFIX.length)
    : ciphertext;

  if (!normalizedCipher.startsWith(V2_ENC_PREFIX)) {
    throw new Error('Invalid v2 ciphertext prefix.');
  }

  const body = normalizedCipher.slice(V2_ENC_PREFIX.length);
  const sep = body.indexOf(':');
  if (sep === -1) {
    throw new Error('Malformed v2 ciphertext envelope.');
  }

  const iv = fromBase64Url(body.slice(0, sep));
  const payload = fromBase64Url(body.slice(sep + 1));
  if (iv.length !== 12) {
    throw new Error('Invalid AES-GCM nonce length.');
  }

  const subtle = getSubtle();
  const aad = new TextEncoder().encode(
    `linkhub:v2:field:${userId}:${categorySlug.toLowerCase().trim()}:${linkId}:${fieldName}`
  );

  const plainBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    dek,
    toArrayBuffer(payload)
  );

  return new TextDecoder().decode(plainBuffer);
}

// ============================================================================
// Private Category Key Hierarchy (KEK wraps random 256-bit DEK with AAD)
// ============================================================================
export async function createPrivateCategoryVaultV2(params: {
  userId: string;
  categorySlug: string;
  categoryName: string;
  categoryDescription: string;
  pin: string;
  iterations?: number;
}): Promise<{
  privateVaultMeta: string;
  encryptedName: string;
  dek: CryptoKey;
}> {
  const {
    userId,
    categorySlug,
    categoryName,
    categoryDescription,
    pin,
    iterations = V2_PBKDF2_ITERATIONS,
  } = params;

  const cleanPin = pin.replace(/\D/g, '');
  if (cleanPin.length !== 6) {
    throw new Error('A 6-digit security PIN is required to create an encrypted private category.');
  }

  const normSlug = categorySlug.toLowerCase().trim();
  const dek = await generateRandomDek();
  const subtle = getSubtle();
  const rawDekBytes = new Uint8Array(await subtle.exportKey('raw', dek));

  const salt = randomBytes(16);
  const pinCheckSalt = randomBytes(16);
  const pinCheckHashBytes = await derivePbkdf2Bits(
    `cat-pin-check:${userId}:${normSlug}|${cleanPin}`,
    pinCheckSalt,
    iterations,
    256
  );

  const kek = await deriveAesKeyFromSecret(
    cleanPin,
    salt,
    iterations,
    `cat-kek:${userId}:${normSlug}`,
    ['encrypt', 'decrypt']
  );

  const wrapIv = randomBytes(12);
  const wrapAad = new TextEncoder().encode(`linkhub:v2:dek:${userId}:${normSlug}`);
  const wrappedDekBuf = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(wrapIv),
      additionalData: toArrayBuffer(wrapAad),
      tagLength: 128,
    },
    kek,
    toArrayBuffer(rawDekBytes)
  );

  // Zero out exported DEK copy in memory
  rawDekBytes.fill(0);

  const encName = await encryptFieldV2({
    plaintext: categoryName,
    dek,
    userId,
    categorySlug: normSlug,
    linkId: '__cat__',
    fieldName: 'catName',
  });
  const encDesc = categoryDescription
    ? await encryptFieldV2({
        plaintext: categoryDescription,
        dek,
        userId,
        categorySlug: normSlug,
        linkId: '__cat__',
        fieldName: 'catDesc',
      })
    : '';

  const meta: WrappedVaultMetadataV2 = {
    v: 2,
    kdf: 'PBKDF2-SHA256',
    iter: iterations,
    salt: toBase64Url(salt),
    pinCheckSalt: toBase64Url(pinCheckSalt),
    pinCheckHash: toBase64Url(pinCheckHashBytes),
    wrapIv: toBase64Url(wrapIv),
    wrappedDek: toBase64Url(new Uint8Array(wrappedDekBuf)),
    encName,
    encDesc,
  };

  const privateVaultMeta = `${V2_PRIV_META_PREFIX}${toBase64Url(
    new TextEncoder().encode(JSON.stringify(meta))
  )}`;

  // Re-import DEK as non-extractable for runtime RAM usage
  const runtimeDek = await unlockPrivateCategoryVaultV2({
    userId,
    categorySlug: normSlug,
    privateVaultMeta,
    pin: cleanPin,
  });

  return {
    privateVaultMeta,
    encryptedName: encName.slice(0, 240),
    dek: runtimeDek.dek,
  };
}

export async function verifyPrivateCategoryPinV2(params: {
  userId: string;
  categorySlug: string;
  privateVaultMeta: string;
  pin: string;
}): Promise<boolean> {
  const { userId, categorySlug, privateVaultMeta, pin } = params;
  if (!privateVaultMeta || !privateVaultMeta.startsWith(V2_PRIV_META_PREFIX)) {
    return false;
  }
  const cleanPin = pin.replace(/\D/g, '');
  if (cleanPin.length !== 6) return false;

  try {
    const metaJson = new TextDecoder().decode(
      fromBase64Url(privateVaultMeta.slice(V2_PRIV_META_PREFIX.length))
    );
    const meta = JSON.parse(metaJson) as WrappedVaultMetadataV2;
    if (meta.v !== 2 || meta.kdf !== 'PBKDF2-SHA256') return false;

    const normSlug = categorySlug.toLowerCase().trim();
    const expected = fromBase64Url(meta.pinCheckHash);
    const actual = await derivePbkdf2Bits(
      `cat-pin-check:${userId}:${normSlug}|${cleanPin}`,
      fromBase64Url(meta.pinCheckSalt),
      meta.iter,
      expected.length * 8
    );
    return timingSafeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}

export async function unlockPrivateCategoryVaultV2(params: {
  userId: string;
  categorySlug: string;
  privateVaultMeta: string;
  pin: string;
}): Promise<{ dek: CryptoKey; name: string; description: string }> {
  const { userId, categorySlug, privateVaultMeta, pin } = params;
  const normSlug = categorySlug.toLowerCase().trim();

  const isValid = await verifyPrivateCategoryPinV2({ userId, categorySlug: normSlug, privateVaultMeta, pin });
  if (!isValid) {
    throw new Error('Invalid private category security PIN.');
  }

  const metaJson = new TextDecoder().decode(
    fromBase64Url(privateVaultMeta.slice(V2_PRIV_META_PREFIX.length))
  );
  const meta = JSON.parse(metaJson) as WrappedVaultMetadataV2;

  const kek = await deriveAesKeyFromSecret(
    pin.replace(/\D/g, ''),
    fromBase64Url(meta.salt),
    meta.iter,
    `cat-kek:${userId}:${normSlug}`,
    ['decrypt']
  );

  const subtle = getSubtle();
  const wrapAad = new TextEncoder().encode(`linkhub:v2:dek:${userId}:${normSlug}`);
  const rawDekBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(fromBase64Url(meta.wrapIv)),
      additionalData: toArrayBuffer(wrapAad),
      tagLength: 128,
    },
    kek,
    toArrayBuffer(fromBase64Url(meta.wrappedDek))
  );

  const dek = await subtle.importKey(
    'raw',
    rawDekBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  new Uint8Array(rawDekBuffer).fill(0);

  const name = meta.encName
    ? await decryptFieldV2({
        ciphertext: meta.encName,
        dek,
        userId,
        categorySlug: normSlug,
        linkId: '__cat__',
        fieldName: 'catName',
      })
    : 'Private Category';

  const description = meta.encDesc
    ? await decryptFieldV2({
        ciphertext: meta.encDesc,
        dek,
        userId,
        categorySlug: normSlug,
        linkId: '__cat__',
        fieldName: 'catDesc',
      })
    : '';

  return { dek, name, description };
}

// ============================================================================
// In-Memory Session Key Store (Cleared on Lock / Tab Switch / Sign-Out)
// ============================================================================
const activeDekMap = new Map<string, CryptoKey>();

function makeKeyId(userId: string, categorySlug: string): string {
  return `${userId}:${categorySlug.toLowerCase().trim()}`;
}

export function setActiveCategoryDek(userId: string, categorySlug: string, dek: CryptoKey): void {
  activeDekMap.set(makeKeyId(userId, categorySlug), dek);
}

export function getActiveCategoryDek(userId: string, categorySlug: string): CryptoKey | undefined {
  return activeDekMap.get(makeKeyId(userId, categorySlug));
}

export function clearActiveCategoryDek(userId: string, categorySlug: string): void {
  activeDekMap.delete(makeKeyId(userId, categorySlug));
}

export function clearAllActiveCategoryDeks(): void {
  activeDekMap.clear();
}
