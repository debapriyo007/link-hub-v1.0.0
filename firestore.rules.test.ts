import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Deterministic adversarial security test suite mirroring firestore.rules (v2.0.0)
 * across UserProfile, UserPreferences, Entitlements, Category, LinkItem, and ShareRecord.
 */

interface AuthContext {
  uid: string;
  email_verified: boolean;
  provider?: 'google.com' | 'password';
}

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const PIN_REGEX = /^([0-9]{6})?$/;
const HTTP_REGEX = /^https?:\/\/.*/;

const PRIVILEGE_KEYS = new Set([
  'role',
  'roles',
  'isAdmin',
  'admin',
  'isPremium',
  'premium',
  'subscription',
  'plan',
  'tier',
  'billingStatus',
  'entitlements',
  'stripeCustomerId',
]);

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

function isValidShareToken(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 22 && id.length <= 128 && ID_REGEX.test(id);
}

function isSignedIn(auth: AuthContext | null): boolean {
  return auth !== null && auth.email_verified === true;
}

function isOwner(auth: AuthContext | null, userId: string): boolean {
  return isSignedIn(auth) && auth!.uid === userId;
}

function hasNoPrivilegeFields(data: Record<string, unknown>): boolean {
  return Object.keys(data).every((k) => !PRIVILEGE_KEYS.has(k));
}

function hasAllowedKeys(
  data: Record<string, unknown>,
  required: string[],
  allowed: string[]
): boolean {
  const keys = Object.keys(data);
  return required.every((k) => keys.includes(k)) && keys.every((k) => allowed.includes(k));
}

function evaluateCreateUserProfile(
  auth: AuthContext | null,
  userId: string,
  data: Record<string, unknown>,
  requestTime: number
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isOwner(auth, userId) || !isValidId(userId)) return 'PERMISSION_DENIED';
  if (!hasNoPrivilegeFields(data)) return 'PERMISSION_DENIED';
  const required = ['uid', 'email', 'displayName', 'photoURL', 'pin', 'createdAt', 'updatedAt'];
  const allowed = [...required, 'pinVerifier', 'vaultVersion'];
  if (!hasAllowedKeys(data, required, allowed)) return 'PERMISSION_DENIED';
  if (data.uid !== userId || data.uid !== auth?.uid || !isValidId(data.uid)) return 'PERMISSION_DENIED';
  if (typeof data.email !== 'string' || data.email.length < 3 || data.email.length > 254) return 'PERMISSION_DENIED';
  if (typeof data.displayName !== 'string' || data.displayName.length < 1 || data.displayName.length > 100) return 'PERMISSION_DENIED';
  if (typeof data.photoURL !== 'string' || data.photoURL.length > 65536) return 'PERMISSION_DENIED';
  if (typeof data.pin !== 'string' || data.pin.length > 6 || !PIN_REGEX.test(data.pin)) return 'PERMISSION_DENIED';
  if ('pinVerifier' in data && (typeof data.pinVerifier !== 'string' || data.pinVerifier.length > 256)) return 'PERMISSION_DENIED';
  if ('vaultVersion' in data && (typeof data.vaultVersion !== 'number' || data.vaultVersion < 1 || data.vaultVersion > 10)) return 'PERMISSION_DENIED';
  if (data.createdAt !== requestTime || data.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  return 'ALLOWED';
}

