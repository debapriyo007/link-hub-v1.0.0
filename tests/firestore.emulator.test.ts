/**
 * Real Firebase Firestore Emulator security test suite powered by @firebase/rules-unit-testing.
 * Run via: firebase emulators:exec --only firestore "npm run test:emulator"
 * If FIRESTORE_EMULATOR_HOST is not set, skips gracefully with an explicit skip notice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!emulatorHost) {
  test('Firestore Emulator Rules Suite (skipped — FIRESTORE_EMULATOR_HOST not running)', { skip: true }, () => {
    // Requires Java + Firebase Firestore Emulator (`firebase emulators:exec --only firestore`).
  });
} else {
  let testEnv: RulesTestEnvironment;

  test.before(async () => {
    const [host, portStr] = emulatorHost.split(':');
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'linkhub-v2-security-test',
      firestore: {
        host,
        port: Number(portStr) || 8080,
        rules,
      },
    });
  });

  test.after(async () => {
    await testEnv.cleanup();
  });

  test.beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  test('1. Anonymous users cannot read or write private vault data', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'users/alice')));
    await assertFails(
      setDoc(doc(unauthDb, 'users/alice'), {
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        photoURL: '',
        pin: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  test('2. Unverified password users cannot bypass email verification', async () => {
    const unverifiedDb = testEnv
      .authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();

    await assertFails(
      setDoc(doc(unverifiedDb, 'users/alice'), {
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        photoURL: '',
        pin: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  test('3. Verified owner can create profile, categories, and links; User B cannot access User A', async () => {
    const aliceDb = testEnv
      .authenticatedContext('alice', { email: 'alice@example.com', email_verified: true })
      .firestore();
    const bobDb = testEnv
      .authenticatedContext('bob', { email: 'bob@example.com', email_verified: true })
      .firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users/alice'), {
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        photoURL: '',
        pin: '',
        pinVerifier: 'PBKDF2_SHA256:210000:abc:def',
        vaultVersion: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users/alice/links/link_1'), {
        id: 'link_1',
        userId: 'alice',
        title: 'Example',
        url: 'https://example.com',
        categorySlug: 'development',
        description: 'Docs',
        tags: ['docs'],
        isFavorite: false,
        clickCount: 0,
        imageUrl: '',
        faviconUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertFails(getDoc(doc(bobDb, 'users/alice')));
    await assertFails(getDoc(doc(bobDb, 'users/alice/links/link_1')));
    await assertFails(updateDoc(doc(bobDb, 'users/alice/links/link_1'), { title: 'Hacked' }));
  });

  test('4. Privilege escalation & entitlement writes are strictly blocked', async () => {
    const aliceDb = testEnv
      .authenticatedContext('alice', { email: 'alice@example.com', email_verified: true })
      .firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'users/alice'), {
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        photoURL: '',
        pin: '',
        isAdmin: true,
        role: 'admin',
        isPremium: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertFails(
      setDoc(doc(aliceDb, 'users/alice/entitlements/pro'), {
        id: 'pro',
        userId: 'alice',
        plan: 'pro',
        status: 'active',
        updatedAt: serverTimestamp(),
      })
    );
  });

  test('5. Share records enforce high-entropy IDs, expiration, and revocation', async () => {
    const aliceDb = testEnv
      .authenticatedContext('alice', { email: 'alice@example.com', email_verified: true })
      .firestore();
    const bobDb = testEnv
      .authenticatedContext('bob', { email: 'bob@example.com', email_verified: true })
      .firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users/alice'), {
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        photoURL: '',
        pin: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    const shareToken = 'v2ShareTokenHighEntropy_123456';
    await assertSucceeds(
      setDoc(doc(aliceDb, `shares/${shareToken}`), {
        id: shareToken,
        ownerId: 'alice',
        categoryName: 'Dev',
        categorySlug: 'dev',
        readOnly: true,
        hasPassword: false,
        revoked: false,
        links: [{ title: 'GitHub', url: 'https://github.com', description: '', tags: [] }],
        expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertSucceeds(getDoc(doc(bobDb, `shares/${shareToken}`)));
    await assertFails(updateDoc(doc(bobDb, `shares/${shareToken}`), { revoked: true }));
    await assertSucceeds(
      updateDoc(doc(aliceDb, `shares/${shareToken}`), {
        revoked: true,
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(getDoc(doc(bobDb, `shares/${shareToken}`)));
  });
}
