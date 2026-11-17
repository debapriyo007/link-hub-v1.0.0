import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Star,
  BookmarkPlus,
  Upload,
  Instagram,
  Github,
  ArrowDownAZ,
  ArrowUpAZ,
  Flame,
  FolderOpen,
  QrCode,
  CircleUserRound,
} from 'lucide-react';
import { BsBookmarks } from 'react-icons/bs';
import { PiLockKeyOpenFill } from 'react-icons/pi';
import { TbBookmarksOff } from 'react-icons/tb';
import { LinkItem, Category, SortOption, UserProfile } from './types.ts';
import { INITIAL_LINKS, INITIAL_CATEGORIES } from './data/initialData.ts';
import {
  filterAndSortLinks,
  generateUniqueCategorySlug,
  mergeCategoriesWithPendingLocal,
} from './utils/vaultLogic.ts';
import {
  encodeCategoryForStorageAsync,
  decodeCategoryFromStorage,
  encryptLinkForStorageAsync,
  decryptLinkInMemoryAsync,
  isLinkEncrypted,
  maskedPrivateLink,
  unlockAndStoreCategoryDek,
  setActiveCategoryDek,
  clearActiveCategoryDek,
  clearAllActiveCategoryDeks,
} from './utils/privateVaultCrypto.ts';
import {
  createSecretVerifier,
  verifySecretVerifier,
} from './utils/vaultCryptoV2.ts';
import {
  needsVaultMigration,
  migrateLegacyCategoryToV2,
  clearMigrationCheckpoint,
} from './utils/vaultMigration.ts';
import {
  SharedCategoryBundle,
  decodeCategoryShareInput,
  extractServerShareToken,
  savePendingSharedImport,
  consumePendingSharedImport,
  peekPendingSharedImport,
} from './utils/categoryShare.ts';
import {
  playRetroClick,
  playRetroBeep,
  playRetroLock,
  setSoundEnabled,
} from './utils/sound.ts';
import {
  auth,
  db,
  googleProvider,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  deleteUser,
  reload,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updateProfile,
  sanitizeId,
  sanitizePin,
  sanitizeUserProfileCreate,
  sanitizePreferencesCreate,
  sanitizePreferencesUpdate,
  sanitizeCategoryCreate,
  sanitizeLinkCreate,
  toMillis,
  OperationType,
  logFirestoreError,
  type FirebaseUser,
} from './firebase.ts';

// UI Components
import { Navbar } from './components/Navbar.tsx';
import { CategoryPills } from './components/CategoryPills.tsx';
import { LinkCard } from './components/LinkCard.tsx';
import { Button } from './components/ui/Button.tsx';
import { Chip } from './components/ui/Chip.tsx';
import { GlassSelect } from './components/ui/GlassSelect.tsx';
import { Toast, ToastData, ToastVariant } from './components/ui/Toast.tsx';
import { LinkHubLogo } from './components/LinkHubLogo.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { EmailVerificationScreen } from './components/EmailVerificationScreen.tsx';
import { ProfileSettingsPage } from './components/ProfileSettingsPage.tsx';

// Modals
import { AddLinkModal } from './components/modals/AddLinkModal.tsx';
import { PinModal } from './components/modals/PinModal.tsx';
import { LockedScreen } from './components/modals/LockedScreen.tsx';
import { ImportModal } from './components/modals/ImportModal.tsx';
import { ExportModal } from './components/modals/ExportModal.tsx';
import { CategoryModal } from './components/modals/CategoryModal.tsx';
import { AboutModal } from './components/modals/AboutModal.tsx';
import { IncognitoModal } from './components/modals/IncognitoModal.tsx';
import { ShareQrModal } from './components/modals/ShareQrModal.tsx';
import { ScanQrModal } from './components/modals/ScanQrModal.tsx';
import { CommandSearchModal } from './components/modals/CommandSearchModal.tsx';
import { PrivateCategoryPinModal } from './components/modals/PrivateCategoryPinModal.tsx';

const XBrandIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

declare global {
  interface Window {
    __LINKHUB_E2E_LOGIN__?: (profile?: Partial<UserProfile>) => void;
    __LINKHUB_E2E_PENDING_VERIFY__?: (email?: string) => void;
    __LINKHUB_E2E_LOGOUT__?: () => void;
  }
}

