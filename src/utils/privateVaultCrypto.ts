/**
 * Private Vault Coordination Layer (LinkHub v2.0.0)
 *
 * Bridges v2 AES-256-GCM Web Crypto (`vaultCryptoV2.ts`) and read-only v1 migration (`legacyV1Crypto.ts`)
 * for categories and links without ever writing custom/insecure cryptography or plaintext PINs.
 */
import type { Category, LinkItem } from '../types.ts';
import { formatCategoryName } from './vaultLogic.ts';
import {
  V2_ENC_PREFIX,
  V2_ENC_URL_PREFIX,
  V2_PRIV_META_PREFIX,
  createPrivateCategoryVaultV2,
  unlockPrivateCategoryVaultV2,
  verifyPrivateCategoryPinV2,
  encryptFieldV2,
  decryptFieldV2,
  setActiveCategoryDek,
  getActiveCategoryDek,
  clearActiveCategoryDek,
  clearAllActiveCategoryDeks,
} from './vaultCryptoV2.ts';
import {
  isLegacyEncryptedField,
  isLegacyCategory,
  verifyLegacyV1Pin,
  extractLegacyV1PinHash,
  decodeLegacyCategoryPlaintext,
} from './legacyV1Crypto.ts';

export {
  setActiveCategoryDek,
  getActiveCategoryDek,
  clearActiveCategoryDek,
  clearAllActiveCategoryDeks,
};

export function isLinkEncrypted(link: Pick<LinkItem, 'title' | 'url' | 'description' | 'isEncrypted'>): boolean {
  return (
    Boolean(link.isEncrypted) ||
    Boolean(link.title?.startsWith(V2_ENC_PREFIX)) ||
    Boolean(link.url?.startsWith(V2_ENC_URL_PREFIX)) ||
    Boolean(link.description?.startsWith(V2_ENC_PREFIX)) ||
    isLegacyEncryptedField(link.title) ||
    isLegacyEncryptedField(link.url) ||
    isLegacyEncryptedField(link.description)
  );
}

/**
 * Verifies a 6-digit private category PIN against either v2 PBKDF2 metadata or legacy v1 hash.
 */
export async function verifyPrivateCategoryPinAsync(
  enteredPin: string,
  category: Category,
  userId: string
): Promise<boolean> {
  if (category.privateVaultMeta?.startsWith(V2_PRIV_META_PREFIX)) {
    return verifyPrivateCategoryPinV2({
      userId,
      categorySlug: category.slug,
      privateVaultMeta: category.privateVaultMeta,
      pin: enteredPin,
    });
  }
  const legacyHash = extractLegacyV1PinHash(category);
  return verifyLegacyV1Pin(enteredPin, category.slug, legacyHash);
}

/**
 * Synchronous lightweight decoder for category list rendering when private category metadata is stored.
 */
export function decodeCategoryFromStorage(rawCat: Category, userId: string): Category {
  const isV2 = Boolean(rawCat.privateVaultMeta?.startsWith(V2_PRIV_META_PREFIX));
  const isV1 = isLegacyCategory(rawCat);

  if (!rawCat.isPrivate && !isV2 && !isV1) {
    return {
      ...rawCat,
      name: formatCategoryName(rawCat.name || 'General'),
      isPrivate: false,
    };
  }

  if (isV2) {
    // Until unlocked with PIN, display masked or friendly non-sensitive category label
    const displayName = rawCat.name?.startsWith(V2_ENC_PREFIX)
      ? 'Private Vault'
      : formatCategoryName(rawCat.name || 'Private Vault');
    return {
      ...rawCat,
      name: displayName,
      description: 'Encrypted Private Category (AES-256-GCM)',
      isPrivate: true,
    };
  }

  // Legacy v1 category (preserved in memory until user unlocks & auto-migrates to v2)
  const decodedV1 = decodeLegacyCategoryPlaintext(rawCat, userId);
  return {
    ...rawCat,
    name: formatCategoryName(decodedV1.name || 'Private Vault'),
    description: decodedV1.description,
    isPrivate: true,
    privatePinHash: decodedV1.legacyPinHash,
  };
}

/**
 * Prepares a Category for Firestore storage using v2 AES-256-GCM + PBKDF2 wrapped DEK when private.
 */
export async function encodeCategoryForStorageAsync(
  cat: Partial<Category>,
  userId: string
): Promise<
  Category & {
    name: string;
    description: string;
    isPrivate: boolean;
    privateVaultMeta: string;
  }
> {
  const slug =
    (
      cat.slug ||
      (cat.name || 'private')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    ).slice(0, 60) || 'private';

  const isPrivate = Boolean(cat.isPrivate);
  if (!isPrivate) {
    clearActiveCategoryDek(userId, slug);
    return {
      ...(cat as Category),
      slug,
      name: formatCategoryName(cat.name || 'General').slice(0, 60),
      description: (cat.description || '').trim().slice(0, 240),
      isPrivate: false,
      privateVaultMeta: '',
    };
  }

  const cleanPlainName = formatCategoryName(cat.name || 'Private Vault').slice(0, 60);
  const cleanDesc = (cat.description || '').trim().slice(0, 240);
  const rawPin = (cat.privatePin || '').replace(/\D/g, '').slice(0, 6);

  if (rawPin.length === 6) {
    const v2 = await createPrivateCategoryVaultV2({
      userId,
      categorySlug: slug,
      categoryName: cleanPlainName,
      categoryDescription: cleanDesc,
      pin: rawPin,
    });
    setActiveCategoryDek(userId, slug, v2.dek);
    return {
      ...(cat as Category),
      slug,
      name: cleanPlainName,
      description: '[Encrypted Private Vault]',
      isPrivate: true,
      privateVaultMeta: v2.privateVaultMeta,
    };
  }

  // Preserving existing v2 vault metadata when updating icon/color/order without changing PIN
  if (cat.privateVaultMeta?.startsWith(V2_PRIV_META_PREFIX)) {
    return {
      ...(cat as Category),
      slug,
      name: cleanPlainName,
      description: '[Encrypted Private Vault]',
      isPrivate: true,
      privateVaultMeta: cat.privateVaultMeta,
    };
  }

  throw new Error('Please set a 6-digit security PIN for private encrypted categories.');
}