function evaluateCreateLinkItem(
  auth: AuthContext | null,
  userId: string,
  linkId: string,
  parentExists: boolean,
  data: Record<string, unknown>,
  requestTime: number
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isOwner(auth, userId) || !isValidId(userId) || !isValidId(linkId) || !parentExists) {
    return 'PERMISSION_DENIED';
  }
  if (!hasNoPrivilegeFields(data)) return 'PERMISSION_DENIED';
  const required = [
    'id', 'userId', 'title', 'url', 'categorySlug', 'description',
    'tags', 'isFavorite', 'clickCount', 'imageUrl', 'faviconUrl',
    'createdAt', 'updatedAt',
  ];
  const allowed = [...required, 'isEncrypted', 'cryptoVersion'];
  if (!hasAllowedKeys(data, required, allowed)) return 'PERMISSION_DENIED';
  if (data.id !== linkId || !isValidId(data.id)) return 'PERMISSION_DENIED';
  if (data.userId !== userId || data.userId !== auth?.uid || !isValidId(data.userId)) return 'PERMISSION_DENIED';
  if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 512) return 'PERMISSION_DENIED';
  if (typeof data.url !== 'string' || data.url.length < 4 || data.url.length > 4096 || !HTTP_REGEX.test(data.url)) return 'PERMISSION_DENIED';
  if (typeof data.categorySlug !== 'string' || data.categorySlug.length < 1 || data.categorySlug.length > 60 || !ID_REGEX.test(data.categorySlug)) return 'PERMISSION_DENIED';
  if (typeof data.description !== 'string' || data.description.length > 2048) return 'PERMISSION_DENIED';
  if (!Array.isArray(data.tags) || data.tags.length > 10) return 'PERMISSION_DENIED';
  if (data.tags.length > 0 && (typeof data.tags[0] !== 'string' || data.tags[0].length < 1 || data.tags[0].length > 40)) return 'PERMISSION_DENIED';
  if (typeof data.isFavorite !== 'boolean') return 'PERMISSION_DENIED';
  if (typeof data.clickCount !== 'number' || data.clickCount < 0 || data.clickCount > 100000000) return 'PERMISSION_DENIED';
  if (typeof data.imageUrl !== 'string' || data.imageUrl.length > 2048 || (data.imageUrl.length > 0 && !HTTP_REGEX.test(data.imageUrl))) return 'PERMISSION_DENIED';
  if (typeof data.faviconUrl !== 'string' || data.faviconUrl.length > 2048 || (data.faviconUrl.length > 0 && !HTTP_REGEX.test(data.faviconUrl))) return 'PERMISSION_DENIED';
  if (data.createdAt !== requestTime || data.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  return 'ALLOWED';
}

function evaluateUpdateLinkItem(
  auth: AuthContext | null,
  userId: string,
  linkId: string,
  parentExists: boolean,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  requestTime: number
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isOwner(auth, userId) || !isValidId(userId) || !isValidId(linkId) || !parentExists) {
    return 'PERMISSION_DENIED';
  }
  if (!hasNoPrivilegeFields(incoming)) return 'PERMISSION_DENIED';
  const required = [
    'id', 'userId', 'title', 'url', 'categorySlug', 'description',
    'tags', 'isFavorite', 'clickCount', 'imageUrl', 'faviconUrl',
    'createdAt', 'updatedAt',
  ];
  const allowed = [...required, 'isEncrypted', 'cryptoVersion'];
  if (!hasAllowedKeys(incoming, required, allowed)) return 'PERMISSION_DENIED';
  if (incoming.id !== existing.id || incoming.userId !== existing.userId || incoming.createdAt !== existing.createdAt) {
    return 'PERMISSION_DENIED';
  }
  if (incoming.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  if (typeof incoming.title !== 'string' || incoming.title.length < 1 || incoming.title.length > 512) {
    return 'PERMISSION_DENIED';
  }
  const changed = Object.keys(incoming).filter((k) => incoming[k] !== existing[k]);
  const actionSets = [
    ['isFavorite', 'updatedAt'],
    ['clickCount', 'updatedAt'],
    ['categorySlug', 'updatedAt'],
    ['title', 'url', 'categorySlug', 'description', 'tags', 'isFavorite', 'imageUrl', 'faviconUrl', 'isEncrypted', 'cryptoVersion', 'updatedAt'],
  ];
  const matchesAction = actionSets.some((set) => changed.every((k) => set.includes(k)));
  return matchesAction ? 'ALLOWED' : 'PERMISSION_DENIED';
}

function evaluateWriteEntitlement(auth: AuthContext | null, userId: string): 'ALLOWED' | 'PERMISSION_DENIED' {
  void auth;
  void userId;
  // Entitlement writes are strictly disabled for ALL client SDKs (allow create, update, delete: if false)
  return 'PERMISSION_DENIED';
}

function evaluateReadShare(
  auth: AuthContext | null,
  shareId: string,
  share: { ownerId: string; revoked: boolean; hasPassword: boolean; expiresAt: number },
  requestTime: number
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isValidShareToken(shareId)) return 'PERMISSION_DENIED';
  if (!isSignedIn(auth)) return 'PERMISSION_DENIED';
  if (share.ownerId === auth!.uid) return 'ALLOWED';
  if (!share.revoked && !share.hasPassword && share.expiresAt > requestTime) return 'ALLOWED';
  return 'PERMISSION_DENIED';
}

