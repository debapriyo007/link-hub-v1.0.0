import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  getToken as getAppCheckToken,
  type AppCheck,
} from 'firebase/app-check';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import blueprint from '../firebase-blueprint.json';
import type { LinkItem, Category, UserProfile } from './types.ts';

// Initialize Firebase App, Firestore, and Auth
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ============================================================================
// Firebase App Check Initialization (Monitoring / Enforcement Ready)
// ============================================================================
let appCheckInstance: AppCheck | null = null;

function initAppCheckSafely(): AppCheck | null {
  if (typeof window === 'undefined') return null;
  const viteEnv = (import.meta as { env?: Record<string, string | boolean | undefined> }).env || {};
  const siteKey =
    (typeof viteEnv.VITE_FIREBASE_APPCHECK_SITE_KEY === 'string'
      ? viteEnv.VITE_FIREBASE_APPCHECK_SITE_KEY.trim()
      : '') ||
    (firebaseConfig.recaptchaSiteKey || '').trim();

  if (!siteKey) {
    return null;
  }

  try {
    if (viteEnv.DEV) {
      const debugToken = viteEnv.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
      if (typeof debugToken === 'string' && debugToken.trim().length > 0) {
        (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
          debugToken === 'true' ? true : debugToken;
      }
    }

    const useV3 = viteEnv.VITE_APPCHECK_PROVIDER === 'v3';
    const provider = useV3
      ? new ReCaptchaV3Provider(siteKey)
      : new ReCaptchaEnterpriseProvider(siteKey);

    return initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('App Check initialization skipped:', err);
    return null;
  }
}

appCheckInstance = initAppCheckSafely();
export { appCheckInstance };

/**
 * Retrieves fresh Firebase ID Token + App Check Token headers for authenticated backend API calls.
 */
export async function getSecurityHeaders(forceRefreshToken = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const idToken = await currentUser.getIdToken(forceRefreshToken);
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch (err) {
      console.warn('Could not obtain Firebase ID token:', err);
    }
  }

  if (appCheckInstance) {
    try {
      const res = await getAppCheckToken(appCheckInstance, false);
      if (res?.token) {
        headers['X-Firebase-AppCheck'] = res.token;
      }
    } catch (err) {
      console.warn('Could not obtain App Check token:', err);
    }
  }

  return headers;
}

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
  signInWithPopup,
  firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
};
export type { FirebaseUser };

// Validate Connection to Firestore on boot as required by firebase-integration-rpc
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Standardized Firestore Error Handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// Blueprint-Synchronized Defensive Payload Sanitization (v2.0.0)
// ============================================================================
const USER_PROPS = blueprint.entities.UserProfile.properties;
const CAT_PROPS = blueprint.entities.Category.properties;
const LINK_PROPS = blueprint.entities.LinkItem.properties;

const ID_REGEX = new RegExp(LINK_PROPS.id.pattern);
const PIN_REGEX = new RegExp(USER_PROPS.pin.pattern);

export function sanitizeId(rawId: string, maxLen = 128): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, maxLen);
  return cleaned.length > 0 && ID_REGEX.test(cleaned) ? cleaned : `item-${Date.now()}`;
}

export function sanitizePin(pin: string | null | undefined): string {
  if (!pin) return '';
  const digits = pin.replace(/\D/g, '').slice(0, USER_PROPS.pin.maxLength);
  return PIN_REGEX.test(digits) ? digits : '';
}

export function sanitizeHttpUrl(rawUrl: string, fallback = 'https://example.com', maxLen = 4096): string {
  const trimmed = (rawUrl || '').trim().slice(0, maxLen);
  if (!trimmed) return fallback;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return fallback;
  return `https://${trimmed}`.slice(0, maxLen);
}

