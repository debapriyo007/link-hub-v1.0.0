import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
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
import { LinkItem, Category } from './types.ts';

// Initialize Firebase App, Firestore, and Auth
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
// Blueprint-Synchronized Defensive Payload Sanitization
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

export function sanitizeUserProfileCreate(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  pin?: string;
}) {
  const uid = sanitizeId(user.uid, USER_PROPS.uid.maxLength);
  const email = (user.email || 'user@linkhub.cloud').trim().slice(0, USER_PROPS.email.maxLength);
  const displayName = (user.displayName || email.split('@')[0] || 'LINKHUB User')
    .trim()
    .slice(0, USER_PROPS.displayName.maxLength);
  const photoURL = (user.photoURL || '').trim().slice(0, USER_PROPS.photoURL.maxLength);
  const pin = sanitizePin(user.pin);

  return {
    uid,
    email: email.length >= 3 ? email : 'user@linkhub.cloud',
    displayName: displayName.length >= 1 ? displayName : 'LINKHUB User',
    photoURL,
    pin,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
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
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function sanitizeLinkCreate(link: Partial<LinkItem>, userId: string) {
  const id = sanitizeId(link.id || `link-${Date.now()}`, LINK_PROPS.id.maxLength);
  const cleanUserId = sanitizeId(userId, LINK_PROPS.userId.maxLength);
  const title = (link.title || 'Untitled Link').trim().slice(0, LINK_PROPS.title.maxLength) || 'Untitled Link';
  const rawUrl = (link.url || 'https://example.com').trim().slice(0, LINK_PROPS.url.maxLength);
  const url = rawUrl.length >= 4 ? rawUrl : 'https://example.com';
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
  const imageUrl = (link.imageUrl || '').trim().slice(0, LINK_PROPS.imageUrl.maxLength);
  const faviconUrl = (link.faviconUrl || '').trim().slice(0, LINK_PROPS.faviconUrl.maxLength);

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