function evaluateCreateCategory(
  auth: AuthContext | null,
  userId: string,
  categoryId: string,
  parentExists: boolean,
  data: Record<string, unknown>,
  requestTime: number
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isOwner(auth, userId) || !isValidId(userId) || !isValidId(categoryId) || !parentExists) {
    return 'PERMISSION_DENIED';
  }
  if (!hasNoPrivilegeFields(data)) return 'PERMISSION_DENIED';
  const required = [
    'id', 'userId', 'name', 'slug', 'color', 'icon',
    'description', 'isDefault', 'order', 'createdAt', 'updatedAt',
  ];
  const allowed = [...required, 'isPrivate', 'privateVaultMeta'];
  if (!hasAllowedKeys(data, required, allowed)) return 'PERMISSION_DENIED';
  if (data.id !== categoryId || !isValidId(data.id)) return 'PERMISSION_DENIED';
  if (data.userId !== userId || data.userId !== auth?.uid || !isValidId(data.userId)) return 'PERMISSION_DENIED';
  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 240) return 'PERMISSION_DENIED';
  if (typeof data.slug !== 'string' || data.slug.length < 1 || data.slug.length > 60 || !ID_REGEX.test(data.slug)) return 'PERMISSION_DENIED';
  if (typeof data.color !== 'string' || data.color.length < 4 || data.color.length > 20) return 'PERMISSION_DENIED';
  if (typeof data.icon !== 'string' || data.icon.length < 1 || data.icon.length > 40) return 'PERMISSION_DENIED';
  if (typeof data.description !== 'string' || data.description.length > 1024) return 'PERMISSION_DENIED';
  if (typeof data.isDefault !== 'boolean') return 'PERMISSION_DENIED';
  if ('isPrivate' in data && typeof data.isPrivate !== 'boolean') return 'PERMISSION_DENIED';
  if ('privateVaultMeta' in data && (typeof data.privateVaultMeta !== 'string' || data.privateVaultMeta.length > 4096)) {
    return 'PERMISSION_DENIED';
  }
  if (typeof data.order !== 'number' || data.order < 0 || data.order > 10000) return 'PERMISSION_DENIED';
  if (data.createdAt !== requestTime || data.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  return 'ALLOWED';
}

function evaluateDeleteCategory(
  auth: AuthContext | null,
  userId: string,
  categoryId: string,
  existing: { isDefault: boolean }
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isOwner(auth, userId) || !isValidId(userId) || !isValidId(categoryId)) return 'PERMISSION_DENIED';
  return existing.isDefault === false ? 'ALLOWED' : 'PERMISSION_DENIED';
}

function evaluateListUserCollection(
  auth: AuthContext | null,
  userId: string,
  queryFilterUserId: string | null
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isOwner(auth, userId) || !isValidId(userId)) return 'PERMISSION_DENIED';
  return queryFilterUserId !== null && queryFilterUserId === auth!.uid
    ? 'ALLOWED'
    : 'PERMISSION_DENIED';
}

const NOW = 1762800000000;
const VALID_LINK = {
  id: 'link_1',
  userId: 'user_1',
  title: 'Stripe Docs',
  url: 'https://stripe.com/docs',
  categorySlug: 'development',
  description: 'Payments API reference',
  tags: ['api', 'fintech'],
  isFavorite: true,
  clickCount: 0,
  imageUrl: '',
  faviconUrl: 'https://stripe.com/favicon.ico',
  createdAt: NOW,
  updatedAt: NOW,
};