export function sanitizeUserProfileCreate(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  pin?: string;
  pinVerifier?: string;
  vaultVersion?: number;
}) {
  const uid = sanitizeId(user.uid, USER_PROPS.uid.maxLength);
  const email = (user.email || 'user@linkhub.cloud').trim().slice(0, USER_PROPS.email.maxLength);
  const displayName = (user.displayName || email.split('@')[0] || 'LINKHUB User')
    .trim()
    .slice(0, USER_PROPS.displayName.maxLength);
  const photoURL = (user.photoURL || '').trim().slice(0, USER_PROPS.photoURL.maxLength);
  // v2 never persists raw PINs when a verifier is present
  const pinVerifier = (user.pinVerifier || '').trim().slice(0, USER_PROPS.pinVerifier.maxLength);
  const pin = pinVerifier ? '' : sanitizePin(user.pin);

  return {
    uid,
    email: email.length >= 3 ? email : 'user@linkhub.cloud',
    displayName: displayName.length >= 1 ? displayName : 'LINKHUB User',
    photoURL,
    pin,
    pinVerifier,
    vaultVersion: user.vaultVersion ?? 2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function sanitizePreferencesCreate(
  userId: string,
  prefs: Partial<UserProfile> & { securityAnswerHash?: string }
) {
  return {
    id: 'default',
    userId: sanitizeId(userId, 128),
    firstName: (prefs.firstName || '').trim().slice(0, 60),
    lastName: (prefs.lastName || '').trim().slice(0, 60),
    countryCode: (prefs.countryCode || 'IST (GMT+05:30)').trim().slice(0, 40),
    autoLockMinutes: Math.max(0, Math.min(1440, Number(prefs.autoLockMinutes ?? 0) || 0)),
    soundEnabled: prefs.soundEnabled !== false,
    securityQuestion: (prefs.securityQuestion || '').trim().slice(0, 160),
    securityAnswerHash: (prefs.securityAnswerHash || '').trim().slice(0, 256),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function sanitizePreferencesUpdate(
  prefs: Partial<UserProfile> & { securityAnswerHash?: string }
) {
  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (prefs.firstName !== undefined) patch.firstName = prefs.firstName.trim().slice(0, 60);
  if (prefs.lastName !== undefined) patch.lastName = prefs.lastName.trim().slice(0, 60);
  if (prefs.countryCode !== undefined) patch.countryCode = prefs.countryCode.trim().slice(0, 40);
  if (prefs.autoLockMinutes !== undefined) {
    patch.autoLockMinutes = Math.max(0, Math.min(1440, Number(prefs.autoLockMinutes) || 0));
  }
  if (prefs.soundEnabled !== undefined) patch.soundEnabled = Boolean(prefs.soundEnabled);
  if (prefs.securityQuestion !== undefined) {
    patch.securityQuestion = prefs.securityQuestion.trim().slice(0, 160);
  }
  if (prefs.securityAnswerHash !== undefined) {
    patch.securityAnswerHash = prefs.securityAnswerHash.trim().slice(0, 256);
  }
  return patch;
}

export function sanitizeCategoryCreate(cat: Partial<Category>, userId: string, orderIndex: number) {
  const id = sanitizeId(cat.id || `cat-${Date.now()}`, CAT_PROPS.id.maxLength);
  const cleanUserId = sanitizeId(userId, CAT_PROPS.userId.maxLength);
  const name = (cat.name || 'General').trim().slice(0, CAT_PROPS.name.maxLength) || 'General';
  const slug = sanitizeId(
    cat.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    CAT_PROPS.slug.maxLength
  );
  const color = (cat.color || '#ff9000').trim().slice(0, CAT_PROPS.color.maxLength);
  const icon = (cat.icon || 'folder').trim().slice(0, CAT_PROPS.icon.maxLength) || 'folder';
  const description = (cat.description || '').trim().slice(0, CAT_PROPS.description.maxLength);
  const isDefault = Boolean(cat.isDefault);
  const isPrivate = Boolean(cat.isPrivate);
  const privateVaultMeta = (cat.privateVaultMeta || '').trim().slice(0, 1024);
  const order = Math.max(0, Math.min(10000, Number(cat.order ?? orderIndex) || 0));

  return {
    id,
    userId: cleanUserId,
    name,
    slug,
    color: color.length >= 4 ? color : '#ff9000',
    icon,
    description,
    isDefault,
    isPrivate,
    privateVaultMeta,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function sanitizeLinkCreate(link: Partial<LinkItem>, userId: string) {
  const id = sanitizeId(link.id || `link-${Date.now()}`, LINK_PROPS.id.maxLength);
  const cleanUserId = sanitizeId(userId, LINK_PROPS.userId.maxLength);
  const title = (link.title || 'Untitled Link').trim().slice(0, LINK_PROPS.title.maxLength) || 'Untitled Link';
  const url = sanitizeHttpUrl(link.url || 'https://example.com', 'https://example.com', LINK_PROPS.url.maxLength);
  const categorySlug = sanitizeId(link.categorySlug || 'development', LINK_PROPS.categorySlug.maxLength);
  const description = (link.description || '').trim().slice(0, LINK_PROPS.description.maxLength);
  const tags = Array.isArray(link.tags)
    ? link.tags
        .map((t) => String(t).trim().replace(/^#/, '').slice(0, 40))
        .filter((t) => t.length >= 1)
        .slice(0, 10)
    : [];
  const isFavorite = Boolean(link.isFavorite);
  const clickCount = Math.max(0, Math.min(100000000, Number(link.clickCount) || 0));
  const rawImg = (link.imageUrl || '').trim();
  const imageUrl = rawImg && /^https?:\/\//i.test(rawImg) ? rawImg.slice(0, LINK_PROPS.imageUrl.maxLength) : '';
  const rawFav = (link.faviconUrl || '').trim();
  const faviconUrl = rawFav && /^https?:\/\//i.test(rawFav) ? rawFav.slice(0, LINK_PROPS.faviconUrl.maxLength) : '';
  const isEncrypted = Boolean(link.isEncrypted);
  const cryptoVersion = Number(link.cryptoVersion || (isEncrypted ? 2 : 1));

  return {
    id,
    userId: cleanUserId,
    title,
    url,
    categorySlug,
    description,
    tags,
    isFavorite,
    clickCount,
    imageUrl,
    faviconUrl,
    isEncrypted,
    cryptoVersion,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function toMillis(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (typeof val === 'number') {
    return val;
  }
  if (val && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}