export default function App() {
  // Authentication & Firestore State
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [pendingVerificationUser, setPendingVerificationUser] = useState<FirebaseUser | null>(null);
  const [e2ePendingVerifyEmail, setE2ePendingVerifyEmail] = useState<string | null>(null);
  const e2eEmailVerifiedRef = useRef<boolean>(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isE2ESession, setIsE2ESession] = useState<boolean>(false);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [decryptedLinks, setDecryptedLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [vaultSyncing, setVaultSyncing] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [privateUnlockVersion, setPrivateUnlockVersion] = useState<number>(0);
  const seededDefaultCatsUidRef = useRef<string | null>(null);
  const pendingCategoryIdsRef = useRef<Set<string>>(new Set());
  const deletedCategoryIdsRef = useRef<Set<string>>(new Set());
  const pendingLinkIdsRef = useRef<Set<string>>(new Set());
  const deletedLinkIdsRef = useRef<Set<string>>(new Set());

  // UI Filter & Sort State
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('visits');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);

  // Toast feedback state
  const [toast, setToast] = useState<ToastData | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modals & Views state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [incognitoLink, setIncognitoLink] = useState<LinkItem | null>(null);
  const [isShareCategoryQrOpen, setIsShareCategoryQrOpen] = useState(false);
  const [shareCategorySlug, setShareCategorySlug] = useState<string>('');
  const [isScanQrOpen, setIsScanQrOpen] = useState(false);
  const [pendingSharedBundle, setPendingSharedBundle] = useState<SharedCategoryBundle | null>(null);
  const [pendingShareToken, setPendingShareToken] = useState<string | null>(null);
  const [pendingSharedSummary, setPendingSharedSummary] = useState<{
    categoryName: string;
    linkCount: number;
  } | null>(() => {
    const existing = peekPendingSharedImport();
    return existing
      ? { categoryName: existing.bundleName, linkCount: existing.chosenLinks.length }
      : null;
  });
  const [isCommandSearchOpen, setIsCommandSearchOpen] = useState(false);
  const [unlockedPrivateSlugs, setUnlockedPrivateSlugs] = useState<Set<string>>(() => new Set());
  const [pendingPrivateUnlock, setPendingPrivateUnlock] = useState<{
    category: Category;
    action: 'select' | 'edit' | 'delete' | 'share';
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const toastRemainingRef = useRef<number>(3600);
  const toastStartedAtRef = useRef<number>(0);

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const dismissToast = useCallback(() => {
    clearToastTimer();
    setToast(null);
  }, [clearToastTimer]);

  const scheduleToastDismiss = useCallback(
    (delayMs: number) => {
      clearToastTimer();
      toastRemainingRef.current = delayMs;
      toastStartedAtRef.current = Date.now();
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, delayMs);
    },
    [clearToastTimer]
  );

  const pauseToast = useCallback(() => {
    if (!toastTimerRef.current) return;
    clearToastTimer();
    const elapsed = Date.now() - toastStartedAtRef.current;
    toastRemainingRef.current = Math.max(400, toastRemainingRef.current - elapsed);
  }, [clearToastTimer]);

  const resumeToast = useCallback(() => {
    if (!toast || toastTimerRef.current) return;
    scheduleToastDismiss(toastRemainingRef.current);
  }, [toast, scheduleToastDismiss]);

  const showToast = useCallback(
    (message: string, variant?: ToastVariant) => {
      const durationMs = 3600;
      setToast({
        id: Date.now() + Math.floor(Math.random() * 1000),
        message,
        variant,
        durationMs,
      });
      scheduleToastDismiss(durationMs);
    },
    [scheduleToastDismiss]
  );

  // Ensure dark theme on root element & check for ?share= QR redirect URL on mount
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');

    // Clear any leftover browser storage from prior passwordless email-link attempts
    try {
      localStorage.removeItem('linkhub_pending_signup_email');
      sessionStorage.removeItem('linkhub_active_verify_session');
    } catch {}

    try {
      const params = new URLSearchParams(window.location.search);
      const shareParam = params.get('share');
      if (shareParam) {
        const serverToken = extractServerShareToken(shareParam);
        if (serverToken) {
          setPendingShareToken(serverToken);
          setIsScanQrOpen(true);
        } else {
          const decoded = decodeCategoryShareInput(
            shareParam,
            INITIAL_CATEGORIES,
            INITIAL_LINKS
          );
          if (decoded && decoded.links.length > 0) {
            setPendingSharedBundle(decoded);
            setIsScanQrOpen(true);
          }
        }
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch {
      // Ignore malformed query string
    }
  }, []);

  // Global keyboard shortcut for ⌘K Spotlight Command Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Automatically lock vault and wipe in-memory private category DEKs when user switches browser tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'hidden' &&
        userProfile &&
        (userProfile.autoLockMinutes ?? 1) > 0
      ) {
        clearAllActiveCategoryDeks();
        setIsLocked(true);
        setUnlockedPrivateSlugs(new Set());
        setPrivateUnlockVersion((v) => v + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userProfile]);

  useEffect(() => {
    if (userProfile?.soundEnabled !== undefined) {
      setSoundEnabled(userProfile.soundEnabled !== false);
    }
  }, [userProfile?.soundEnabled]);

  // Expose E2E test session helper strictly in local dev / explicit E2E builds (never in production)
  useEffect(() => {
    const viteEnv = (import.meta as { env?: Record<string, string | boolean | undefined> }).env || {};
    const allowE2E = Boolean(viteEnv.DEV || viteEnv.VITE_ENABLE_E2E_HOOK === 'true');
    if (!allowE2E) return;

    window.__LINKHUB_E2E_LOGIN__ = (customProfile?: Partial<UserProfile>) => {
      setIsE2ESession(true);
      setPendingVerificationUser(null);
      setE2ePendingVerifyEmail(null);
      e2eEmailVerifiedRef.current = false;
      setUserProfile({
        uid: customProfile?.uid || 'e2e_verified_user',
        email: customProfile?.email || 'debapriyo00@gmail.com',
        emailVerified: true,
        displayName: customProfile?.displayName || 'Debu Vault Admin',
        photoURL: customProfile?.photoURL || '',
        pin: customProfile?.pin || '',
        pinVerifier: customProfile?.pinVerifier || '',
        vaultVersion: 2,
      });
      setCategories(INITIAL_CATEGORIES);
      setLinks(INITIAL_LINKS);
      setAuthReady(true);
    };
    window.__LINKHUB_E2E_PENDING_VERIFY__ = (targetEmail = 'alex@linkhub.dev') => {
      clearAllActiveCategoryDeks();
      setIsE2ESession(false);
      setUserProfile(null);
      setPendingVerificationUser(null);
      e2eEmailVerifiedRef.current = false;
      setE2ePendingVerifyEmail(targetEmail);
      setAuthReady(true);
    };
    window.__LINKHUB_E2E_LOGOUT__ = () => {
      clearAllActiveCategoryDeks();
      setIsE2ESession(false);
      setPendingVerificationUser(null);
      setE2ePendingVerifyEmail(null);
      e2eEmailVerifiedRef.current = false;
      setUserProfile(null);
      setCategories(INITIAL_CATEGORIES);
      setLinks([]);
    };
    return () => {
      delete window.__LINKHUB_E2E_LOGIN__;
      delete window.__LINKHUB_E2E_PENDING_VERIFY__;
      delete window.__LINKHUB_E2E_LOGOUT__;
    };
  }, []);

  const loadCachedLinks = useCallback((uid: string): LinkItem[] | null => {
    try {
      const raw = localStorage.getItem(`linkhub_links_${uid}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, []);

  const saveCachedLinks = useCallback((uid: string, items: LinkItem[]) => {
    try {
      localStorage.setItem(`linkhub_links_${uid}`, JSON.stringify(items));
    } catch {}
  }, []);

  const loadCachedCategories = useCallback((uid: string): Category[] | null => {
    try {
      const raw = localStorage.getItem(`linkhub_categories_${uid}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0
        ? parsed.map((c: Category) => decodeCategoryFromStorage(c, uid))
        : null;
    } catch {
      return null;
    }
  }, []);

  const saveCachedCategories = useCallback((uid: string, items: Category[]) => {
    try {
      // Strip transient plaintext PIN fields before caching categories locally
      const safeForCache = items.map((c) => {
        const copy: Category = { ...c };
        delete copy.privatePin;
        return copy;
      });
      localStorage.setItem(`linkhub_categories_${uid}`, JSON.stringify(safeForCache));
    } catch {}
  }, []);

  const loadProfileExtras = useCallback((uid: string): Partial<UserProfile> => {
    try {
      const raw = localStorage.getItem(`linkhub_profile_extras_${uid}`);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      // Strip legacy plaintext secrets if present from v1
      delete parsed.pin;
      delete parsed.pinVerifier;
      delete parsed.securityAnswerHash;
      return parsed;
    } catch {
      return {};
    }
  }, []);

  const saveProfileExtras = useCallback((uid: string, extras: Partial<UserProfile>) => {
    try {
      const safeExtras: Partial<UserProfile> = { ...extras };
      // Never persist PINs, verifiers, or recovery answers into localStorage
      delete safeExtras.pin;
      delete safeExtras.pinVerifier;
      delete safeExtras.securityAnswerHash;
      localStorage.setItem(`linkhub_profile_extras_${uid}`, JSON.stringify(safeExtras));
    } catch {}
  }, []);

  const ensureUserDocumentExists = useCallback(
    async (uid: string): Promise<boolean> => {
      if (isE2ESession) return true;
      const fbUser = auth.currentUser;
      if (!fbUser) return false;
      if (!fbUser.emailVerified) {
        try {
          await reload(fbUser);
        } catch {}
      }
      try {
        const tokenRes = await fbUser.getIdTokenResult(false);
        if (!tokenRes?.claims?.email_verified) {
          await fbUser.getIdToken(true);
        }
      } catch {
        try {
          await fbUser.getIdToken(true);
        } catch {}
      }

      const userDocRef = doc(db, 'users', uid);
      try {
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          return true;
        }
        const initialProfilePayload = sanitizeUserProfileCreate({
          uid,
          email: fbUser.email || userProfile?.email || 'user@linkhub.cloud',
          displayName: fbUser.displayName || userProfile?.displayName || 'LINKHUB User',
          photoURL: fbUser.photoURL || userProfile?.photoURL || '',
          pin: '',
          pinVerifier: userProfile?.pinVerifier || '',
          vaultVersion: userProfile?.vaultVersion || 2,
        });
        await setDoc(userDocRef, initialProfilePayload);
        return true;
      } catch (error) {
        logFirestoreError(error, OperationType.WRITE, `users/${uid}`);
        return false;
      }
    },
    [
      isE2ESession,
      userProfile?.email,
      userProfile?.displayName,
      userProfile?.photoURL,
      userProfile?.pinVerifier,
      userProfile?.vaultVersion,
    ]
  );

  // Seed starter categories and bookmarks for a brand-new user in Firestore
  const seedStarterVaultInFirestore = useCallback(async (uid: string) => {
    const batch = writeBatch(db);
    INITIAL_CATEGORIES.forEach((cat, idx) => {
      const catPayload = sanitizeCategoryCreate(cat, uid, idx);
      const catRef = doc(db, `users/${uid}/categories`, catPayload.id);
      batch.set(catRef, catPayload);
    });
    INITIAL_LINKS.forEach((link) => {
      const linkPayload = sanitizeLinkCreate(link, uid);
      const linkRef = doc(db, `users/${uid}/links`, linkPayload.id);
      batch.set(linkRef, linkPayload);
    });
    try {
      await batch.commit();
    } catch (error) {
      logFirestoreError(error, OperationType.WRITE, `users/${uid}/starter-vault`);
    }
  }, []);

  const hydrateVerifiedFirebaseUser = useCallback(
    async (fbUser: FirebaseUser) => {
      setPendingVerificationUser(null);
      setIsE2ESession(false);
      const uid = sanitizeId(fbUser.uid, 128);
      const userDocRef = doc(db, 'users', uid);

      // Ensure the JWT attached to Firestore reflects email_verified: true before firing listeners
      try {
        const tokenRes = await fbUser.getIdTokenResult(false);
        if (!tokenRes?.claims?.email_verified) {
          await fbUser.getIdToken(true);
        }
      } catch {
        try {
          await fbUser.getIdToken(true);
        } catch {}
      }

      // 1. Immediately hydrate from local cache so the UI renders with zero network wait
      const cachedLinks = loadCachedLinks(uid);
      if (cachedLinks && cachedLinks.length > 0) {
        setLinks(cachedLinks);
      } else {
        setLinks(INITIAL_LINKS);
      }

      const cachedCats = loadCachedCategories(uid);
      if (cachedCats && cachedCats.length > 0) {
        setCategories(cachedCats);
      } else {
        setCategories(INITIAL_CATEGORIES);
      }

      const extras = loadProfileExtras(uid);
      setUserProfile({
        uid,
        email: extras.email || fbUser.email || 'user@linkhub.cloud',
        emailVerified: true,
        displayName:
          extras.displayName || fbUser.displayName || fbUser.email?.split('@')[0] || 'LINKHUB User',
        photoURL: extras.photoURL !== undefined ? extras.photoURL : fbUser.photoURL || '',
        pin: '',
        pinVerifier: '',
        vaultVersion: 2,
        ...extras,
      });
      setAuthReady(true);

      // 2. Background Firestore profile + preferences sync (non-blocking)
      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          seededDefaultCatsUidRef.current = uid;
          const initialProfilePayload = sanitizeUserProfileCreate({
            uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
            pin: '',
            pinVerifier: '',
            vaultVersion: 2,
          });
          if (!cachedLinks) {
            saveCachedLinks(uid, INITIAL_LINKS);
          }
          await setDoc(userDocRef, initialProfilePayload);
          await seedStarterVaultInFirestore(uid);
        } else {
          const data = snap.data();
          const storedPin = typeof data.pin === 'string' ? data.pin : '';
          const storedPinVerifier = typeof data.pinVerifier === 'string' ? data.pinVerifier : '';
          const latestExtras = loadProfileExtras(uid);

          // Firestore user document is authoritative over localStorage cache across devices
          const syncedUserProfile: UserProfile = {
            ...latestExtras,
            uid,
            email:
              (typeof data.email === 'string' && data.email) ||
              fbUser.email ||
              latestExtras.email ||
              'user@linkhub.cloud',
            emailVerified: true,
            displayName:
              (typeof data.displayName === 'string' && data.displayName) ||
              fbUser.displayName ||
              latestExtras.displayName ||
              'LINKHUB User',
            photoURL:
              typeof data.photoURL === 'string'
                ? data.photoURL
                : fbUser.photoURL || latestExtras.photoURL || '',
            pin: storedPin,
            pinVerifier: storedPinVerifier,
            vaultVersion: typeof data.vaultVersion === 'number' ? data.vaultVersion : 1,
          };
          saveProfileExtras(uid, syncedUserProfile);
          setUserProfile((prev) => ({
            ...syncedUserProfile,
            securityAnswerHash: prev?.securityAnswerHash,
          }));
          if (storedPinVerifier || storedPin.length === 6) {
            setIsLocked(true);
          }
        }

        // Load server-synced preferences (/users/{uid}/preferences/default)
        try {
          const prefSnap = await getDoc(doc(db, `users/${uid}/preferences`, 'default'));
          if (prefSnap.exists()) {
            const p = prefSnap.data();
            const validSorts: SortOption[] = ['visits', 'recent', 'oldest', 'alpha', 'alpha-desc'];
            const syncedSort =
              typeof p.sortOption === 'string' && validSorts.includes(p.sortOption as SortOption)
                ? (p.sortOption as SortOption)
                : undefined;
            if (syncedSort) {
              setSortOption(syncedSort);
            }
            setUserProfile((prev) => {
              if (!prev) return prev;
              const merged: UserProfile = {
                ...prev,
                firstName: typeof p.firstName === 'string' ? p.firstName : prev.firstName,
                lastName: typeof p.lastName === 'string' ? p.lastName : prev.lastName,
                countryCode: typeof p.countryCode === 'string' ? p.countryCode : prev.countryCode,
                autoLockMinutes:
                  typeof p.autoLockMinutes === 'number'
                    ? p.autoLockMinutes
                    : prev.autoLockMinutes,
                soundEnabled:
                  typeof p.soundEnabled === 'boolean' ? p.soundEnabled : prev.soundEnabled,
                confettiEnabled:
                  typeof p.confettiEnabled === 'boolean' ? p.confettiEnabled : prev.confettiEnabled,
                sortOption: syncedSort ?? prev.sortOption,
                securityQuestion:
                  typeof p.securityQuestion === 'string'
                    ? p.securityQuestion
                    : prev.securityQuestion,
                securityAnswerHash:
                  typeof p.securityAnswerHash === 'string'
                    ? p.securityAnswerHash
                    : prev.securityAnswerHash,
              };
              saveProfileExtras(uid, merged);
              return merged;
            });
          }
        } catch {
          // Non-fatal if preferences subcollection does not exist yet
        }
      } catch (error) {
        console.warn('Profile background sync warning:', error);
      } finally {
        setVaultSyncing(false);
      }
    },
    [
      loadCachedLinks,
      saveCachedLinks,
      loadCachedCategories,
      loadProfileExtras,
      saveProfileExtras,
      seedStarterVaultInFirestore,
    ]
  );

  // Listen to Firebase Auth state changes and hydrate immediately from cache before background Firestore sync
  useEffect(() => {
    const safetyTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 900);

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      window.clearTimeout(safetyTimer);

      if (!fbUser) {
        clearAllActiveCategoryDeks();
        if (!isE2ESession) {
          setPendingVerificationUser(null);
          setUserProfile(null);
          setLinks([]);
          setCategories(INITIAL_CATEGORIES);
          setIsLocked(false);
        }
        setAuthReady(true);
        return;
      }

      // Enforce Firebase verified email across all providers (no password-provider bypass)
      if (!fbUser.emailVerified) {
        clearAllActiveCategoryDeks();
        setIsE2ESession(false);
        setUserProfile(null);
        setLinks([]);
        setIsLocked(false);
        setPendingVerificationUser(fbUser);
        setAuthReady(true);
        return;
      }

      await hydrateVerifiedFirebaseUser(fbUser);
    });

    return () => {
      window.clearTimeout(safetyTimer);
      unsubscribeAuth();
    };
  }, [isE2ESession, hydrateVerifiedFirebaseUser]);

  // Real-Time Firestore Listeners for User Profile, Categories, and Links
  useEffect(() => {
    if (!authReady || !userProfile || isE2ESession || !auth.currentUser?.emailVerified) {
      return;
    }

    const uid = userProfile.uid;
    const categoriesPath = `users/${uid}/categories`;
    const linksPath = `users/${uid}/links`;

    const categoriesQuery = query(
      collection(db, categoriesPath),
      where('userId', '==', uid)
    );
    const linksQuery = query(
      collection(db, linksPath),
      where('userId', '==', uid)
    );

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setUserProfile((prev) => {
            const nextState: UserProfile = {
              ...(prev || {}),
              uid,
              email:
                typeof d.email === 'string' && d.email.length > 0
                  ? d.email
                  : prev?.email || auth.currentUser?.email || '',
              emailVerified: true,
              displayName:
                typeof d.displayName === 'string' && d.displayName.length > 0
                  ? d.displayName
                  : prev?.displayName || auth.currentUser?.displayName || 'LINKHUB User',
              photoURL:
                typeof d.photoURL === 'string'
                  ? d.photoURL
                  : prev?.photoURL ?? '',
              pin: typeof d.pin === 'string' ? d.pin : prev?.pin || '',
              pinVerifier: typeof d.pinVerifier === 'string' ? d.pinVerifier : prev?.pinVerifier || '',
              vaultVersion: typeof d.vaultVersion === 'number' ? d.vaultVersion : prev?.vaultVersion ?? 2,
            };
            saveProfileExtras(uid, nextState);
            return nextState;
          });
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, `users/${uid}`);
      }
    );

    const unsubPreferences = onSnapshot(
      doc(db, `users/${uid}/preferences`, 'default'),
      (prefSnap) => {
        if (!prefSnap.exists()) return;
        const p = prefSnap.data();
        const validSorts: SortOption[] = ['visits', 'recent', 'oldest', 'alpha', 'alpha-desc'];
        const syncedSort =
          typeof p.sortOption === 'string' && validSorts.includes(p.sortOption as SortOption)
            ? (p.sortOption as SortOption)
            : undefined;
        if (syncedSort) {
          setSortOption(syncedSort);
        }
        if (typeof p.soundEnabled === 'boolean') {
          setSoundEnabled(p.soundEnabled);
        }
        setUserProfile((prev) => {
          if (!prev) return prev;
          const nextState: UserProfile = {
            ...prev,
            firstName: typeof p.firstName === 'string' ? p.firstName : prev.firstName,
            lastName: typeof p.lastName === 'string' ? p.lastName : prev.lastName,
            countryCode: typeof p.countryCode === 'string' ? p.countryCode : prev.countryCode,
            autoLockMinutes:
              typeof p.autoLockMinutes === 'number' ? p.autoLockMinutes : prev.autoLockMinutes,
            soundEnabled:
              typeof p.soundEnabled === 'boolean' ? p.soundEnabled : prev.soundEnabled,
            confettiEnabled:
              typeof p.confettiEnabled === 'boolean' ? p.confettiEnabled : prev.confettiEnabled,
            sortOption: syncedSort ?? prev.sortOption,
            securityQuestion:
              typeof p.securityQuestion === 'string' ? p.securityQuestion : prev.securityQuestion,
            securityAnswerHash:
              typeof p.securityAnswerHash === 'string'
                ? p.securityAnswerHash
                : prev.securityAnswerHash,
          };
          saveProfileExtras(uid, nextState);
          return nextState;
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, `users/${uid}/preferences/default`);
      }
    );

    const unsubCategories = onSnapshot(
      categoriesQuery,
      (querySnap) => {
        const fetchedCategories: Category[] = querySnap.docs.map((d) => {
          const data = d.data();
          const rawCat: Category = {
            id: data.id || d.id,
            userId: data.userId || uid,
            name: data.name || 'General',
            slug: data.slug || 'general',
            color: data.color || '#ff9000',
            icon: data.icon || 'folder',
            description: data.description || '',
            isDefault: Boolean(data.isDefault),
            isPrivate: Boolean(data.isPrivate),
            privateVaultMeta: typeof data.privateVaultMeta === 'string' ? data.privateVaultMeta : '',
            order: typeof data.order === 'number' ? data.order : 0,
            createdAt: toMillis(data.createdAt),
          };
          return decodeCategoryFromStorage(rawCat, uid);
        });

        const serverIds = new Set(fetchedCategories.map((c) => c.id));
        serverIds.forEach((id) => pendingCategoryIdsRef.current.delete(id));
        Array.from(deletedCategoryIdsRef.current).forEach((id) => {
          if (!serverIds.has(id)) {
            deletedCategoryIdsRef.current.delete(id);
          }
        });

        let defaultsToSeed: Category[] = [];
        setCategories((prev) => {
          const { mergedCategories, missingDefaults } = mergeCategoriesWithPendingLocal({
            prevCategories: prev,
            fetchedCategories,
            defaultCategories: INITIAL_CATEGORIES,
            uid,
            pendingIds: pendingCategoryIdsRef.current,
            deletedIds: deletedCategoryIdsRef.current,
          });
          defaultsToSeed = missingDefaults;
          saveCachedCategories(uid, mergedCategories);
          return mergedCategories;
        });

        // Seed any missing given categories to Firestore once per session (only after parent user doc exists)
        if (defaultsToSeed.length > 0 && seededDefaultCatsUidRef.current !== uid) {
          void (async () => {
            const parentReady = await ensureUserDocumentExists(uid);
            if (!parentReady) return;
            seededDefaultCatsUidRef.current = uid;
            const batch = writeBatch(db);
            defaultsToSeed.forEach((def, idx) => {
              const catPayload = sanitizeCategoryCreate(def, uid, def.order ?? idx);
              const catRef = doc(db, categoriesPath, catPayload.id);
              batch.set(catRef, catPayload);
            });
            try {
              await batch.commit();
            } catch (err) {
              seededDefaultCatsUidRef.current = null;
              logFirestoreError(err, OperationType.WRITE, categoriesPath);
            }
          })();
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.LIST, categoriesPath);
      }
    );

    const unsubLinks = onSnapshot(
      linksQuery,
      (querySnap) => {
        const fetchedLinks: LinkItem[] = querySnap.docs.map((d) => {
          const data = d.data();
          const rawTitle = data.title || 'Untitled Link';
          const rawUrl = data.url || 'https://example.com';
          const rawDesc = data.description || '';
          return {
            id: data.id || d.id,
            userId: data.userId || uid,
            title: rawTitle,
            url: rawUrl,
            categorySlug: data.categorySlug || 'study',
            description: rawDesc,
            tags: Array.isArray(data.tags) ? data.tags : [],
            isFavorite: Boolean(data.isFavorite),
            clickCount: typeof data.clickCount === 'number' ? data.clickCount : 0,
            imageUrl: data.imageUrl || '',
            faviconUrl: data.faviconUrl || '',
            isEncrypted:
              Boolean(data.isEncrypted) ||
              isLinkEncrypted({ title: rawTitle, url: rawUrl, description: rawDesc }),
            cryptoVersion: typeof data.cryptoVersion === 'number' ? data.cryptoVersion : 1,
            createdAt: toMillis(data.createdAt),
            updatedAt: toMillis(data.updatedAt),
          };
        });

        const serverIds = new Set(fetchedLinks.map((l) => l.id));
        serverIds.forEach((id) => pendingLinkIdsRef.current.delete(id));
        Array.from(deletedLinkIdsRef.current).forEach((id) => {
          if (!serverIds.has(id)) {
            deletedLinkIdsRef.current.delete(id);
          }
        });

        setLinks((prev) => {
          const filteredServer = fetchedLinks.filter((l) => !deletedLinkIdsRef.current.has(l.id));
          const pendingLocal = prev.filter(
            (l) => pendingLinkIdsRef.current.has(l.id) && !serverIds.has(l.id)
          );
          const merged = [...pendingLocal, ...filteredServer];
          saveCachedLinks(uid, merged);
          return merged;
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.LIST, linksPath);
      }
    );

    return () => {
      unsubProfile();
      unsubPreferences();
      unsubCategories();
      unsubLinks();
    };
  }, [
    authReady,
    userProfile?.uid,
    isE2ESession,
    saveCachedLinks,
    saveCachedCategories,
    saveProfileExtras,
    ensureUserDocumentExists,
  ]);

  // Set of private category slugs (both exact and lowercase normalized)
  const privateCategorySlugs = useMemo(() => {
    const slugs = new Set<string>();
    categories.forEach((c) => {
      if (c.isPrivate) {
        slugs.add(c.slug);
        slugs.add((c.slug || '').toLowerCase().trim());
      }
    });
    return slugs;
  }, [categories]);

  // Decrypt links asynchronously in RAM only for private categories whose DEK is currently unlocked
  useEffect(() => {
    let cancelled = false;
    const uid = userProfile?.uid || '';
    const catBySlug = new Map<string, Category>();
    categories.forEach((c) => {
      catBySlug.set(c.slug, c);
      catBySlug.set((c.slug || '').toLowerCase().trim(), c);
    });

    const runDecryption = async () => {
      const resolved = await Promise.all(
        links.map(async (link) => {
          const normSlug = (link.categorySlug || '').toLowerCase().trim();
          const cat = catBySlug.get(link.categorySlug) || catBySlug.get(normSlug);
          if (cat?.isPrivate || isLinkEncrypted(link) || link.isEncrypted) {
            const isUnlocked = Boolean(
              cat && (unlockedPrivateSlugs.has(cat.slug) || unlockedPrivateSlugs.has(normSlug))
            );
            if (!uid || !isUnlocked) {
              return maskedPrivateLink(link);
            }
            return decryptLinkInMemoryAsync(link, uid, cat, isUnlocked);
          }
          return link;
        })
      );
      if (!cancelled) {
        setDecryptedLinks(resolved);
      }
    };

    void runDecryption();
    return () => {
      cancelled = true;
    };
  }, [links, categories, unlockedPrivateSlugs, userProfile?.uid, privateUnlockVersion]);

  // Non-private links (used for All Links count, Favorites count, and global search suggestions when private categories are locked)
  const publicLinks = useMemo(() => {
    return decryptedLinks.filter((l) => {
      const normSlug = (l.categorySlug || '').toLowerCase().trim();
      return (
        !privateCategorySlugs.has(l.categorySlug) &&
        !privateCategorySlugs.has(normSlug) &&
        !l.isEncrypted &&
        !isLinkEncrypted(l)
      );
    });
  }, [decryptedLinks, privateCategorySlugs]);

  // Searchable links for Navbar & CommandSearch (includes public links + any currently unlocked private category links)
  const searchableLinks = useMemo(() => {
    return decryptedLinks.filter((l) => {
      const normSlug = (l.categorySlug || '').toLowerCase().trim();
      if (privateCategorySlugs.has(l.categorySlug) || privateCategorySlugs.has(normSlug)) {
        return unlockedPrivateSlugs.has(l.categorySlug) || unlockedPrivateSlugs.has(normSlug);
      }
      return !l.isEncrypted && !isLinkEncrypted(l);
    });
  }, [decryptedLinks, privateCategorySlugs, unlockedPrivateSlugs]);

  // Filtered links calculation (Private links NEVER appear in All Links or Favorites)
  const filteredLinks = useMemo(() => {
    const normActive = (activeCategory || '').toLowerCase().trim();
    if (
      activeCategory !== 'all' &&
      activeCategory !== 'starred' &&
      (privateCategorySlugs.has(activeCategory) || privateCategorySlugs.has(normActive)) &&
      !unlockedPrivateSlugs.has(activeCategory) &&
      !unlockedPrivateSlugs.has(normActive)
    ) {
      return [];
    }

    const baseList =
      activeCategory === 'all' || activeCategory === 'starred' ? publicLinks : decryptedLinks;

    return filterAndSortLinks(baseList, {
      categorySlug: activeCategory,
      searchQuery,
      activeTag,
      starredOnly,
      sortOption,
      privateCategorySlugs,
    });
  }, [
    decryptedLinks,
    publicLinks,
    activeCategory,
    searchQuery,
    activeTag,
    starredOnly,
    sortOption,
    privateCategorySlugs,
    unlockedPrivateSlugs,
  ]);

  // Category counts & Dashboard Metrics
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    links.forEach((l) => {
      counts[l.categorySlug] = (counts[l.categorySlug] || 0) + 1;
    });
    return counts;
  }, [links]);

  const starredCount = useMemo(() => {
    return publicLinks.filter((l) => l.isFavorite).length;
  }, [publicLinks]);

  const handleSelectCategoryWithGate = useCallback(
    (slug: string) => {
      playRetroClick();
      if (slug === 'all' || slug === 'starred') {
        setActiveCategory(slug);
        return;
      }
      const targetCat = categories.find((c) => c.slug === slug);
      if (targetCat?.isPrivate && !unlockedPrivateSlugs.has(slug)) {
        setPendingPrivateUnlock({ category: targetCat, action: 'select' });
        return;
      }
      setActiveCategory(slug);
    },
    [categories, unlockedPrivateSlugs]
  );

  const handleLockPrivateCategory = useCallback(
    (slug: string) => {
      playRetroLock();
      if (userProfile?.uid) {
        clearActiveCategoryDek(userProfile.uid, slug);
      }
      setUnlockedPrivateSlugs((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
      setPrivateUnlockVersion((v) => v + 1);
      if (activeCategory === slug) {
        setActiveCategory('all');
      }
      showToast('Category locked!');
    },
    [activeCategory, userProfile?.uid, showToast]
  );

  // ============================================================================
  // Cloud Firestore CRUD Handlers (Optimistic UI + Local Cache + Firestore Sync)
  // ============================================================================
  const handleSaveLink = async (linkData: Partial<LinkItem>) => {
    if (!userProfile) return;
    const uid = userProfile.uid;

    if (editingLink) {
      const targetId = editingLink.id;
      const targetSlug = linkData.categorySlug || editingLink.categorySlug || 'study';
      const targetCat = categories.find((c) => c.slug === targetSlug);

      let preparedInput: Partial<LinkItem>;
      if (targetCat?.isPrivate) {
        try {
          preparedInput = await encryptLinkForStorageAsync(
            { ...editingLink, ...linkData, id: targetId },
            uid,
            targetCat
          );
        } catch {
          playRetroBeep();
          showToast(`Unlock "${targetCat.name}" with your PIN before saving links.`, 'warning');
          return;
        }
      } else {
        preparedInput = {
          ...editingLink,
          ...linkData,
          id: targetId,
          isEncrypted: false,
          cryptoVersion: 1,
        };
      }

      const sanitized = sanitizeLinkCreate(preparedInput, uid);

      setLinks((prev) => {
        const next = prev.map((l) =>
          l.id === targetId
            ? {
                ...l,
                title: sanitized.title,
                url: sanitized.url,
                categorySlug: sanitized.categorySlug,
                description: sanitized.description,
                tags: sanitized.tags,
                isFavorite: sanitized.isFavorite,
                imageUrl: sanitized.imageUrl,
                faviconUrl: sanitized.faviconUrl,
                isEncrypted: sanitized.isEncrypted,
                cryptoVersion: sanitized.cryptoVersion,
                updatedAt: Date.now(),
              }
            : l
        );
        saveCachedLinks(uid, next);
        return next;
      });

      showToast(targetCat?.isPrivate ? 'Private link updated!' : 'Link updated!');
      setEditingLink(null);

      if (!isE2ESession) {
        try {
          await updateDoc(doc(db, `users/${uid}/links`, targetId), {
            title: sanitized.title,
            url: sanitized.url,
            categorySlug: sanitized.categorySlug,
            description: sanitized.description,
            tags: sanitized.tags,
            isFavorite: sanitized.isFavorite,
            imageUrl: sanitized.imageUrl,
            faviconUrl: sanitized.faviconUrl,
            isEncrypted: sanitized.isEncrypted,
            cryptoVersion: sanitized.cryptoVersion,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          console.warn('Firestore update fallback to setDoc:', error);
          try {
            await setDoc(doc(db, `users/${uid}/links`, targetId), sanitized);
          } catch (innerErr) {
            console.warn('Could not sync updated link to Firestore:', innerErr);
          }
        }
      }
    } else {
      const defaultSlug = categories[0]?.slug || 'study';
      const targetSlug = linkData.categorySlug || defaultSlug;
      const targetCat = categories.find((c) => c.slug === targetSlug);
      const newId = `link-${Date.now()}`;

      let preparedInput: Partial<LinkItem>;
      if (targetCat?.isPrivate) {
        try {
          preparedInput = await encryptLinkForStorageAsync(
            {
              ...linkData,
              id: newId,
              categorySlug: targetSlug,
            },
            uid,
            targetCat
          );
        } catch {
          playRetroBeep();
          showToast(`Unlock "${targetCat.name}" with your PIN before adding private links.`, 'warning');
          return;
        }
      } else {
        preparedInput = {
          ...linkData,
          id: newId,
          categorySlug: targetSlug,
          isEncrypted: false,
          cryptoVersion: 1,
        };
      }

      const payload = sanitizeLinkCreate(preparedInput, uid);

      const newLinkItem: LinkItem = {
        ...payload,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      pendingLinkIdsRef.current.add(newLinkItem.id);
      setLinks((prev) => {
        const next = [newLinkItem, ...prev.filter((l) => l.id !== newLinkItem.id)];
        saveCachedLinks(uid, next);
        return next;
      });

      if (targetCat?.isPrivate) {
        if (unlockedPrivateSlugs.has(targetCat.slug)) {
          setActiveCategory(targetCat.slug);
        }
      } else {
        if (
          activeCategory !== 'all' &&
          activeCategory !== 'starred' &&
          activeCategory !== newLinkItem.categorySlug
        ) {
          setActiveCategory('all');
        }
        if ((activeCategory === 'starred' || starredOnly) && !newLinkItem.isFavorite) {
          setStarredOnly(false);
          if (activeCategory === 'starred') setActiveCategory('all');
        }
      }

      if (searchQuery) {
        setSearchQuery('');
      }
      if (activeTag && !newLinkItem.tags.includes(activeTag)) {
        setActiveTag(null);
      }

      showToast(targetCat?.isPrivate ? 'Link encrypted & saved!' : 'Link saved to vault!');
      if (userProfile?.confettiEnabled !== false) {
        try {
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.8 },
            colors: ['#ff9000', '#ffa31a', '#ffffff'],
          });
        } catch {}
      }

      if (!isE2ESession) {
        try {
          await ensureUserDocumentExists(uid);
          await setDoc(doc(db, `users/${uid}/links`, payload.id), payload);
        } catch (error) {
          logFirestoreError(error, OperationType.CREATE, `users/${uid}/links/${payload.id}`);
        }
      }
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!userProfile) return;
    const linkToDelete = links.find((l) => l.id === id);
    if (!linkToDelete) return;
    playRetroClick();

    pendingLinkIdsRef.current.delete(id);
    deletedLinkIdsRef.current.add(id);

    setLinks((prev) => {
      const next = prev.filter((l) => l.id !== id);
      saveCachedLinks(userProfile.uid, next);
      return next;
    });
    showToast('Link deleted!');

    if (!isE2ESession) {
      try {
        await deleteDoc(doc(db, `users/${userProfile.uid}/links`, id));
      } catch (error) {
        logFirestoreError(error, OperationType.DELETE, `users/${userProfile.uid}/links/${id}`);
      }
    }
  };

  const handleToggleFavorite = async (id: string) => {
    if (!userProfile) return;
    const target = links.find((l) => l.id === id);
    if (!target) return;
    playRetroClick();

    const nextFav = !target.isFavorite;
    setLinks((prev) => {
      const next = prev.map((l) =>
        l.id === id ? { ...l, isFavorite: nextFav, updatedAt: Date.now() } : l
      );
      saveCachedLinks(userProfile.uid, next);
      return next;
    });

    if (!isE2ESession) {
      try {
        await updateDoc(doc(db, `users/${userProfile.uid}/links`, id), {
          isFavorite: nextFav,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Could not toggle favorite in Firestore:', error);
      }
    }
  };

  const handleOpenLink = async (link: LinkItem) => {
    if (!userProfile) return;
    playRetroClick();
    window.open(link.url, '_blank', 'noopener,noreferrer');

    const nextCount = (link.clickCount || 0) + 1;
    setLinks((prev) => {
      const next = prev.map((l) =>
        l.id === link.id ? { ...l, clickCount: nextCount, updatedAt: Date.now() } : l
      );
      saveCachedLinks(userProfile.uid, next);
      return next;
    });

    if (!isE2ESession) {
      try {
        await updateDoc(doc(db, `users/${userProfile.uid}/links`, link.id), {
          clickCount: nextCount,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Could not update clickCount in Firestore:', error);
      }
    }
  };

  const handleCopyUrl = (url: string) => {
    playRetroClick();
    navigator.clipboard.writeText(url);
    showToast('Link copied!');
  };

  const handleTagClick = (tag: string) => {
    playRetroClick();
    setActiveTag(activeTag === tag ? null : tag);
  };

  // Category CRUD operations in Firestore (with AES-256-GCM Private Category support)
  const handleSaveCategory = async (catData: Partial<Category>): Promise<boolean> => {
    if (!userProfile) return false;
    const uid = userProfile.uid;

    if (editingCategory) {
      const targetId = editingCategory.id;
      let encoded: Awaited<ReturnType<typeof encodeCategoryForStorageAsync>>;
      try {
        encoded = await encodeCategoryForStorageAsync(
          { ...editingCategory, ...catData, id: targetId },
          uid
        );
      } catch (err) {
        playRetroBeep();
        showToast(err instanceof Error ? err.message : 'Could not secure private category.', 'error');
        return false;
      }

      const sanitized = sanitizeCategoryCreate(
        {
          ...editingCategory,
          ...catData,
          id: targetId,
          name: encoded.name,
          slug: encoded.slug,
          description: encoded.description,
          isPrivate: encoded.isPrivate,
          privateVaultMeta: encoded.privateVaultMeta,
        },
        uid,
        editingCategory.order
      );

      const displayCat: Category = {
        ...decodeCategoryFromStorage(
          {
            ...sanitized,
            createdAt: editingCategory.createdAt || Date.now(),
          },
          uid
        ),
        name: encoded.name,
      };

      const prevSnapshot = categories;
      setCategories((prev) => {
        const next = prev.map((c) => (c.id === targetId ? displayCat : c));
        saveCachedCategories(uid, next);
        return next;
      });

      const newlyEncryptedLinks: LinkItem[] = [];
      if (displayCat.isPrivate) {
        setUnlockedPrivateSlugs((prev) => new Set(prev).add(displayCat.slug));
        setPrivateUnlockVersion((v) => v + 1);

        const sourceLinks = decryptedLinks.length === links.length ? decryptedLinks : links;
        const targets = sourceLinks.filter(
          (l) =>
            (l.categorySlug === displayCat.slug ||
              (l.categorySlug || '').toLowerCase().trim() ===
                (displayCat.slug || '').toLowerCase().trim()) &&
            !isLinkEncrypted(l)
        );

        for (const l of targets) {
          try {
            const enc = await encryptLinkForStorageAsync(l, uid, displayCat);
            newlyEncryptedLinks.push({
              ...l,
              title: enc.title || l.title,
              url: enc.url || l.url,
              description: enc.description || '',
              imageUrl: '',
              faviconUrl: '',
              isEncrypted: true,
              cryptoVersion: 2,
            });
          } catch (err) {
            console.warn('Could not encrypt existing link in category:', err);
          }
        }

        if (newlyEncryptedLinks.length > 0) {
          const encById = new Map(newlyEncryptedLinks.map((l) => [l.id, l]));
          setLinks((prev) => {
            const next = prev.map((l) => encById.get(l.id) || l);
            saveCachedLinks(uid, next);
            return next;
          });
        }
      }

      if (!isE2ESession) {
        const catPath = `users/${uid}/categories/${targetId}`;
        const writeCategoryUpdate = async () => {
          await ensureUserDocumentExists(uid);
          try {
            await updateDoc(doc(db, `users/${uid}/categories`, targetId), {
              name: sanitized.name,
              slug: sanitized.slug,
              color: sanitized.color,
              icon: sanitized.icon,
              description: sanitized.description,
              isPrivate: sanitized.isPrivate,
              privateVaultMeta: sanitized.privateVaultMeta,
              order: sanitized.order,
              updatedAt: serverTimestamp(),
            });
          } catch {
            await setDoc(doc(db, `users/${uid}/categories`, targetId), sanitized);
          }
        };

        try {
          await writeCategoryUpdate();
        } catch {
          try {
            await auth.currentUser?.getIdToken(true);
            await writeCategoryUpdate();
          } catch (finalErr) {
            setCategories(prevSnapshot);
            saveCachedCategories(uid, prevSnapshot);
            logFirestoreError(finalErr, OperationType.UPDATE, catPath);
            playRetroBeep();
            showToast('Could not update category in cloud vault. Please try again.', 'error');
            return false;
          }
        }

        for (const encLink of newlyEncryptedLinks) {
          const sanitizedLink = sanitizeLinkCreate(encLink, uid);
          try {
            await updateDoc(doc(db, `users/${uid}/links`, encLink.id), {
              title: sanitizedLink.title,
              url: sanitizedLink.url,
              categorySlug: sanitizedLink.categorySlug,
              description: sanitizedLink.description,
              tags: sanitizedLink.tags,
              isFavorite: sanitizedLink.isFavorite,
              imageUrl: '',
              faviconUrl: '',
              isEncrypted: true,
              cryptoVersion: 2,
              updatedAt: serverTimestamp(),
            });
          } catch {
            try {
              await setDoc(doc(db, `users/${uid}/links`, encLink.id), sanitizedLink);
            } catch (linkErr) {
              logFirestoreError(linkErr, OperationType.UPDATE, `users/${uid}/links/${encLink.id}`);
            }
          }
        }
      }

      showToast(displayCat.isPrivate ? 'Private category updated!' : 'Category updated!');
      setEditingCategory(null);
      return true;
    } else {
      const newCatId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const uniqueSlug = generateUniqueCategorySlug(
        catData.name || 'Category',
        categories.map((c) => c.slug)
      );

      let encoded: Awaited<ReturnType<typeof encodeCategoryForStorageAsync>>;
      try {
        encoded = await encodeCategoryForStorageAsync(
          {
            ...catData,
            slug: uniqueSlug,
            id: newCatId,
          },
          uid
        );
      } catch (err) {
        playRetroBeep();
        showToast(err instanceof Error ? err.message : 'Could not secure private category.', 'error');
        return false;
      }

      const payload = sanitizeCategoryCreate(
        {
          ...catData,
          id: newCatId,
          name: encoded.name,
          slug: encoded.slug,
          description: encoded.description,
          isPrivate: encoded.isPrivate,
          privateVaultMeta: encoded.privateVaultMeta,
          isDefault: false,
        },
        uid,
        categories.length
      );

      const displayCat: Category = {
        ...decodeCategoryFromStorage(
          {
            ...payload,
            createdAt: Date.now(),
          },
          uid
        ),
        name: encoded.name,
      };

      pendingCategoryIdsRef.current.add(payload.id);
      setCategories((prev) => {
        const next = [...prev, displayCat];
        saveCachedCategories(uid, next);
        return next;
      });

      if (!isE2ESession) {
        const catPath = `users/${uid}/categories/${payload.id}`;
        const createCategoryDoc = async () => {
          const parentReady = await ensureUserDocumentExists(uid);
          if (!parentReady) {
            throw new Error('Parent user vault profile could not be initialized.');
          }
          await setDoc(doc(db, `users/${uid}/categories`, payload.id), payload);
        };

        try {
          await createCategoryDoc();
        } catch {
          try {
            await auth.currentUser?.getIdToken(true);
            await createCategoryDoc();
          } catch (finalErr) {
            pendingCategoryIdsRef.current.delete(payload.id);
            setCategories((prev) => {
              const rolledBack = prev.filter((c) => c.id !== payload.id);
              saveCachedCategories(uid, rolledBack);
              return rolledBack;
            });
            logFirestoreError(finalErr, OperationType.CREATE, catPath);
            playRetroBeep();
            showToast(
              'Could not save new category to cloud vault. Please verify your session and try again.',
              'error'
            );
            return false;
          }
        }
      }

      if (displayCat.isPrivate) {
        setUnlockedPrivateSlugs((prev) => new Set(prev).add(displayCat.slug));
        setPrivateUnlockVersion((v) => v + 1);
        setActiveCategory(displayCat.slug);
        showToast('Private category created & encrypted (AES-256-GCM)!');
      } else {
        showToast('Category created!');
      }
      return true;
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!userProfile) return;
    if (categories.length <= 1) {
      playRetroBeep();
      showToast('Keep at least 1 category!');
      return;
    }
    playRetroClick();
    const uid = userProfile.uid;
    const fallbackSlug = categories.find((c) => c.id !== cat.id)?.slug || 'general';

    pendingCategoryIdsRef.current.delete(cat.id);
    deletedCategoryIdsRef.current.add(cat.id);

    setCategories((prev) => {
      const next = prev.filter((c) => c.id !== cat.id);
      saveCachedCategories(uid, next);
      return next;
    });
    setLinks((prev) => {
      const next = prev.map((l) =>
        l.categorySlug === cat.slug ? { ...l, categorySlug: fallbackSlug } : l
      );
      saveCachedLinks(uid, next);
      return next;
    });

    if (activeCategory === cat.slug) {
      setActiveCategory('all');
    }
    showToast('Category deleted!');

    if (!isE2ESession) {
      const batch = writeBatch(db);
      batch.delete(doc(db, `users/${uid}/categories`, cat.id));
      links
        .filter((l) => l.categorySlug === cat.slug)
        .forEach((l) => {
          batch.update(doc(db, `users/${uid}/links`, l.id), {
            categorySlug: fallbackSlug,
            updatedAt: serverTimestamp(),
          });
        });
      try {
        await batch.commit();
      } catch (error) {
        logFirestoreError(error, OperationType.DELETE, `users/${uid}/categories/${cat.id}`);
      }
    }
  };

  const handleReorderCategories = async (fromIndex: number, toIndex: number) => {
    if (!userProfile) return;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= categories.length ||
      toIndex >= categories.length
    ) {
      return;
    }
    playRetroClick();
    const uid = userProfile.uid;

    const next = [...categories];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const reordered = next.map((c, idx) => ({ ...c, order: idx }));
    setCategories(reordered);
    saveCachedCategories(uid, reordered);

    if (!isE2ESession) {
      await ensureUserDocumentExists(uid);
      const batch = writeBatch(db);
      reordered.forEach((cat, idx) => {
        batch.update(doc(db, `users/${uid}/categories`, cat.id), {
          order: idx,
          updatedAt: serverTimestamp(),
        });
      });
      try {
        await batch.commit();
      } catch (error) {
        logFirestoreError(error, OperationType.UPDATE, `users/${uid}/categories`);
      }
    }
  };

  const handleSaveSharedCategoryLinks = useCallback(
    async (
      sharedLinks: Array<{
        title: string;
        url: string;
        description?: string;
        tags?: string[];
      }>,
      targetCategorySlug: string,
      newCategoryMeta?: {
        name: string;
        slug: string;
        icon?: string;
        color?: string;
        description?: string;
      }
    ) => {
      const destCatName =
        newCategoryMeta?.name ||
        pendingSharedBundle?.categoryName ||
        categories.find((c) => c.slug === targetCategorySlug)?.name ||
        targetCategorySlug;

      // If the user is not logged in yet, queue their selected links and prompt them to sign in
      if (!userProfile) {
        savePendingSharedImport({
          chosenLinks: sharedLinks,
          targetCategorySlug,
          newCategoryMeta,
          bundleName: destCatName,
          savedAt: Date.now(),
        });
        setPendingSharedSummary({
          categoryName: destCatName,
          linkCount: sharedLinks.length,
        });
        showToast(
          `${sharedLinks.length} link${sharedLinks.length === 1 ? '' : 's'} queued — login to save!`
        );
        return;
      }

      const uid = userProfile.uid;
      let destinationSlug = targetCategorySlug;

      let createdCategoryPayload: ReturnType<typeof sanitizeCategoryCreate> | null = null;
      if (newCategoryMeta && !categories.some((c) => c.slug === newCategoryMeta.slug)) {
        const uniqueSlug = generateUniqueCategorySlug(
          newCategoryMeta.name || newCategoryMeta.slug,
          categories.map((c) => c.slug)
        );
        createdCategoryPayload = sanitizeCategoryCreate(
          {
            id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: newCategoryMeta.name,
            slug: uniqueSlug,
            icon: newCategoryMeta.icon || 'Sparkles',
            color: newCategoryMeta.color || '#ff9000',
            description: newCategoryMeta.description || 'Shared category collection',
            isDefault: false,
          },
          uid,
          categories.length
        );
        destinationSlug = createdCategoryPayload.slug;
        pendingCategoryIdsRef.current.add(createdCategoryPayload.id);
        setCategories((prev) => {
          const next = [
            ...prev,
            {
              ...createdCategoryPayload!,
              createdAt: Date.now(),
            },
          ];
          saveCachedCategories(uid, next);
          return next;
        });
      }

      const now = Date.now();
      const newItems: LinkItem[] = sharedLinks.map((item, idx) => {
        const payload = sanitizeLinkCreate(
          {
            id: `link-shared-${now}-${idx}`,
            title: item.title,
            url: item.url,
            description: item.description || '',
            categorySlug: destinationSlug,
            tags: item.tags && item.tags.length > 0 ? item.tags : ['shared'],
            isFavorite: false,
            clickCount: 0,
          },
          uid
        );
        return {
          ...payload,
          createdAt: now + idx,
          updatedAt: now + idx,
        };
      });

      setLinks((prev) => {
        const next = [...newItems, ...prev];
        saveCachedLinks(uid, next);
        return next;
      });
      setActiveCategory(destinationSlug);

      if (!isE2ESession) {
        await ensureUserDocumentExists(uid);
        const batch = writeBatch(db);
        if (createdCategoryPayload) {
          batch.set(
            doc(db, `users/${uid}/categories`, createdCategoryPayload.id),
            createdCategoryPayload
          );
        }
        newItems.forEach((item) => {
          const payload = sanitizeLinkCreate(item, uid);
          batch.set(doc(db, `users/${uid}/links`, payload.id), payload);
        });
        try {
          await batch.commit();
        } catch (error) {
          logFirestoreError(error, OperationType.WRITE, `users/${uid}/shared-import`);
        }
      }

      setPendingSharedBundle(null);
      setPendingSharedSummary(null);
      showToast(`Saved ${newItems.length} shared link${newItems.length === 1 ? '' : 's'}!`);
    },
    [
      userProfile,
      categories,
      pendingSharedBundle,
      isE2ESession,
      saveCachedLinks,
      saveCachedCategories,
      ensureUserDocumentExists,
      showToast,
    ]
  );

  // Automatically import any pre-login selected shared links once the user logs in
  useEffect(() => {
    if (!authReady || !userProfile) return;
    const pending = consumePendingSharedImport();
    if (pending && pending.chosenLinks.length > 0) {
      handleSaveSharedCategoryLinks(
        pending.chosenLinks,
        pending.targetCategorySlug,
        pending.newCategoryMeta
      );
    }
  }, [authReady, userProfile, handleSaveSharedCategoryLinks]);

  // Lock and PBKDF2 PIN / Recovery verification operations
  const handleLockVault = () => {
    playRetroLock();
    clearAllActiveCategoryDeks();
    setIsLocked(true);
    setUnlockedPrivateSlugs(new Set());
    setPrivateUnlockVersion((v) => v + 1);
    if (privateCategorySlugs.has(activeCategory)) {
      setActiveCategory('all');
    }
    showToast('Vault locked!');
  };

  const handleSavePin = async (newPin: string | null) => {
    if (!userProfile) return;
    const cleanPin = sanitizePin(newPin);
    const verifier = cleanPin.length === 6 ? await createSecretVerifier(cleanPin, 'vault-pin') : '';

    setUserProfile((prev) =>
      prev
        ? {
            ...prev,
            pin: '',
            pinVerifier: verifier,
            vaultVersion: 2,
          }
        : null
    );

    if (!isE2ESession) {
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          pin: '',
          pinVerifier: verifier,
          vaultVersion: 2,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Could not sync PIN verifier to Firestore:', error);
      }
    }

    if (cleanPin.length === 6) {
      showToast('Security PIN secured!');
    } else {
      showToast('Security PIN removed!');
    }
  };

  const handleVerifyVaultPin = useCallback(
    async (candidatePin: string): Promise<boolean> => {
      if (!userProfile) return false;
      if (userProfile.pinVerifier) {
        return verifySecretVerifier(candidatePin, userProfile.pinVerifier, 'vault-pin');
      }
      if (userProfile.pin && userProfile.pin.length === 6) {
        const matched = candidatePin === userProfile.pin;
        if (matched) {
          // Silently upgrade legacy v1 plaintext PIN to v2 PBKDF2 verifier on first successful unlock
          const upgradedVerifier = await createSecretVerifier(candidatePin, 'vault-pin');
          setUserProfile((prev) =>
            prev ? { ...prev, pin: '', pinVerifier: upgradedVerifier, vaultVersion: 2 } : prev
          );
          if (!isE2ESession) {
            updateDoc(doc(db, 'users', userProfile.uid), {
              pin: '',
              pinVerifier: upgradedVerifier,
              vaultVersion: 2,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }
        return matched;
      }
      return false;
    },
    [userProfile, isE2ESession]
  );

  const handleVerifySecurityAnswer = useCallback(
    async (answer: string): Promise<boolean> => {
      if (!userProfile?.securityAnswerHash) return false;
      const normalized = answer.trim().toLowerCase();
      if (!normalized) return false;
      return verifySecretVerifier(normalized, userProfile.securityAnswerHash, 'security-answer');
    },
    [userProfile?.securityAnswerHash]
  );

  const handleReauthenticateRecovery = useCallback(
    async (password?: string): Promise<boolean> => {
      if (isE2ESession || !auth.currentUser) return false;
      const providers = auth.currentUser.providerData.map((p) => p.providerId);
      try {
        if (providers.includes('google.com')) {
          await reauthenticateWithPopup(auth.currentUser, googleProvider);
          return true;
        }
        if (providers.includes('password') && password && auth.currentUser.email) {
          const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
          await reauthenticateWithCredential(auth.currentUser, cred);
          return true;
        }
      } catch (err) {
        console.warn('Re-authentication failed:', err);
        return false;
      }
      return false;
    },
    [isE2ESession]
  );

  // Sign out handler
  const handleSignOut = async () => {
    playRetroClick();
    clearAllActiveCategoryDeks();
    setUnlockedPrivateSlugs(new Set());
    setPrivateUnlockVersion(0);
    setPendingVerificationUser(null);
    setIsSettingsOpen(false);
    if (isE2ESession) {
      setIsE2ESession(false);
      setUserProfile(null);
      setLinks([]);
      setCategories(INITIAL_CATEGORIES);
      return;
    }
    try {
      await firebaseSignOut(auth);
      showToast('Signed out!');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Profile & Preferences update handler (syncs profile fields + /users/{uid}/preferences/default)
  const handleSaveProfile = async (
    updated: Partial<UserProfile> & { securityAnswerPlain?: string },
    options?: { silent?: boolean }
  ) => {
    if (!userProfile) return;
    const uid = userProfile.uid;

    const { securityAnswerPlain, ...cleanUpdated } = updated;
    let nextAnswerHash = userProfile.securityAnswerHash;
    if (typeof securityAnswerPlain === 'string' && securityAnswerPlain.trim().length > 0) {
      nextAnswerHash = await createSecretVerifier(
        securityAnswerPlain.trim().toLowerCase(),
        'security-answer'
      );
    }

    if (cleanUpdated.soundEnabled !== undefined) {
      setSoundEnabled(cleanUpdated.soundEnabled !== false);
    }

    const nextDisplayName = (
      cleanUpdated.displayName ||
      userProfile.displayName ||
      'LINKHUB User'
    ).slice(0, 100);
    const nextEmail = (cleanUpdated.email || userProfile.email || 'user@linkhub.cloud').slice(0, 254);
    const nextPhoto = cleanUpdated.photoURL !== undefined ? cleanUpdated.photoURL : userProfile.photoURL ?? '';

    const nextProfileState: UserProfile = {
      ...userProfile,
      ...cleanUpdated,
      displayName: nextDisplayName,
      email: nextEmail,
      photoURL: nextPhoto,
      securityAnswerHash: nextAnswerHash,
    };
    saveProfileExtras(uid, nextProfileState);
    setUserProfile(nextProfileState);
    if (!options?.silent) {
      showToast('Settings saved!');
    }

    if (!isE2ESession) {
      try {
        await ensureUserDocumentExists(uid);

        if (
          cleanUpdated.displayName !== undefined ||
          cleanUpdated.email !== undefined ||
          cleanUpdated.photoURL !== undefined
        ) {
          const safePhoto =
            typeof nextPhoto === 'string' && nextPhoto.length <= 65536
              ? nextPhoto
              : userProfile.photoURL || '';
          const firestorePatch: Record<string, unknown> = {
            displayName: nextDisplayName,
            email: nextEmail,
            photoURL: safePhoto,
            updatedAt: serverTimestamp(),
          };
          try {
            await updateDoc(doc(db, 'users', uid), firestorePatch);
          } catch {
            await setDoc(
              doc(db, 'users', uid),
              sanitizeUserProfileCreate({
                uid,
                email: nextEmail,
                displayName: nextDisplayName,
                photoURL: safePhoto,
                pin: userProfile.pin,
                pinVerifier: userProfile.pinVerifier,
                vaultVersion: userProfile.vaultVersion ?? 2,
              })
            );
          }

          if (auth.currentUser) {
            const authPatch: { displayName?: string; photoURL?: string } = {};
            if (cleanUpdated.displayName !== undefined) {
              authPatch.displayName = nextDisplayName;
            }
            if (
              cleanUpdated.photoURL !== undefined &&
              (safePhoto === '' || /^https?:\/\//i.test(safePhoto))
            ) {
              authPatch.photoURL = safePhoto;
            }
            if (Object.keys(authPatch).length > 0) {
              updateProfile(auth.currentUser, authPatch).catch(() => {});
            }
          }
        }

        const hasPreferenceChange =
          cleanUpdated.firstName !== undefined ||
          cleanUpdated.lastName !== undefined ||
          cleanUpdated.countryCode !== undefined ||
          cleanUpdated.autoLockMinutes !== undefined ||
          cleanUpdated.soundEnabled !== undefined ||
          cleanUpdated.confettiEnabled !== undefined ||
          cleanUpdated.sortOption !== undefined ||
          cleanUpdated.securityQuestion !== undefined ||
          Boolean(securityAnswerPlain);

        if (hasPreferenceChange) {
          const prefRef = doc(db, `users/${uid}/preferences`, 'default');
          const prefPatch = sanitizePreferencesUpdate({
            ...cleanUpdated,
            ...(nextAnswerHash ? { securityAnswerHash: nextAnswerHash } : {}),
          });
          try {
            await updateDoc(prefRef, prefPatch);
          } catch {
            await setDoc(prefRef, sanitizePreferencesCreate(uid, nextProfileState));
          }
        }
      } catch (err) {
        logFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      }
    }
  };

  const handleSortChange = (nextSort: SortOption) => {
    setSortOption(nextSort);
    if (userProfile) {
      void handleSaveProfile({ sortOption: nextSort }, { silent: true });
    }
  };

  const handleChangeProfilePhoto = async (nextPhotoUrl: string) => {
    await handleSaveProfile({ photoURL: nextPhotoUrl });
  };

  // Import operations synced to Firestore
  const handleImportComplete = async (
    importedLinks: LinkItem[],
    importedCategories?: Category[]
  ) => {
    if (!userProfile) return;
    const uid = userProfile.uid;

    const existingUrls = new Set(links.map((l) => l.url));
    const newItems = importedLinks.filter((l) => !existingUrls.has(l.url)).slice(0, 100);

    const existingSlugs = new Set(categories.map((c) => c.slug));
    const newCats = (importedCategories || [])
      .filter((c) => !existingSlugs.has(c.slug))
      .slice(0, 20)
      .map((c, idx) => ({
        ...c,
        id: c.id || `cat-imp-${Date.now()}-${idx}`,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
      }));

    newCats.forEach((c) => pendingCategoryIdsRef.current.add(c.id));
    setCategories((prev) => {
      const next = [...prev, ...newCats];
      saveCachedCategories(uid, next);
      return next;
    });
    setLinks((prev) => {
      const next = [...newItems, ...prev];
      saveCachedLinks(uid, next);
      return next;
    });

    if (!isE2ESession) {
      await ensureUserDocumentExists(uid);
      const batch = writeBatch(db);
      newCats.forEach((cat, idx) => {
        const payload = sanitizeCategoryCreate(cat, uid, categories.length + idx);
        batch.set(doc(db, `users/${uid}/categories`, payload.id), payload);
      });
      newItems.forEach((item) => {
        const payload = sanitizeLinkCreate(item, uid);
        batch.set(doc(db, `users/${uid}/links`, payload.id), payload);
      });
      try {
        await batch.commit();
      } catch (error) {
        logFirestoreError(error, OperationType.WRITE, `users/${uid}/import`);
      }
    }

    try {
      confetti({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.7 },
        colors: ['#ff9000', '#ffa31a', '#ffffff'],
      });
    } catch {}

    showToast(`Imported ${newItems.length} link${newItems.length === 1 ? '' : 's'}!`);
  };

  // 1. Auth Initialization Screen
  if (!authReady) {
    return (
      <div className="min-h-[100dvh] bg-[#0b0b0b] text-white flex flex-col items-center justify-center p-6 gap-4">
        <LinkHubLogo size="lg" />
        <div
          className="flex items-center gap-2.5 text-xs text-zinc-300 font-title font-bold tracking-wider"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          <div className="w-4 h-4 rounded-full border-2 border-[#ff9000] border-t-transparent animate-spin" />
          <span>LOADING VAULT...</span>
        </div>
      </div>
    );
  }

  // 2. Mandatory Verified Email Link Gate before Vault Hydration
  if ((pendingVerificationUser || e2ePendingVerifyEmail) && !userProfile && !isE2ESession) {
    const verificationEmail = pendingVerificationUser?.email || e2ePendingVerifyEmail || '';

    return (
      <>
        <EmailVerificationScreen
          email={verificationEmail}
          onRefreshVerification={async (silent = false) => {
            if (e2ePendingVerifyEmail && !pendingVerificationUser) {
              if (!e2eEmailVerifiedRef.current) {
                if (!silent) {
                  showToast('Email not verified yet — check your inbox.', 'warning');
                }
                return false;
              }
              setE2ePendingVerifyEmail(null);
              setIsE2ESession(true);
              setUserProfile({
                uid: 'e2e_verified_link_user',
                email: verificationEmail,
                emailVerified: true,
                displayName: verificationEmail.split('@')[0] || 'LinkHub User',
                photoURL: '',
                pin: '',
                pinVerifier: '',
                vaultVersion: 2,
              });
              setCategories(INITIAL_CATEGORIES);
              setLinks(INITIAL_LINKS);
              showToast('Email verified! Welcome to LINKHUB.', 'success');
              return true;
            }

            if (!pendingVerificationUser) return false;
            try {
              await reload(pendingVerificationUser);
              if (auth.currentUser?.emailVerified) {
                await auth.currentUser.getIdToken(true);
                await hydrateVerifiedFirebaseUser(auth.currentUser);
                showToast('Email verified! Welcome to LINKHUB.', 'success');
                return true;
              }
              if (!silent) {
                showToast('Email not verified yet — check your inbox.', 'warning');
              }
              return false;
            } catch {
              if (!silent) {
                showToast('Could not refresh verification status.', 'error');
              }
              return false;
            }
          }}
          onResendEmail={async () => {
            if (e2ePendingVerifyEmail && !pendingVerificationUser) {
              e2eEmailVerifiedRef.current = true;
              return;
            }
            if (!pendingVerificationUser) return;
            await sendEmailVerification(pendingVerificationUser);
          }}
          onSignOut={async () => {
            if (e2ePendingVerifyEmail && !pendingVerificationUser) {
              e2eEmailVerifiedRef.current = false;
              setE2ePendingVerifyEmail(null);
              return;
            }
            if (pendingVerificationUser && !pendingVerificationUser.emailVerified) {
              try {
                await deleteUser(pendingVerificationUser);
              } catch {
                // Fall back to standard signOut if recent login expired
              }
            }
            await handleSignOut();
          }}
          onShowToast={showToast}
        />

        <Toast
          toast={toast}
          onDismiss={dismissToast}
          onPause={pauseToast}
          onResume={resumeToast}
        />
      </>
    );
  }

  // 3. Mandatory Login Landing Page when Unauthenticated (with Pre-Login Shared QR Preview Support)
  if (!userProfile) {
    return (
      <>
        <LoginPage
          onOpenScanQr={() => setIsScanQrOpen(true)}
          pendingSharedSummary={pendingSharedSummary}
          onShowToast={showToast}
        />

        {isScanQrOpen && (
          <ScanQrModal
            isOpen={isScanQrOpen}
            onClose={() => {
              setIsScanQrOpen(false);
              setPendingShareToken(null);
            }}
            categories={categories}
            links={links}
            activeCategorySlug={activeCategory}
            initialBundle={pendingSharedBundle}
            initialShareToken={pendingShareToken}
            isAuthenticated={false}
            onSaveSharedCategoryLinks={handleSaveSharedCategoryLinks}
          />
        )}

        <Toast
          toast={toast}
          onDismiss={dismissToast}
          onPause={pauseToast}
          onResume={resumeToast}
        />
      </>
    );
  }

  // 4. Session PIN Lock Screen when Locked
  if (isLocked) {
    const providerIds = auth.currentUser?.providerData.map((p) => p.providerId) || [];
    return (
      <>
        <LockedScreen
          onUnlock={() => setIsLocked(false)}
          hasPin={Boolean(userProfile.pinVerifier || userProfile.pin)}
          onVerifyPin={handleVerifyVaultPin}
          userName={userProfile.displayName}
          securityQuestion={userProfile.securityQuestion}
          hasSecurityAnswer={Boolean(userProfile.securityAnswerHash)}
          onVerifySecurityAnswer={handleVerifySecurityAnswer}
          onReauthenticateRecovery={isE2ESession ? undefined : handleReauthenticateRecovery}
          canReauthenticatePassword={providerIds.includes('password')}
          canReauthenticateGoogle={providerIds.includes('google.com')}
          onResetPin={async (newPin) => {
            await handleSavePin(newPin);
            setIsLocked(false);
          }}
          onShowToast={showToast}
        />

        <Toast
          toast={toast}
          onDismiss={dismissToast}
          onPause={pauseToast}
          onResume={resumeToast}
        />
      </>
    );
  }

  // 4. Authenticated Production Cloud Vault Dashboard & Profile Settings
  return (
    <div className="min-h-[100dvh] bg-[#0b0b0e] text-white flex flex-col font-sans transition-colors relative overflow-x-clip">
      {/* Lightweight GPU-Composited Ambient Glow Across the Entire Site (Zero Blur Filter Repaint Lag) */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(640px circle at 20% 8%, rgba(255, 144, 0, 0.13), transparent 70%), radial-gradient(680px circle at 80% 92%, rgba(250, 99, 24, 0.1), transparent 70%)',
        }}
      />

      {/* Sticky Top Navbar with LINKHUB signature logo */}
      <Navbar
        onAddLink={() => {
          setEditingLink(null);
          setIsAddModalOpen(true);
        }}
        onLockVault={handleLockVault}
        onSetPin={() => setIsPinModalOpen(true)}
        onImport={() => setIsImportOpen(true)}
        onExport={() => setIsExportOpen(true)}
        onScanQr={() => setIsScanQrOpen(true)}
        onShareCategoryQr={() => {
          setShareCategorySlug(
            activeCategory !== 'all' ? activeCategory : categories[0]?.slug || ''
          );
          setIsShareCategoryQrOpen(true);
        }}
        onOpenCommandSearch={() => setIsCommandSearchOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        hasPin={Boolean(userProfile.pinVerifier || userProfile.pin)}
        user={userProfile}
        onOpenSettings={() => setIsSettingsOpen((prev) => !prev)}
        onChangePhoto={handleChangeProfilePhoto}
        onSignOut={handleSignOut}
        onShowToast={showToast}
        searchInputRef={searchInputRef}
        links={searchableLinks}
        categories={categories}
        onOpenLink={handleOpenLink}
        onSelectCategory={(slug) => {
          setIsSettingsOpen(false);
          handleSelectCategoryWithGate(slug);
        }}
        onSelectTag={(tag) => {
          setIsSettingsOpen(false);
          handleTagClick(tag);
        }}
      />

      {/* Mobile spacer matching the fixed mobile navbar height */}
      <div className="h-[98px] md:hidden shrink-0" aria-hidden="true" />

      {/* Main Content Area: Either Profile Settings Page or Vault Dashboard */}
      {isSettingsOpen ? (
        <div className="flex-1 relative z-10 pb-20 md:pb-0">
          <ProfileSettingsPage
            user={userProfile}
            onClose={() => setIsSettingsOpen(false)}
            onSaveProfile={handleSaveProfile}
            onSavePin={handleSavePin}
            onLockVault={handleLockVault}
            onImportClick={() => setIsImportOpen(true)}
            onExportClick={() => setIsExportOpen(true)}
            onScanQrClick={() => setIsScanQrOpen(true)}
            onSignOut={handleSignOut}
            onShowToast={showToast}
            linksCount={publicLinks.length}
            categoriesCount={categories.length}
            favoritesCount={starredCount}
          />
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-3.5 sm:px-6 pt-3.5 pb-24 md:py-6 w-full flex-1 flex flex-col gap-4 sm:gap-5 relative z-10">
          {/* Category Pills Header & Bar */}
          <CategoryPills
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={handleSelectCategoryWithGate}
            onNewCategory={() => {
              setEditingCategory(null);
              setIsCategoryModalOpen(true);
            }}
            onEditCategory={(cat) => {
              if (cat.isPrivate && !unlockedPrivateSlugs.has(cat.slug)) {
                setPendingPrivateUnlock({ category: cat, action: 'edit' });
                return;
              }
              setEditingCategory(cat);
              setIsCategoryModalOpen(true);
            }}
            onDeleteCategory={(cat) => {
              if (cat.isPrivate && !unlockedPrivateSlugs.has(cat.slug)) {
                setPendingPrivateUnlock({ category: cat, action: 'delete' });
                return;
              }
              handleDeleteCategory(cat);
            }}
            onReorderCategories={handleReorderCategories}
            onShareCategoryQr={(cat) => {
              if (cat.isPrivate && !unlockedPrivateSlugs.has(cat.slug)) {
                setPendingPrivateUnlock({ category: cat, action: 'share' });
                return;
              }
              setShareCategorySlug(cat.slug);
              setIsShareCategoryQrOpen(true);
            }}
            categoryCounts={categoryCounts}
            totalLinksCount={publicLinks.length}
            starredCount={starredCount}
            unlockedPrivateSlugs={unlockedPrivateSlugs}
          />

          {/* Responsive Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-[11px] sm:text-xs">
            {/* Left: Counts and Active Filters */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="font-semibold text-zinc-300">
                <span className="hidden sm:inline">Showing </span>
                {filteredLinks.length} of{' '}
                {privateCategorySlugs.has(activeCategory)
                  ? categoryCounts[activeCategory] || 0
                  : publicLinks.length}{' '}
                bookmark
                {(privateCategorySlugs.has(activeCategory)
                  ? categoryCounts[activeCategory] || 0
                  : publicLinks.length) === 1
                  ? ''
                  : 's'}
              </span>

              {searchQuery && (
                <Chip
                  size="sm"
                  variant="flat"
                  onClose={() => setSearchQuery('')}
                  className="glass-input text-[#ff9000] font-semibold"
                >
                  Search: &quot;{searchQuery}&quot;
                </Chip>
              )}

              {activeTag && (
                <Chip
                  size="sm"
                  variant="flat"
                  onClose={() => setActiveTag(null)}
                  className="glass-input text-zinc-300"
                >
                  Tag: #{activeTag}
                </Chip>
              )}

              {starredOnly && (
                <Chip
                  size="sm"
                  variant="flat"
                  onClose={() => setStarredOnly(false)}
                  className="bg-[#ff9000]/20 text-[#ff9000] border border-[#ff9000]/40 font-semibold"
                >
                  Favorites Only
                </Chip>
              )}

              {(searchQuery || activeTag || starredOnly || activeCategory !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveTag(null);
                    setStarredOnly(false);
                    setActiveCategory('all');
                  }}
                  className="text-[11px] text-zinc-400 hover:text-white underline ml-1 cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>

            {/* Right: Compact Premium Icon Filter & Sort Controls */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
              {activeCategory !== 'all' &&
                activeCategory !== 'starred' &&
                privateCategorySlugs.has(activeCategory) &&
                unlockedPrivateSlugs.has(activeCategory) && (
                  <button
                    type="button"
                    onClick={() => handleLockPrivateCategory(activeCategory)}
                    title="Lock Private Category"
                    aria-label="Lock Private Category"
                    className="w-8 h-8 rounded-xl flex items-center justify-center border glass-input text-zinc-300 hover:text-[#ff9000] hover:bg-white/[0.08] transition-all cursor-pointer shrink-0"
                  >
                    <PiLockKeyOpenFill size={15} />
                  </button>
                )}

              {/* Favorites Filter Icon Button */}
              <button
                type="button"
                onClick={() => {
                  playRetroClick();
                  setStarredOnly(!starredOnly);
                }}
                title={starredOnly ? 'Showing Favorites Only' : 'Filter Favorites'}
                aria-label="Filter Favorites"
                className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
                  starredOnly
                    ? 'bg-[#ff9000] text-black border-[#ff9000] shadow-sm shadow-[#ff9000]/25'
                    : 'glass-input text-zinc-300 hover:text-[#ff9000] hover:bg-white/[0.08]'
                }`}
              >
                <Star
                  size={14}
                  strokeWidth={2.2}
                  className={starredOnly ? 'fill-black text-black' : 'text-[#ff9000]'}
                />
              </button>

              {/* Compact Icon-Driven Sort Selector with FaFilter Icon */}
              <GlassSelect
                size="sm"
                align="right"
                ariaLabel="Sort bookmarks"
                startIcon={
                  <svg
                    viewBox="0 0 512 512"
                    fill="currentColor"
                    width="11"
                    height="11"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path d="M487.976 0H24.028C2.71 0-8.047 25.866 7.058 40.971L192 225.941V432c0 7.831 3.821 15.17 10.237 19.662l80 55.98C298.02 518.69 320 507.493 320 487.98V225.941l184.947-184.97C520.021 25.896 509.338 0 487.976 0z" />
                  </svg>
                }
                value={sortOption}
                onChange={(val) => handleSortChange(val as SortOption)}
                options={[
                  {
                    value: 'visits',
                    label: 'Popular',
                    icon: <Flame size={13} strokeWidth={2.2} />,
                  },
                  {
                    value: 'recent',
                    label: 'Newest',
                    icon: (
                      <svg viewBox="0 0 512 512" fill="currentColor" width="11" height="11">
                        <path d="M487.976 0H24.028C2.71 0-8.047 25.866 7.058 40.971L192 225.941V432c0 7.831 3.821 15.17 10.237 19.662l80 55.98C298.02 518.69 320 507.493 320 487.98V225.941l184.947-184.97C520.021 25.896 509.338 0 487.976 0z" />
                      </svg>
                    ),
                  },
                  {
                    value: 'oldest',
                    label: 'Oldest',
                    icon: (
                      <svg viewBox="0 0 512 512" fill="currentColor" width="11" height="11">
                        <path d="M487.976 0H24.028C2.71 0-8.047 25.866 7.058 40.971L192 225.941V432c0 7.831 3.821 15.17 10.237 19.662l80 55.98C298.02 518.69 320 507.493 320 487.98V225.941l184.947-184.97C520.021 25.896 509.338 0 487.976 0z" />
                      </svg>
                    ),
                  },
                  {
                    value: 'alpha',
                    label: 'Title A–Z',
                    icon: <ArrowDownAZ size={13} strokeWidth={2.2} />,
                  },
                  {
                    value: 'alpha-desc',
                    label: 'Title Z–A',
                    icon: <ArrowUpAZ size={13} strokeWidth={2.2} />,
                  },
                ]}
              />

              {/* Quick Add Button (+ ADD) */}
              <button
                type="button"
                onClick={() => {
                  playRetroClick();
                  setEditingLink(null);
                  setIsAddModalOpen(true);
                }}
                title="Add New Link"
                aria-label="Add New Link"
                className="h-8 px-2.5 sm:px-3 rounded-xl bg-[#ff9000] hover:bg-[#ffa31a] text-black inline-flex items-center justify-center gap-1 sm:gap-1.5 font-bold text-[11px] sm:text-xs uppercase tracking-wider shadow-sm shadow-[#ff9000]/25 transition-all cursor-pointer shrink-0"
              >
                <BookmarkPlus size={15} strokeWidth={2.25} />
                <span>ADD</span>
              </button>
            </div>
          </div>

          {/* Links Display (Card Format Only) */}
          {filteredLinks.length === 0 ? (
            <div className="w-full glass-panel rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center">
              <div className="relative mb-5 flex items-center justify-center">
                <div
                  aria-hidden="true"
                  className="empty-badge-glow pointer-events-none absolute h-24 w-24 rounded-full bg-[#ff9000]/18 blur-2xl"
                />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl">
                  <div
                    aria-hidden="true"
                    className="empty-ring-pulse pointer-events-none absolute inset-0 rounded-3xl border border-[#ff9000]/30"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl p-[1px]"
                  >
                    <div
                      className="empty-orbit-sweep absolute -inset-[55%] opacity-80"
                      style={{
                        background:
                          'conic-gradient(from 0deg, transparent 0deg, transparent 250deg, rgba(255, 144, 0, 0.55) 315deg, rgba(255, 195, 110, 0.8) 340deg, transparent 360deg)',
                      }}
                    />
                    <div className="relative h-full w-full rounded-[23px] border border-white/[0.05] bg-[#14151b]/95" />
                  </div>
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ff9000]/25 bg-gradient-to-b from-[#1f212b] to-[#13141a] text-[#ff9000] shadow-[0_10px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <span className="empty-icon-float inline-flex items-center justify-center">
                      {searchQuery || activeTag || starredOnly ? (
                        <TbBookmarksOff size={26} strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <BsBookmarks size={24} aria-hidden="true" />
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mb-1.5">
                No Bookmarks Found
              </h3>
              <p className="text-xs sm:text-[13px] text-zinc-400 max-w-sm mb-6 leading-relaxed">
                {searchQuery || activeTag || starredOnly
                  ? 'No saved bookmarks match your current search criteria or tags.'
                  : 'Your cloud vault is currently empty for this category. Add a link or import your browser bookmarks.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="flat"
                  color="default"
                  size="sm"
                  onClick={() => setIsImportOpen(true)}
                  startContent={<Upload size={13} />}
                >
                  Import Bookmarks
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  size="sm"
                  onClick={() => {
                    setEditingLink(null);
                    setIsAddModalOpen(true);
                  }}
                  startContent={<BookmarkPlus size={15} strokeWidth={2.25} />}
                >
                  Add First Link
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
              {filteredLinks.map((link) => {
                const cat = categories.find((c) => c.slug === link.categorySlug);
                return (
                  <LinkCard
                    key={link.id}
                    link={link}
                    category={cat}
                    onOpen={handleOpenLink}
                    onToggleFavorite={handleToggleFavorite}
                    onEdit={(l) => {
                      setEditingLink(l);
                      setIsAddModalOpen(true);
                    }}
                    onDelete={handleDeleteLink}
                    onTagClick={handleTagClick}
                    onCopyUrl={handleCopyUrl}
                    onShowIncognito={(targetLink) => {
                      playRetroClick();
                      window.postMessage(
                        { type: 'LINKHUB_OPEN_INCOGNITO', url: targetLink.url },
                        window.location.origin
                      );
                      setIncognitoLink(targetLink);
                    }}
                  />
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* =====================================================================
          ANDROID NATIVE BOTTOM NAVIGATION BAR (Mobile < md Only)
         ===================================================================== */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-[#0b0b0f]/95 backdrop-blur-2xl border-t border-white/[0.08] px-2 flex items-center justify-around select-none shadow-[0_-10px_30px_rgba(0,0,0,0.75)]"
      >
        {/* 1. Vault Home */}
        <button
          type="button"
          onClick={() => {
            playRetroClick();
            setIsSettingsOpen(false);
            setStarredOnly(false);
            setActiveCategory('all');
          }}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
            !isSettingsOpen && !starredOnly && activeCategory === 'all'
              ? 'text-[#ff9000]'
              : 'text-zinc-400 active:text-white'
          }`}
        >
          <FolderOpen size={18} strokeWidth={2.1} />
          <span className="text-[10px] font-semibold tracking-tight">Vault</span>
        </button>

        {/* 2. Favorites */}
        <button
          type="button"
          onClick={() => {
            playRetroClick();
            setIsSettingsOpen(false);
            setActiveCategory('starred');
          }}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
            !isSettingsOpen && (activeCategory === 'starred' || starredOnly)
              ? 'text-[#ff9000]'
              : 'text-zinc-400 active:text-white'
          }`}
        >
          <Star
            size={18}
            strokeWidth={2.1}
            className={
              !isSettingsOpen && (activeCategory === 'starred' || starredOnly)
                ? 'fill-[#ff9000]'
                : ''
            }
          />
          <span className="text-[10px] font-semibold tracking-tight">Favorites</span>
        </button>

        {/* 3. Center Elevated Add Link Action Button */}
        <button
          type="button"
          onClick={() => {
            playRetroClick();
            setEditingLink(null);
            setIsAddModalOpen(true);
          }}
          aria-label="Add New Link"
          className="w-11 h-11 rounded-2xl bg-[#ff9000] active:scale-95 text-black flex items-center justify-center shadow-[0_6px_20px_rgba(255,144,0,0.35)] transition-transform cursor-pointer"
        >
          <BookmarkPlus size={20} strokeWidth={2.25} />
        </button>

        {/* 4. Scan / Share Code */}
        <button
          type="button"
          onClick={() => {
            playRetroClick();
            setIsScanQrOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl text-zinc-400 active:text-white transition-colors cursor-pointer"
        >
          <QrCode size={18} strokeWidth={2.1} />
          <span className="text-[10px] font-semibold tracking-tight">Scan QR</span>
        </button>

        {/* 5. Settings */}
        <button
          type="button"
          onClick={() => {
            playRetroClick();
            setIsSettingsOpen(!isSettingsOpen);
          }}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
            isSettingsOpen ? 'text-[#ff9000]' : 'text-zinc-400 active:text-white'
          }`}
        >
          <CircleUserRound size={18} strokeWidth={2.1} />
          <span className="text-[10px] font-semibold tracking-tight">Settings</span>
        </button>
      </nav>

      {/* Clean Minimal LINKHUB Dark-Glass Footer (Desktop md+) */}
      <footer className="hidden md:block mt-14 relative z-10 border-t border-white/[0.08] bg-[#09090c]/85 backdrop-blur-2xl text-zinc-400">
        {/* Top subtle orange accent glow hairline */}
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#ff9000]/45 to-transparent" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-6 pb-6 border-b border-white/[0.07]">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5 text-center sm:text-left">
              <LinkHubLogo size="md" />
              <span className="hidden sm:inline text-white/15">|</span>
              <p className="font-title text-xs text-zinc-400 max-w-md">
                Encrypted personal cloud bookmark vault built for organizing, searching, and
                launching your mission-critical web resources from anywhere.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {[
                { icon: Github, label: 'GitHub', href: 'https://github.com/debu-21' },
                { icon: XBrandIcon, label: 'X', href: 'https://x.com' },
                { icon: Instagram, label: 'Instagram', href: 'https://instagram.com' },
              ].map((social) => {
                const IconComponent = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-[#ff9000] text-zinc-300 hover:text-black border border-white/[0.08] hover:border-[#ff9000] flex items-center justify-center transition-all"
                  >
                    <IconComponent size={14} />
                  </a>
                );
              })}
            </div>
          </div>

          <div className="pt-5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 text-xs text-zinc-400">
            <div>© 2026 LINKHUB. All rights reserved.</div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span>Designed &amp; engineered by</span>
              <a
                href="https://github.com/debu-21"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-zinc-300 hover:text-[#ff9000] transition-colors underline decoration-white/15 underline-offset-4 hover:decoration-[#ff9000]/60"
              >
                debu-21
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Industry-Standard Glass Toast Notification */}
      <Toast
        toast={toast}
        onDismiss={dismissToast}
        onPause={pauseToast}
        onResume={resumeToast}
      />

      {/* Conditionally Mounted Modals for Zero Idle Render Overhead */}
      {isAddModalOpen && (
        <AddLinkModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingLink(null);
          }}
          onSave={handleSaveLink}
          initialLink={editingLink}
          categories={categories}
          activeCategorySlug={activeCategory}
        />
      )}

      {isPinModalOpen && (
        <PinModal
          isOpen={isPinModalOpen}
          onClose={() => setIsPinModalOpen(false)}
          onSavePin={handleSavePin}
          hasPin={Boolean(userProfile.pinVerifier || userProfile.pin)}
        />
      )}

      {isImportOpen && (
        <ImportModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {isExportOpen && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          links={searchableLinks}
          categories={categories}
          lockedPrivateCount={Math.max(0, links.length - searchableLinks.length)}
          onShowToast={showToast}
        />
      )}

      {isCategoryModalOpen && (
        <CategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => {
            setIsCategoryModalOpen(false);
            setEditingCategory(null);
          }}
          onSave={handleSaveCategory}
          onDelete={handleDeleteCategory}
          category={editingCategory}
          existingCategories={categories}
        />
      )}

      {isAboutOpen && <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />}

      {incognitoLink && (
        <IncognitoModal
          isOpen={Boolean(incognitoLink)}
          onClose={() => setIncognitoLink(null)}
          link={incognitoLink}
          onShowToast={showToast}
        />
      )}

      {isShareCategoryQrOpen && (
        <ShareQrModal
          isOpen={isShareCategoryQrOpen}
          onClose={() => setIsShareCategoryQrOpen(false)}
          categories={categories.filter((c) => !c.isPrivate || unlockedPrivateSlugs.has(c.slug))}
          links={searchableLinks}
          initialCategorySlug={shareCategorySlug}
          onShowToast={showToast}
        />
      )}

      {isScanQrOpen && (
        <ScanQrModal
          isOpen={isScanQrOpen}
          onClose={() => {
            setIsScanQrOpen(false);
            setPendingSharedBundle(null);
            setPendingShareToken(null);
          }}
          categories={categories}
          links={searchableLinks}
          activeCategorySlug={activeCategory}
          initialBundle={pendingSharedBundle}
          initialShareToken={pendingShareToken}
          isAuthenticated={true}
          onSaveSharedCategoryLinks={handleSaveSharedCategoryLinks}
        />
      )}

      {isCommandSearchOpen && (
        <CommandSearchModal
          isOpen={isCommandSearchOpen}
          onClose={() => setIsCommandSearchOpen(false)}
          links={searchableLinks}
          categories={categories}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenLink={handleOpenLink}
          onCopyUrl={handleCopyUrl}
          onSelectCategory={(slug) => {
            setIsSettingsOpen(false);
            handleSelectCategoryWithGate(slug);
          }}
        />
      )}

      {pendingPrivateUnlock && (
        <PrivateCategoryPinModal
          isOpen={Boolean(pendingPrivateUnlock)}
          userId={userProfile.uid}
          category={pendingPrivateUnlock.category}
          onClose={() => setPendingPrivateUnlock(null)}
          onUnlockSuccess={async (unlockedCat, enteredPin) => {
            const action = pendingPrivateUnlock.action;
            const uid = userProfile.uid;
            let resolvedCat = unlockedCat;

            try {
              const catLinks = links.filter(
                (l) =>
                  l.categorySlug === unlockedCat.slug ||
                  (l.categorySlug || '').toLowerCase().trim() ===
                    (unlockedCat.slug || '').toLowerCase().trim()
              );

              if (needsVaultMigration(unlockedCat, catLinks)) {
                const migrated = await migrateLegacyCategoryToV2({
                  userId: uid,
                  legacyCategory: unlockedCat,
                  categoryLinks: catLinks,
                  enteredPin,
                });
                setActiveCategoryDek(uid, unlockedCat.slug, migrated.dek);
                resolvedCat = {
                  ...migrated.upgradedCategory,
                  name: migrated.decryptedName,
                  description: migrated.decryptedDescription,
                };
                const upgradedById = new Map(migrated.upgradedLinks.map((l) => [l.id, l]));
                setCategories((prev) => {
                  const next = prev.map((c) => (c.id === unlockedCat.id ? resolvedCat : c));
                  saveCachedCategories(uid, next);
                  return next;
                });
                setLinks((prev) => {
                  const next = prev.map((l) => upgradedById.get(l.id) || l);
                  saveCachedLinks(uid, next);
                  return next;
                });

                if (!isE2ESession) {
                  await ensureUserDocumentExists(uid);
                  const batch = writeBatch(db);
                  const catPayload = sanitizeCategoryCreate(
                    migrated.upgradedCategory,
                    uid,
                    resolvedCat.order
                  );
                  batch.update(doc(db, `users/${uid}/categories`, unlockedCat.id), {
                    name: catPayload.name,
                    slug: catPayload.slug,
                    color: catPayload.color,
                    icon: catPayload.icon,
                    description: catPayload.description,
                    isPrivate: catPayload.isPrivate,
                    privateVaultMeta: catPayload.privateVaultMeta,
                    order: catPayload.order,
                    updatedAt: serverTimestamp(),
                  });
                  for (const upLink of migrated.upgradedLinks) {
                    const linkPayload = sanitizeLinkCreate(upLink, uid);
                    batch.update(doc(db, `users/${uid}/links`, upLink.id), {
                      title: linkPayload.title,
                      url: linkPayload.url,
                      categorySlug: linkPayload.categorySlug,
                      description: linkPayload.description,
                      tags: linkPayload.tags,
                      isFavorite: linkPayload.isFavorite,
                      imageUrl: linkPayload.imageUrl,
                      faviconUrl: linkPayload.faviconUrl,
                      isEncrypted: linkPayload.isEncrypted,
                      cryptoVersion: linkPayload.cryptoVersion,
                      updatedAt: serverTimestamp(),
                    });
                  }
                  await batch.commit();
                }
                clearMigrationCheckpoint(uid, unlockedCat.slug);
                showToast('Private category upgraded to AES-256-GCM encryption!', 'success');
              } else {
                const unlockedMeta = await unlockAndStoreCategoryDek(uid, unlockedCat, enteredPin);
                resolvedCat = {
                  ...unlockedCat,
                  name: unlockedMeta.name || unlockedCat.name,
                  description: unlockedMeta.description || unlockedCat.description,
                };
                setCategories((prev) =>
                  prev.map((c) => (c.id === unlockedCat.id ? resolvedCat : c))
                );
                showToast('Category unlocked!');
              }
            } catch (err) {
              playRetroBeep();
              showToast(
                err instanceof Error ? err.message : 'Failed to unlock private vault.',
                'error'
              );
              return;
            }

            setPendingPrivateUnlock(null);
            setUnlockedPrivateSlugs((prev) => new Set(prev).add(resolvedCat.slug));
            setPrivateUnlockVersion((v) => v + 1);
            if (action === 'select') {
              setActiveCategory(resolvedCat.slug);
            } else if (action === 'edit') {
              setEditingCategory(resolvedCat);
              setIsCategoryModalOpen(true);
            } else if (action === 'delete') {
              handleDeleteCategory(resolvedCat);
            } else if (action === 'share') {
              setShareCategorySlug(resolvedCat.slug);
              setIsShareCategoryQrOpen(true);
            }
          }}
        />
      )}
    </div>
  );
}

