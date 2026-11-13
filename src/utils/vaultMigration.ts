/**
 * LinkHub v1.0.0 -> v2.0.0 Private Vault Migration Engine
 *
 * Safely migrates legacy ENC1 / LHPRIV1 records to Web Crypto AES-256-GCM (ENC2 / LHPRIV2):
 * 1. Detects legacy v1 formats on category unlock.
 * 2. Verifies the user's v1 PIN before decryption.
 * 3. Decrypts legacy v1 plaintexts into memory.
 * 4. Re-encrypts with a fresh random 256-bit DEK wrapped by PBKDF2-SHA256.
 * 5. Cryptographically verifies every field decrypts back to identical plaintext.
 * 6. Records checkpoint metadata so interrupted commits recover without losing v1 records.
 */
import type { Category, LinkItem } from '../types.ts';
import {
  isLegacyCategory,
  isLegacyLink,
  verifyLegacyV1Pin,
  decodeLegacyCategoryPlaintext,
  decryptLegacyLinkPlaintext,
} from './legacyV1Crypto.ts';
import {
  V2_ENC_URL_PREFIX,
  createPrivateCategoryVaultV2,
  unlockPrivateCategoryVaultV2,
  encryptFieldV2,
  decryptFieldV2,
  V2_PBKDF2_ITERATIONS,
} from './vaultCryptoV2.ts';

export interface MigrationCheckpoint {
  categoryId: string;
  categorySlug: string;
  startedAt: number;
  status: 'pending' | 'verified' | 'committed' | 'failed';
  migratedLinkIds: string[];
}

export interface CategoryMigrationResult {
  upgradedCategory: Category;
  upgradedLinks: LinkItem[];
  decryptedName: string;
  decryptedDescription: string;
  dek: CryptoKey;
  verifiedCount: number;
  backupLinks: LinkItem[];
}

export function needsVaultMigration(category: Category, categoryLinks: LinkItem[]): boolean {
  if (category.privateVaultMeta?.startsWith('LHPRIV2:') && !categoryLinks.some(isLegacyLink)) {
    return false;
  }
  return Boolean(category.isPrivate && (isLegacyCategory(category) || categoryLinks.some(isLegacyLink)));
}

export function saveMigrationCheckpoint(userId: string, ckpt: MigrationCheckpoint): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(`linkhub_v2_mig_${userId}_${ckpt.categorySlug}`, JSON.stringify(ckpt));
  } catch {}
}

export function clearMigrationCheckpoint(userId: string, categorySlug: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(`linkhub_v2_mig_${userId}_${categorySlug}`);
  } catch {}
}