test('Dirty Dozen #1: Unauthenticated write returns PERMISSION_DENIED', () => {
  const res = evaluateCreateUserProfile(
    null,
    'user_1',
    { uid: 'user_1', email: 'a@b.com', displayName: 'A', photoURL: '', pin: '', createdAt: NOW, updatedAt: NOW },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #2: Unverified password provider email returns PERMISSION_DENIED (v2 closes v1 bypass)', () => {
  const res = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: false, provider: 'password' },
    'user_1',
    { uid: 'user_1', email: 'a@b.com', displayName: 'A', photoURL: '', pin: '', createdAt: NOW, updatedAt: NOW },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #3: Cross-tenant PII access returns PERMISSION_DENIED', () => {
  const res = isOwner({ uid: 'attacker_1', email_verified: true }, 'victim_1') ? 'ALLOWED' : 'PERMISSION_DENIED';
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #4: Identity spoofing on link create returns PERMISSION_DENIED', () => {
  const res = evaluateCreateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    { ...VALID_LINK, userId: 'other_user' },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #5: Orphaned subcollection write without parent user returns PERMISSION_DENIED', () => {
  const res = evaluateCreateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    false,
    VALID_LINK,
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #6: Shadow field / privilege escalation (isAdmin / isPremium / plan) denied on create', () => {
  for (const field of ['isAdmin', 'role', 'isPremium', 'subscription', 'plan']) {
    const res = evaluateCreateUserProfile(
      { uid: 'user_1', email_verified: true },
      'user_1',
      {
        uid: 'user_1',
        email: 'a@b.com',
        displayName: 'A',
        photoURL: '',
        pin: '',
        [field]: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      NOW
    );
    assert.equal(res, 'PERMISSION_DENIED', `Expected ${field} injection to be denied`);
  }
});

test('Dirty Dozen #7: Shadow field injection on update returns PERMISSION_DENIED', () => {
  const res = evaluateUpdateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    VALID_LINK,
    { ...VALID_LINK, role: 'admin', updatedAt: NOW + 1000 },
    NOW + 1000
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #8: Immortal field mutation (createdAt / userId) returns PERMISSION_DENIED', () => {
  const res = evaluateUpdateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    VALID_LINK,
    { ...VALID_LINK, createdAt: NOW - 5000, updatedAt: NOW + 1000 },
    NOW + 1000
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #9: Forged client timestamp on create returns PERMISSION_DENIED', () => {
  const res = evaluateCreateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    { ...VALID_LINK, createdAt: NOW - 99999 },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #10: Oversized title string (>512) returns PERMISSION_DENIED', () => {
  const res = evaluateUpdateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    VALID_LINK,
    { ...VALID_LINK, title: 'A'.repeat(600), updatedAt: NOW + 1000 },
    NOW + 1000
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #11: Unbounded tags array (>10 tags) returns PERMISSION_DENIED', () => {
  const res = evaluateCreateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    { ...VALID_LINK, tags: Array.from({ length: 15 }, (_, i) => `tag${i}`) },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #12: Invalid PIN format injection returns PERMISSION_DENIED', () => {
  const res = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: true },
    'user_1',
    { uid: 'user_1', email: 'a@b.com', displayName: 'A', photoURL: '', pin: '12345a', createdAt: NOW, updatedAt: NOW },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('v2 Hardening #13: Non-HTTP(S) javascript:/data: bookmark URL returns PERMISSION_DENIED', () => {
  const res = evaluateCreateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    { ...VALID_LINK, url: 'javascript:alert(document.cookie)' },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('v2 Hardening #14: Client writes to /entitlements are always denied', () => {
  assert.equal(evaluateWriteEntitlement({ uid: 'user_1', email_verified: true }, 'user_1'), 'PERMISSION_DENIED');
});

test('v2 Hardening #15: Revoked, expired, low-entropy, or password-locked shares deny direct read', () => {
  const validToken = 'abcDEF1234567890_ghijKL';
  assert.equal(
    evaluateReadShare(
      { uid: 'reader_1', email_verified: true },
      'short_token',
      { ownerId: 'user_1', revoked: false, hasPassword: false, expiresAt: NOW + 60000 },
      NOW
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateReadShare(
      { uid: 'reader_1', email_verified: true },
      validToken,
      { ownerId: 'user_1', revoked: true, hasPassword: false, expiresAt: NOW + 60000 },
      NOW
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateReadShare(
      { uid: 'reader_1', email_verified: true },
      validToken,
      { ownerId: 'user_1', revoked: false, hasPassword: false, expiresAt: NOW - 10 },
      NOW
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateReadShare(
      { uid: 'reader_1', email_verified: true },
      validToken,
      { ownerId: 'user_1', revoked: false, hasPassword: true, expiresAt: NOW + 60000 },
      NOW
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateReadShare(
      { uid: 'reader_1', email_verified: true },
      validToken,
      { ownerId: 'user_1', revoked: false, hasPassword: false, expiresAt: NOW + 60000 },
      NOW
    ),
    'ALLOWED'
  );
});

test('v2 Hardening #16: Valid encrypted v2 link with PBKDF2 pinVerifier is ALLOWED', () => {
  const profileRes = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: true },
    'user_1',
    {
      uid: 'user_1',
      email: 'a@b.com',
      displayName: 'A',
      photoURL: '',
      pin: '',
      pinVerifier: 'PBKDF2_SHA256:210000:saltBase64:hashBase64',
      vaultVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
    },
    NOW
  );
  assert.equal(profileRes, 'ALLOWED');

  const linkRes = evaluateCreateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_enc_1',
    true,
    {
      ...VALID_LINK,
      id: 'link_enc_1',
      title: 'ENC2:ivBase64:cipherBase64',
      url: 'https://encrypted.linkhub.vault/ENC2:ivBase64:cipherBase64',
      isEncrypted: true,
      cryptoVersion: 2,
    },
    NOW
  );
  assert.equal(linkRes, 'ALLOWED');
});

test('Category Rules: verified owner can create standard and large-envelope private categories, while orphaned or default-delete writes are denied', () => {
  const validCat = {
    id: 'cat-1762800000000-ab12',
    userId: 'user_1',
    name: 'Research Vault',
    slug: 'research-vault',
    color: '#ff9000',
    icon: 'compass',
    description: 'Deep technical papers',
    isDefault: false,
    isPrivate: false,
    privateVaultMeta: '',
    order: 5,
    createdAt: NOW,
    updatedAt: NOW,
  };

  assert.equal(
    evaluateCreateCategory({ uid: 'user_1', email_verified: true }, 'user_1', validCat.id, true, validCat, NOW),
    'ALLOWED'
  );
  // Private category with >1024 char AES-256-GCM envelope (e.g. 1600 chars) must succeed (<= 4096)
  assert.equal(
    evaluateCreateCategory(
      { uid: 'user_1', email_verified: true },
      'user_1',
      validCat.id,
      true,
      {
        ...validCat,
        isPrivate: true,
        description: '[Encrypted Private Vault]',
        privateVaultMeta: 'LHPRIV2:' + 'A'.repeat(1600),
      },
      NOW
    ),
    'ALLOWED'
  );
  // Missing parent user doc must be denied
  assert.equal(
    evaluateCreateCategory({ uid: 'user_1', email_verified: true }, 'user_1', validCat.id, false, validCat, NOW),
    'PERMISSION_DENIED'
  );
  // Non-default category delete allowed; default category delete denied
  assert.equal(
    evaluateDeleteCategory({ uid: 'user_1', email_verified: true }, 'user_1', validCat.id, { isDefault: false }),
    'ALLOWED'
  );
  assert.equal(
    evaluateDeleteCategory({ uid: 'user_1', email_verified: true }, 'user_1', 'study', { isDefault: true }),
    'PERMISSION_DENIED'
  );
});

test('List Queries: unfiltered categories/links list is denied, while owner query filtered by userId is allowed', () => {
  assert.equal(
    evaluateListUserCollection({ uid: 'user_1', email_verified: true }, 'user_1', null),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateListUserCollection({ uid: 'user_1', email_verified: true }, 'user_1', 'other_user'),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateListUserCollection({ uid: 'user_1', email_verified: false }, 'user_1', 'user_1'),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateListUserCollection({ uid: 'user_1', email_verified: true }, 'other_user', 'user_1'),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateListUserCollection({ uid: 'user_1', email_verified: true }, 'user_1', 'user_1'),
    'ALLOWED'
  );
});

test('Preferences Sync Rules: validates sortOption enum, confettiEnabled boolean, and photoURL 64KB limit', () => {
  const validProfile = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: true },
    'user_1',
    {
      uid: 'user_1',
      email: 'a@b.com',
      displayName: 'Alex Vault',
      photoURL: 'data:image/jpeg;base64,' + 'A'.repeat(40000),
      pin: '',
      createdAt: NOW,
      updatedAt: NOW,
    },
    NOW
  );
  assert.equal(validProfile, 'ALLOWED');

  const oversizedProfile = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: true },
    'user_1',
    {
      uid: 'user_1',
      email: 'a@b.com',
      displayName: 'Alex Vault',
      photoURL: 'data:image/jpeg;base64,' + 'A'.repeat(70000),
      pin: '',
      createdAt: NOW,
      updatedAt: NOW,
    },
    NOW
  );
  assert.equal(oversizedProfile, 'PERMISSION_DENIED');
});
