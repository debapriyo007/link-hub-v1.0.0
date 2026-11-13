import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V2_ENC_PREFIX,
  V2_ENC_URL_PREFIX,
  V2_PRIV_META_PREFIX,
  createPrivateCategoryVaultV2,
  createSecretVerifier,
  decryptFieldV2,
  encryptFieldV2,
  unlockPrivateCategoryVaultV2,
  verifyPrivateCategoryPinV2,
  verifySecretVerifier,
} from '../src/utils/vaultCryptoV2.ts';
import {
  clearMigrationCheckpoint,
  migrateLegacyCategoryToV2,
  needsVaultMigration,
} from '../src/utils/vaultMigration.ts';
import { computeLegacyV1PinHash } from '../src/utils/legacyV1Crypto.ts';
import type { Category, LinkItem } from '../src/types.ts';

// Minimal test-only encoder mirroring v1.0.0 stream cipher strictly to synthesize legacy fixtures
function synthesizeLegacyStream(secret: string, salt: string, length: number): Uint8Array {
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

function encodeLegacyFixtureField(plaintext: string, key: string, salt: string): string {
  const plainBytes = new TextEncoder().encode(plaintext);
  const stream = synthesizeLegacyStream(key, salt, plainBytes.length);
  const cipher = new Uint8Array(plainBytes.length);
  for (let i = 0; i < plainBytes.length; i++) {
    cipher[i] = plainBytes[i] ^ stream[i];
  }
  return `ENC1:${salt}:${Buffer.from(cipher).toString('base64url')}`;
}

test('PBKDF2-SHA256 secret verifiers validate matching secrets and enforce domain separation', async () => {
  const pinVerifier = await createSecretVerifier('482910', 'vault-pin', 20_000);
  assert.ok(pinVerifier.startsWith('PBKDF2_SHA256:20000:'));

  assert.equal(await verifySecretVerifier('482910', pinVerifier, 'vault-pin'), true);
  assert.equal(await verifySecretVerifier('999999', pinVerifier, 'vault-pin'), false);
  // Domain separation: same secret verified against wrong context must fail
  assert.equal(await verifySecretVerifier('482910', pinVerifier, 'recovery-answer'), false);
  assert.equal(await verifySecretVerifier('482910', 'not-a-verifier', 'vault-pin'), false);
});

test('Private category vault v2 wraps random 256-bit DEKs and encrypts fields with unique 96-bit IVs and strict AAD', async () => {
  const userId = 'user_alpha_1';
  const categorySlug = 'secret-docs';

  const vaultA = await createPrivateCategoryVaultV2({
    userId,
    categorySlug,
    categoryName: 'Executive Keys',
    categoryDescription: 'Sensitive architectural documents',
    pin: '739105',
    iterations: 20_000,
  });

  const vaultB = await createPrivateCategoryVaultV2({
    userId,
    categorySlug,
    categoryName: 'Executive Keys',
    categoryDescription: 'Sensitive architectural documents',
    pin: '739105',
    iterations: 20_000,
  });

  assert.ok(vaultA.privateVaultMeta.startsWith(V2_PRIV_META_PREFIX));
  assert.notEqual(vaultA.privateVaultMeta, vaultB.privateVaultMeta, 'Salts/IVs/DEKs must be random per vault');

  assert.equal(
    await verifyPrivateCategoryPinV2({
      userId,
      categorySlug,
      privateVaultMeta: vaultA.privateVaultMeta,
      pin: '739105',
    }),
    true
  );
  assert.equal(
    await verifyPrivateCategoryPinV2({
      userId,
      categorySlug,
      privateVaultMeta: vaultA.privateVaultMeta,
      pin: '000000',
    }),
    false
  );

  // Wrong userId or slug binds AAD / domain and rejects PIN
  assert.equal(
    await verifyPrivateCategoryPinV2({
      userId: 'attacker_uid',
      categorySlug,
      privateVaultMeta: vaultA.privateVaultMeta,
      pin: '739105',
    }),
    false
  );

  const unlocked = await unlockPrivateCategoryVaultV2({
    userId,
    categorySlug,
    privateVaultMeta: vaultA.privateVaultMeta,
    pin: '739105',
  });
  assert.equal(unlocked.name, 'Executive Keys');
  assert.equal(unlocked.description, 'Sensitive architectural documents');

  // Encrypt identical plaintext twice and assert unique nonces/ciphertexts
  const c1 = await encryptFieldV2({
    plaintext: 'https://internal.example.com/roadmap',
    dek: unlocked.dek,
    userId,
    categorySlug,
    linkId: 'link_1',
    fieldName: 'url',
  });
  const c2 = await encryptFieldV2({
    plaintext: 'https://internal.example.com/roadmap',
    dek: unlocked.dek,
    userId,
    categorySlug,
    linkId: 'link_1',
    fieldName: 'url',
  });

  assert.ok(c1.startsWith(V2_ENC_PREFIX));
  assert.notEqual(c1, c2, 'AES-GCM must produce distinct random 96-bit IVs on every encryption');

  const decrypted = await decryptFieldV2({
    ciphertext: c1,
    dek: unlocked.dek,
    userId,
    categorySlug,
    linkId: 'link_1',
    fieldName: 'url',
  });
  assert.equal(decrypted, 'https://internal.example.com/roadmap');

  // AAD binding: relocating ciphertext to another linkId, fieldName, or userId must fail GCM authentication
  await assert.rejects(() =>
    decryptFieldV2({
      ciphertext: c1,
      dek: unlocked.dek,
      userId,
      categorySlug,
      linkId: 'link_2',
      fieldName: 'url',
    })
  );
  await assert.rejects(() =>
    decryptFieldV2({
      ciphertext: c1,
      dek: unlocked.dek,
      userId: 'other_user',
      categorySlug,
      linkId: 'link_1',
      fieldName: 'url',
    })
  );
  await assert.rejects(() =>
    decryptFieldV2({
      ciphertext: c1,
      dek: unlocked.dek,
      userId,
      categorySlug,
      linkId: 'link_1',
      fieldName: 'title',
    })
  );

  // Tampered ciphertext byte must fail GCM tag verification
  const mutated = c1.slice(0, -2) + (c1.endsWith('AA') ? 'BB' : 'AA');
  await assert.rejects(() =>
    decryptFieldV2({
      ciphertext: mutated,
      dek: unlocked.dek,
      userId,
      categorySlug,
      linkId: 'link_1',
      fieldName: 'url',
    })
  );
});

test('Legacy v1 -> v2 migration decrypts v1 records, upgrades to AES-256-GCM, verifies round-trip, and checkpoints safely', async () => {
  const userId = 'legacy_user_99';
  const slug = 'finance-vault';
  const legacyPin = '246810';
  const legacyPinHash = computeLegacyV1PinHash(legacyPin, slug);

  const metaKey = `vaultmeta:${userId}:${slug}`;
  const dataKey = `catkey:${slug}:${legacyPinHash}`;

  const legacyCategory: Category = {
    id: 'cat_legacy_1',
    name: encodeLegacyFixtureField('Tax & Banking', metaKey, 'salt_name_1'),
    slug,
    color: '#ff9000',
    icon: 'lock',
    description: `LHPRIV1:${legacyPinHash}:${encodeLegacyFixtureField('Personal finance records', dataKey, 'salt_desc_1')}`,
    isDefault: false,
    isPrivate: true,
    privatePinHash: legacyPinHash,
    order: 3,
    createdAt: 1700000000000,
  };

  const legacyLinks: LinkItem[] = [
    {
      id: 'link_legacy_1',
      title: encodeLegacyFixtureField('IRS Account Portal', dataKey, 'salt_t1'),
      url: `https://encrypted.linkhub.vault/${encodeLegacyFixtureField('https://irs.gov/account', dataKey, 'salt_u1')}`,
      categorySlug: slug,
      description: encodeLegacyFixtureField('Quarterly filings and transcripts', dataKey, 'salt_d1'),
      tags: ['tax', 'finance'],
      isFavorite: true,
      clickCount: 4,
      imageUrl: '',
      faviconUrl: '',
      isEncrypted: true,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  ];

  assert.equal(needsVaultMigration(legacyCategory, legacyLinks), true);

  // Wrong PIN must throw and never corrupt legacy data
  await assert.rejects(
    () =>
      migrateLegacyCategoryToV2({
        userId,
        legacyCategory,
        categoryLinks: legacyLinks,
        enteredPin: '000000',
        iterations: 20_000,
      }),
    /invalid PIN/i
  );

  // Valid PIN performs full v1->v2 migration + round-trip verification
  const result = await migrateLegacyCategoryToV2({
    userId,
    legacyCategory,
    categoryLinks: legacyLinks,
    enteredPin: legacyPin,
    iterations: 20_000,
  });

  assert.equal(result.verifiedCount, 1);
  assert.ok(result.upgradedCategory.privateVaultMeta?.startsWith(V2_PRIV_META_PREFIX));
  assert.equal(result.upgradedCategory.privatePinHash, undefined);
  assert.equal(result.upgradedLinks[0].cryptoVersion, 2);
  assert.ok(result.upgradedLinks[0].title.startsWith(V2_ENC_PREFIX));
  assert.ok(result.upgradedLinks[0].url.startsWith(V2_ENC_URL_PREFIX));
  assert.equal(needsVaultMigration(result.upgradedCategory, result.upgradedLinks), false);

  // Verify upgraded data unlocks and decrypts cleanly with user's original PIN
  const reopened = await unlockPrivateCategoryVaultV2({
    userId,
    categorySlug: slug,
    privateVaultMeta: result.upgradedCategory.privateVaultMeta!,
    pin: legacyPin,
  });
  assert.equal(reopened.name, 'Tax & Banking');
  assert.equal(reopened.description, 'Personal finance records');

  const decryptedTitle = await decryptFieldV2({
    ciphertext: result.upgradedLinks[0].title,
    dek: reopened.dek,
    userId,
    categorySlug: slug,
    linkId: 'link_legacy_1',
    fieldName: 'title',
  });
  const decryptedUrl = await decryptFieldV2({
    ciphertext: result.upgradedLinks[0].url,
    dek: reopened.dek,
    userId,
    categorySlug: slug,
    linkId: 'link_legacy_1',
    fieldName: 'url',
  });
  const decryptedDesc = await decryptFieldV2({
    ciphertext: result.upgradedLinks[0].description,
    dek: reopened.dek,
    userId,
    categorySlug: slug,
    linkId: 'link_legacy_1',
    fieldName: 'description',
  });

  assert.equal(decryptedTitle, 'IRS Account Portal');
  assert.equal(decryptedUrl, 'https://irs.gov/account');
  assert.equal(decryptedDesc, 'Quarterly filings and transcripts');

  // Original backup snapshot stayed untouched
  assert.ok(result.backupLinks[0].title.startsWith('ENC1:'));
  clearMigrationCheckpoint(userId, slug);
});