/**
 * Unlocks a v2 private category, decrypts its metadata, and caches its non-extractable DEK in RAM.
 */
export async function unlockAndStoreCategoryDek(
  userId: string,
  category: Category,
  enteredPin: string
): Promise<{ dek: CryptoKey; name: string; description: string }> {
  if (!category.privateVaultMeta?.startsWith(V2_PRIV_META_PREFIX)) {
    throw new Error('Category requires legacy migration first.');
  }
  const unlocked = await unlockPrivateCategoryVaultV2({
    userId,
    categorySlug: category.slug,
    privateVaultMeta: category.privateVaultMeta,
    pin: enteredPin,
  });
  setActiveCategoryDek(userId, category.slug, unlocked.dek);
  return unlocked;
}

/**
 * Encrypts a LinkItem using AES-256-GCM (v2) using the category's in-memory unlocked DEK.
 */
export async function encryptLinkForStorageAsync(
  link: Partial<LinkItem>,
  userId: string,
  privateCategory?: Category | null
): Promise<Partial<LinkItem>> {
  if (!privateCategory || !privateCategory.isPrivate) {
    return link;
  }

  const dek = getActiveCategoryDek(userId, privateCategory.slug);
  if (!dek) {
    throw new Error('Unlock the private category before encrypting bookmarks.');
  }

  const linkId = link.id || `link-${Date.now()}`;
  const rawTitle = (link.title || 'Private Link').trim().slice(0, 160);
  const rawUrl = (link.url || 'https://example.com').trim().slice(0, 2048);
  const rawDesc = (link.description || '').trim().slice(0, 500);

  const encTitle = await encryptFieldV2({
    plaintext: rawTitle,
    dek,
    userId,
    categorySlug: privateCategory.slug,
    linkId,
    fieldName: 'title',
  });
  const encUrl = await encryptFieldV2({
    plaintext: rawUrl,
    dek,
    userId,
    categorySlug: privateCategory.slug,
    linkId,
    fieldName: 'url',
  });
  const encDesc = rawDesc
    ? await encryptFieldV2({
        plaintext: rawDesc,
        dek,
        userId,
        categorySlug: privateCategory.slug,
        linkId,
        fieldName: 'description',
      })
    : '';

  return {
    ...link,
    id: linkId,
    title: encTitle.slice(0, 512),
    url: `${V2_ENC_URL_PREFIX}${encUrl.slice(V2_ENC_PREFIX.length)}`.slice(0, 4096),
    description: encDesc.slice(0, 2048),
    imageUrl: '',
    faviconUrl: '',
    isEncrypted: true,
    cryptoVersion: 2,
  };
}

/**
 * Decrypts a LinkItem asynchronously in RAM when the private category DEK is unlocked.
 */
export async function decryptLinkInMemoryAsync(
  link: LinkItem,
  userId: string,
  privateCategory: Category | undefined,
  isCategoryUnlocked: boolean
): Promise<LinkItem> {
  if (!privateCategory || !privateCategory.isPrivate || !isCategoryUnlocked) {
    if (isLinkEncrypted(link)) {
      return maskedPrivateLink(link);
    }
    return link;
  }

  const dek = getActiveCategoryDek(userId, privateCategory.slug);
  if (!dek) {
    return maskedPrivateLink(link);
  }

  try {
    const title = link.title.startsWith(V2_ENC_PREFIX)
      ? await decryptFieldV2({
          ciphertext: link.title,
          dek,
          userId,
          categorySlug: privateCategory.slug,
          linkId: link.id,
          fieldName: 'title',
        })
      : link.title;

    const url =
      link.url.startsWith(V2_ENC_URL_PREFIX) || link.url.startsWith(V2_ENC_PREFIX)
        ? await decryptFieldV2({
            ciphertext: link.url,
            dek,
            userId,
            categorySlug: privateCategory.slug,
            linkId: link.id,
            fieldName: 'url',
          })
        : link.url;

    const description = link.description?.startsWith(V2_ENC_PREFIX)
      ? await decryptFieldV2({
          ciphertext: link.description,
          dek,
          userId,
          categorySlug: privateCategory.slug,
          linkId: link.id,
          fieldName: 'description',
        })
      : link.description || '';

    return {
      ...link,
      title: title || 'Private Bookmark',
      url: url || 'https://example.com',
      description,
      isEncrypted: true,
      cryptoVersion: 2,
    };
  } catch {
    return maskedPrivateLink(link);
  }
}

export function maskedPrivateLink(link: LinkItem): LinkItem {
  return {
    ...link,
    title: 'Encrypted Private Link',
    url: 'https://encrypted.linkhub.vault',
    description: 'Unlock this private category with your 6-digit security code to view.',
    isEncrypted: true,
  };
}