export async function migrateLegacyCategoryToV2(params: {
  userId: string;
  legacyCategory: Category;
  categoryLinks: LinkItem[];
  enteredPin: string;
  iterations?: number;
}): Promise<CategoryMigrationResult> {
  const {
    userId,
    legacyCategory,
    categoryLinks,
    enteredPin,
    iterations = V2_PBKDF2_ITERATIONS,
  } = params;

  const normSlug = legacyCategory.slug.toLowerCase().trim();
  const decodedMeta = decodeLegacyCategoryPlaintext(legacyCategory, userId);

  if (!verifyLegacyV1Pin(enteredPin, normSlug, decodedMeta.legacyPinHash)) {
    throw new Error('Cannot migrate legacy vault: invalid PIN.');
  }

  // Keep full immutable snapshot of original records in case verification fails
  const backupLinks = categoryLinks.map((l) => ({ ...l, tags: [...l.tags] }));

  // Step 1: Decrypt all legacy v1 link plaintexts in memory
  const decryptedItems = categoryLinks.map((link) => {
    const plain = decryptLegacyLinkPlaintext(link, normSlug, decodedMeta.legacyPinHash);
    return { original: link, plain };
  });

  // Step 2: Provision fresh v2 256-bit DEK & PBKDF2-wrapped metadata
  const v2Vault = await createPrivateCategoryVaultV2({
    userId,
    categorySlug: normSlug,
    categoryName: decodedMeta.name,
    categoryDescription: decodedMeta.description,
    pin: enteredPin,
    iterations,
  });

  // Step 3: Re-encrypt every link using AES-256-GCM + AAD
  const upgradedLinks: LinkItem[] = [];
  for (const { original, plain } of decryptedItems) {
    const encTitle = await encryptFieldV2({
      plaintext: plain.title,
      dek: v2Vault.dek,
      userId,
      categorySlug: normSlug,
      linkId: original.id,
      fieldName: 'title',
    });
    const encUrlToken = await encryptFieldV2({
      plaintext: plain.url,
      dek: v2Vault.dek,
      userId,
      categorySlug: normSlug,
      linkId: original.id,
      fieldName: 'url',
    });
    const encDesc = plain.description
      ? await encryptFieldV2({
          plaintext: plain.description,
          dek: v2Vault.dek,
          userId,
          categorySlug: normSlug,
          linkId: original.id,
          fieldName: 'description',
        })
      : '';

    upgradedLinks.push({
      ...original,
      title: encTitle,
      url: `${V2_ENC_URL_PREFIX}${encUrlToken.slice('ENC2:'.length)}`,
      description: encDesc,
      imageUrl: '',
      faviconUrl: '',
      isEncrypted: true,
      cryptoVersion: 2,
      updatedAt: Date.now(),
    });
  }

  // Step 4: Mandatory round-trip verification using fresh PIN unwrap before replacing legacy data
  const verifyUnlock = await unlockPrivateCategoryVaultV2({
    userId,
    categorySlug: normSlug,
    privateVaultMeta: v2Vault.privateVaultMeta,
    pin: enteredPin,
  });

  if (
    verifyUnlock.name !== decodedMeta.name ||
    verifyUnlock.description !== decodedMeta.description
  ) {
    throw new Error('Migration verification failed on category metadata; original v1 data preserved.');
  }

  for (let i = 0; i < upgradedLinks.length; i++) {
    const candidate = upgradedLinks[i];
    const expected = decryptedItems[i].plain;

    const roundTitle = await decryptFieldV2({
      ciphertext: candidate.title,
      dek: verifyUnlock.dek,
      userId,
      categorySlug: normSlug,
      linkId: candidate.id,
      fieldName: 'title',
    });
    const roundUrl = await decryptFieldV2({
      ciphertext: candidate.url,
      dek: verifyUnlock.dek,
      userId,
      categorySlug: normSlug,
      linkId: candidate.id,
      fieldName: 'url',
    });
    const roundDesc = candidate.description
      ? await decryptFieldV2({
          ciphertext: candidate.description,
          dek: verifyUnlock.dek,
          userId,
          categorySlug: normSlug,
          linkId: candidate.id,
          fieldName: 'description',
        })
      : '';

    if (
      roundTitle !== expected.title ||
      roundUrl !== expected.url ||
      roundDesc !== expected.description
    ) {
      throw new Error(
        `Migration round-trip verification failed for link ${candidate.id}; original v1 data preserved.`
      );
    }
  }

  const upgradedCategory: Category = {
    ...legacyCategory,
    name: v2Vault.encryptedName,
    description: '[Encrypted Private Vault]',
    isPrivate: true,
    privatePinHash: undefined,
    privateVaultMeta: v2Vault.privateVaultMeta,
  };

  saveMigrationCheckpoint(userId, {
    categoryId: upgradedCategory.id,
    categorySlug: normSlug,
    startedAt: Date.now(),
    status: 'verified',
    migratedLinkIds: upgradedLinks.map((l) => l.id),
  });

  return {
    upgradedCategory,
    upgradedLinks,
    decryptedName: decodedMeta.name,
    decryptedDescription: decodedMeta.description,
    dek: verifyUnlock.dek,
    verifiedCount: upgradedLinks.length,
    backupLinks,
  };
}
