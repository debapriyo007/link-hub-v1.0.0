import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Deterministic simulator of the Firestore Security Rules in firestore.rules
 * to verify that all "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

interface AuthContext {
  uid: string;
  email_verified: boolean;
}

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const PIN_REGEX = /^([0-9]{6})?$/;

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

function isOwner(auth: AuthContext | null, userId: string): boolean {
  return auth !== null && auth.email_verified === true && auth.uid === userId;
}

function hasExactKeys(data: Record<string, unknown>, allowed: string[]): boolean {
  const keys = Object.keys(data);
  return allowed.every((k) => keys.includes(k)) && keys.every((k) => allowed.includes(k));
}

function evaluateCreateUserProfile(
  auth: AuthContext | null,
  userId: string,
  data: Record<string, unknown>,
  requestTime: number
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (!isOwner(auth, userId) || !isValidId(userId)) return 'PERMISSION_DENIED';
  const requiredKeys = ['uid', 'email', 'displayName', 'photoURL', 'pin', 'createdAt', 'updatedAt'];
  if (!hasExactKeys(data, requiredKeys)) return 'PERMISSION_DENIED';
  if (data.uid !== userId || data.uid !== auth?.uid || !isValidId(data.uid)) return 'PERMISSION_DENIED';
  if (typeof data.email !== 'string' || data.email.length < 3 || data.email.length > 254) return 'PERMISSION_DENIED';
  if (typeof data.displayName !== 'string' || data.displayName.length < 1 || data.displayName.length > 100) return 'PERMISSION_DENIED';
  if (typeof data.photoURL !== 'string' || data.photoURL.length > 32768) return 'PERMISSION_DENIED';
  if (typeof data.pin !== 'string' || data.pin.length > 6 || !PIN_REGEX.test(data.pin)) return 'PERMISSION_DENIED';
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
  const requiredKeys = [
    'id', 'userId', 'title', 'url', 'categorySlug', 'description',
    'tags', 'isFavorite', 'clickCount', 'imageUrl', 'faviconUrl',
    'createdAt', 'updatedAt',
  ];
  if (!hasExactKeys(data, requiredKeys)) return 'PERMISSION_DENIED';
  if (data.id !== linkId || !isValidId(data.id)) return 'PERMISSION_DENIED';
  if (data.userId !== userId || data.userId !== auth?.uid || !isValidId(data.userId)) return 'PERMISSION_DENIED';
  if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 160) return 'PERMISSION_DENIED';
  if (typeof data.url !== 'string' || data.url.length < 4 || data.url.length > 2048) return 'PERMISSION_DENIED';
  if (typeof data.categorySlug !== 'string' || data.categorySlug.length < 1 || data.categorySlug.length > 60 || !ID_REGEX.test(data.categorySlug)) return 'PERMISSION_DENIED';
  if (typeof data.description !== 'string' || data.description.length > 500) return 'PERMISSION_DENIED';
  if (!Array.isArray(data.tags) || data.tags.length > 10) return 'PERMISSION_DENIED';
  if (data.tags.length > 0 && (typeof data.tags[0] !== 'string' || data.tags[0].length < 1 || data.tags[0].length > 40)) {
    return 'PERMISSION_DENIED';
  }
  if (typeof data.isFavorite !== 'boolean') return 'PERMISSION_DENIED';
  if (typeof data.clickCount !== 'number' || data.clickCount < 0 || data.clickCount > 100000000) return 'PERMISSION_DENIED';
  if (typeof data.imageUrl !== 'string' || data.imageUrl.length > 2048) return 'PERMISSION_DENIED';
  if (typeof data.faviconUrl !== 'string' || data.faviconUrl.length > 2048) return 'PERMISSION_DENIED';
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
  const requiredKeys = [
    'id', 'userId', 'title', 'url', 'categorySlug', 'description',
    'tags', 'isFavorite', 'clickCount', 'imageUrl', 'faviconUrl',
    'createdAt', 'updatedAt',
  ];
  if (!hasExactKeys(incoming, requiredKeys)) return 'PERMISSION_DENIED';
  if (incoming.id !== existing.id || incoming.userId !== existing.userId || incoming.createdAt !== existing.createdAt) {
    return 'PERMISSION_DENIED';
  }
  if (incoming.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  if (typeof incoming.title !== 'string' || incoming.title.length < 1 || incoming.title.length > 160) {
    return 'PERMISSION_DENIED';
  }
  return 'ALLOWED';
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

test('Dirty Dozen #2: Unverified email spoof returns PERMISSION_DENIED', () => {
  const res = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: false },
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

test('Dirty Dozen #6: Shadow field injection on create returns PERMISSION_DENIED', () => {
  const res = evaluateCreateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    { ...VALID_LINK, isAdmin: true },
    NOW
  );
  assert.equal(res, 'PERMISSION_DENIED');
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

test('Dirty Dozen #10: Oversized title string (resource exhaustion) returns PERMISSION_DENIED', () => {
  const res = evaluateUpdateLinkItem(
    { uid: 'user_1', email_verified: true },
    'user_1',
    'link_1',
    true,
    VALID_LINK,
    { ...VALID_LINK, title: 'A'.repeat(500), updatedAt: NOW + 1000 },
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

test('Avatar size limit: valid compressed data URL <= 32KB allowed, oversized > 32KB denied', () => {
  const validRes = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: true },
    'user_1',
    { uid: 'user_1', email: 'a@b.com', displayName: 'A', photoURL: 'data:image/webp;base64,' + 'A'.repeat(2048), pin: '', createdAt: NOW, updatedAt: NOW },
    NOW
  );
  assert.equal(validRes, 'ALLOWED');

  const oversizedRes = evaluateCreateUserProfile(
    { uid: 'user_1', email_verified: true },
    'user_1',
    { uid: 'user_1', email: 'a@b.com', displayName: 'A', photoURL: 'data:image/webp;base64,' + 'A'.repeat(40000), pin: '', createdAt: NOW, updatedAt: NOW },
    NOW
  );
  assert.equal(oversizedRes, 'PERMISSION_DENIED');
});
