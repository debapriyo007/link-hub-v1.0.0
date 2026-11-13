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
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { BsBookmarks } from 'react-icons/bs';
import { TbBookmarksOff } from 'react-icons/tb';
import { LinkItem, Category, SortOption, UserProfile } from './types.ts';
import { INITIAL_LINKS, INITIAL_CATEGORIES } from './data/initialData.ts';
import { filterAndSortLinks } from './utils/vaultLogic.ts';
import {
  encodeCategoryForStorage,
  decodeCategoryFromStorage,
  encryptLinkForStorage,
  decryptLinkInMemory,
  isLinkEncrypted,
} from './utils/privateVaultCrypto.ts';
import {
  SharedCategoryBundle,
  decodeCategoryShareInput,
  savePendingSharedImport,
  consumePendingSharedImport,
  peekPendingSharedImport,
} from './utils/categoryShare.ts';
import {
  playRetroClick,
  playRetroBeep,
  playRetroLock,
} from './utils/sound.ts';
import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  firebaseSignOut,
  onAuthStateChanged,
  sanitizeId,
  sanitizePin,
  sanitizeUserProfileCreate,
  sanitizeCategoryCreate,
  sanitizeLinkCreate,
  toMillis,
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
    __LINKHUB_E2E_LOGOUT__?: () => void;
  }
}

export default function App() {
  // Authentication & Firestore State
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isE2ESession, setIsE2ESession] = useState<boolean>(false);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [vaultSyncing, setVaultSyncing] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const seededDefaultCatsUidRef = useRef<string | null>(null);

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

    try {
      const params = new URLSearchParams(window.location.search);
      const shareParam = params.get('share');
      if (shareParam) {
        const decoded = decodeCategoryShareInput(
          shareParam,
          INITIAL_CATEGORIES,
          INITIAL_LINKS
        );
        if (decoded && decoded.links.length > 0) {
          setPendingSharedBundle(decoded);
          setIsScanQrOpen(true);
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

  // Automatically lock vault and any unlocked private categories when user switches browser tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && userProfile) {
        setIsLocked(true);
        setUnlockedPrivateSlugs(new Set());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userProfile]);

  // Expose E2E test session helper for automated headless verification
  useEffect(() => {
    window.__LINKHUB_E2E_LOGIN__ = (customProfile?: Partial<UserProfile>) => {
      setIsE2ESession(true);
      setUserProfile({
        uid: customProfile?.uid || 'e2e_verified_user',
        email: customProfile?.email || 'debapriyo00@gmail.com',
        displayName: customProfile?.displayName || 'Debu Vault Admin',
        photoURL: customProfile?.photoURL || '',
        pin: customProfile?.pin || '',
      });
      setCategories(INITIAL_CATEGORIES);
      setLinks(INITIAL_LINKS);
      setAuthReady(true);
    };
    window.__LINKHUB_E2E_LOGOUT__ = () => {
      setIsE2ESession(false);
      setUserProfile(null);
      setCategories(INITIAL_CATEGORIES);
      setLinks([]);
    };
    return () => {
      delete window.__LINKHUB_E2E_LOGIN__;
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
      const encoded = items.map((c) => encodeCategoryForStorage(c, uid));
      localStorage.setItem(`linkhub_categories_${uid}`, JSON.stringify(encoded));
    } catch {}
  }, []);

  const loadProfileExtras = useCallback((uid: string): Partial<UserProfile> => {
    try {
      const raw = localStorage.getItem(`linkhub_profile_extras_${uid}`);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }, []);

  const saveProfileExtras = useCallback((uid: string, extras: Partial<UserProfile>) => {
    try {
      localStorage.setItem(`linkhub_profile_extras_${uid}`, JSON.stringify(extras));
    } catch {}
  }, []);

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
      console.warn('Could not seed starter vault in Firestore:', error);
    }
  }, []);

  // Listen to Firebase Auth state changes and hydrate immediately from cache before background Firestore sync
  useEffect(() => {
    const safetyTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 900);

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      window.clearTimeout(safetyTimer);

      if (!fbUser) {
        if (!isE2ESession) {
          setUserProfile(null);
          setLinks([]);
          setCategories(INITIAL_CATEGORIES);
          setIsLocked(false);
        }
        setAuthReady(true);
        return;
      }

      setIsE2ESession(false);
      const uid = sanitizeId(fbUser.uid, 128);
      const userDocRef = doc(db, 'users', uid);

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
      const cachedPin = typeof extras.pin === 'string' ? extras.pin : '';
      setUserProfile({
        uid,
        email: extras.email || fbUser.email || 'user@linkhub.cloud',
        displayName:
          extras.displayName || fbUser.displayName || fbUser.email?.split('@')[0] || 'LINKHUB User',
        photoURL: extras.photoURL !== undefined ? extras.photoURL : fbUser.photoURL || '',
        pin: cachedPin,
        ...extras,
      });
      if (cachedPin.length === 6) {
        setIsLocked(true);
      }
      setAuthReady(true);

      // 2. Background Firestore profile sync (non-blocking)
      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          const initialProfilePayload = sanitizeUserProfileCreate({
            uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
            pin: '',
          });
          if (!cachedLinks) {
            saveCachedLinks(uid, INITIAL_LINKS);
          }
          await setDoc(userDocRef, initialProfilePayload);
          await seedStarterVaultInFirestore(uid);
          seededDefaultCatsUidRef.current = uid;
        } else {
          const data = snap.data();
          const storedPin = typeof data.pin === 'string' ? data.pin : '';
          const latestExtras = loadProfileExtras(uid);
          if (storedPin !== latestExtras.pin) {
            saveProfileExtras(uid, { ...latestExtras, pin: storedPin });
          }
          setUserProfile({
            uid,
            email: latestExtras.email || data.email || fbUser.email || 'user@linkhub.cloud',
            displayName:
              latestExtras.displayName || data.displayName || fbUser.displayName || 'LINKHUB User',
            photoURL:
              latestExtras.photoURL !== undefined
                ? latestExtras.photoURL
                : data.photoURL || fbUser.photoURL || '',
            pin: storedPin,
            ...latestExtras,
          });
          if (storedPin.length === 6 && !cachedPin) {
            setIsLocked(true);
          }
        }
      } catch (error) {
        console.warn('Profile background sync warning:', error);
      } finally {
        setVaultSyncing(false);
      }
    });

    return () => {
      window.clearTimeout(safetyTimer);
      unsubscribeAuth();
    };
  }, [
    isE2ESession,
    loadCachedLinks,
    saveCachedLinks,
    loadCachedCategories,
    loadProfileExtras,
    saveProfileExtras,
    seedStarterVaultInFirestore,
  ]);

  // Real-Time Firestore Listeners for User Profile, Categories, and Links
  useEffect(() => {
    if (!authReady || !userProfile || isE2ESession || !auth.currentUser) {
      return;
    }

    const uid = userProfile.uid;
    const categoriesPath = `users/${uid}/categories`;
    const linksPath = `users/${uid}/links`;

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          const extras = loadProfileExtras(uid);
          setUserProfile((prev) => ({
            uid,
            email: extras.email || d.email || prev?.email || '',
            displayName: extras.displayName || d.displayName || prev?.displayName || 'LINKHUB User',
            photoURL:
              extras.photoURL !== undefined ? extras.photoURL : d.photoURL ?? prev?.photoURL ?? '',
            pin: typeof d.pin === 'string' ? d.pin : prev?.pin || '',
            ...extras,
          }));
        }
      },
      (error) => {
        console.warn('Profile listener warning:', error);
      }
    );

    const unsubCategories = onSnapshot(
      collection(db, categoriesPath),
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
            order: typeof data.order === 'number' ? data.order : 0,
            createdAt: toMillis(data.createdAt),
          };
          return decodeCategoryFromStorage(rawCat, uid);
        });

        // Merge with INITIAL_CATEGORIES so given categories are always available
        const fetchedBySlug = new Map(fetchedCategories.map((c) => [c.slug, c]));
        const missingDefaults = INITIAL_CATEGORIES.filter((def) => !fetchedBySlug.has(def.slug));

        const mergedCategories: Category[] = [
          ...fetchedCategories,
          ...missingDefaults.map((def, i) => ({
            ...def,
            userId: uid,
            order: typeof def.order === 'number' ? def.order : fetchedCategories.length + i,
          })),
        ];
        mergedCategories.sort((a, b) => a.order - b.order);
        setCategories(mergedCategories);
        saveCachedCategories(uid, mergedCategories);

        // Seed any missing given categories to Firestore once per session
        if (missingDefaults.length > 0 && seededDefaultCatsUidRef.current !== uid) {
          seededDefaultCatsUidRef.current = uid;
          const batch = writeBatch(db);
          missingDefaults.forEach((def, idx) => {
            const catPayload = sanitizeCategoryCreate(def, uid, def.order ?? idx);
            const catRef = doc(db, categoriesPath, catPayload.id);
            batch.set(catRef, catPayload);
          });
          batch.commit().catch((err) => {
            console.warn('Could not seed missing default categories:', err);
          });
        }
      },
      (error) => {
        console.warn('Categories listener warning:', error);
      }
    );

    const unsubLinks = onSnapshot(
      collection(db, linksPath),
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
            isEncrypted: isLinkEncrypted({ title: rawTitle, url: rawUrl, description: rawDesc }),
            createdAt: toMillis(data.createdAt),
            updatedAt: toMillis(data.updatedAt),
          };
        });

        setLinks((prev) => {
          // Merge server snapshot with any optimistic local items not yet reflected
          const serverIds = new Set(fetchedLinks.map((l) => l.id));
          const now = Date.now();
          const pendingLocal = prev.filter(
            (l) => !serverIds.has(l.id) && now - (l.createdAt || 0) < 15000
          );
          const merged = [...pendingLocal, ...fetchedLinks];
          if (merged.length > 0) {
            saveCachedLinks(uid, merged);
            return merged;
          }
          const cached = loadCachedLinks(uid);
          if (cached && cached.length > 0) {
            return cached;
          }
          return fetchedLinks;
        });
      },
      (error) => {
        console.warn('Links listener warning:', error);
      }
    );

    return () => {
      unsubProfile();
      unsubCategories();
      unsubLinks();
    };
  }, [
    authReady,
    userProfile?.uid,
    isE2ESession,
    loadCachedLinks,
    saveCachedLinks,
    saveCachedCategories,
    loadProfileExtras,
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

  // Decrypt links in memory only for private categories that are currently unlocked
  const decryptedLinks = useMemo(() => {
    const catBySlug = new Map<string, Category>();
    categories.forEach((c) => {
      catBySlug.set(c.slug, c);
      catBySlug.set((c.slug || '').toLowerCase().trim(), c);
    });
    return links.map((link) => {
      const normSlug = (link.categorySlug || '').toLowerCase().trim();
      const cat = catBySlug.get(link.categorySlug) || catBySlug.get(normSlug);
      if (cat?.isPrivate || isLinkEncrypted(link) || link.isEncrypted) {
        const isUnlocked = Boolean(
          cat && (unlockedPrivateSlugs.has(cat.slug) || unlockedPrivateSlugs.has(normSlug))
        );
        return decryptLinkInMemory(link, cat, isUnlocked);
      }
      return link;
    });
  }, [links, categories, unlockedPrivateSlugs]);

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
      setUnlockedPrivateSlugs((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
      if (activeCategory === slug) {
        setActiveCategory('all');
      }
      showToast('Category locked!');
    },
    [activeCategory, categories, showToast]
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
      const plainTitle = (linkData.title || editingLink.title || 'Bookmark').trim();

      const preparedInput = targetCat?.isPrivate
        ? encryptLinkForStorage({ ...editingLink, ...linkData, id: targetId }, targetCat)
        : { ...editingLink, ...linkData, id: targetId };

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
                isEncrypted: Boolean(targetCat?.isPrivate),
                updatedAt: Date.now(),
              }
            : l
        );
        saveCachedLinks(uid, next);
        return next;
      });

      showToast(
        targetCat?.isPrivate
          ? 'Private link updated!'
          : 'Link updated!'
      );
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
      const plainTitle = (linkData.title || 'Bookmark').trim();

      const preparedInput = targetCat?.isPrivate
        ? encryptLinkForStorage(
            {
              ...linkData,
              id: `link-${Date.now()}`,
              categorySlug: targetSlug,
            },
            targetCat
          )
        : {
            ...linkData,
            id: `link-${Date.now()}`,
            categorySlug: targetSlug,
          };

      const payload = sanitizeLinkCreate(preparedInput, uid);

      const newLinkItem: LinkItem = {
        ...payload,
        isEncrypted: Boolean(targetCat?.isPrivate),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

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

      showToast(
        targetCat?.isPrivate
          ? 'Link encrypted & saved!'
          : 'Link saved to vault!'
      );
      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#ff9000', '#ffa31a', '#ffffff'],
        });
      } catch {}

      if (!isE2ESession) {
        try {
          await setDoc(doc(db, `users/${uid}/links`, payload.id), payload);
        } catch (error) {
          console.warn('Could not sync new link to Firestore:', error);
        }
      }
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!userProfile) return;
    const linkToDelete = links.find((l) => l.id === id);
    if (!linkToDelete) return;
    playRetroClick();

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
        console.warn('Could not delete link from Firestore:', error);
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

  // Category CRUD operations in Firestore (with Encrypted Private Category support)
  const handleSaveCategory = async (catData: Partial<Category>) => {
    if (!userProfile) return;
    const uid = userProfile.uid;

    if (editingCategory) {
      const targetId = editingCategory.id;
      const encoded = encodeCategoryForStorage(
        { ...editingCategory, ...catData, id: targetId },
        uid
      );
      const sanitized = sanitizeCategoryCreate(
        {
          ...editingCategory,
          ...catData,
          id: targetId,
          name: encoded.name,
          description: encoded.description,
        },
        uid,
        editingCategory.order
      );

      const decodedCat = decodeCategoryFromStorage(
        {
          ...sanitized,
          createdAt: editingCategory.createdAt || Date.now(),
          isPrivate: encoded.isPrivate,
          privatePinHash: encoded.privatePinHash,
        },
        uid
      );

      setCategories((prev) => {
        const next = prev.map((c) => (c.id === targetId ? decodedCat : c));
        saveCachedCategories(uid, next);
        return next;
      });

      const newlyEncryptedLinks: LinkItem[] = [];
      if (decodedCat.isPrivate) {
        setUnlockedPrivateSlugs((prev) => new Set(prev).add(decodedCat.slug));
        setLinks((prev) => {
          const next = prev.map((l) => {
            if (
              (l.categorySlug === decodedCat.slug ||
                (l.categorySlug || '').toLowerCase().trim() ===
                  (decodedCat.slug || '').toLowerCase().trim()) &&
              !isLinkEncrypted(l)
            ) {
              const enc = encryptLinkForStorage(l, decodedCat);
              const encItem: LinkItem = {
                ...l,
                title: enc.title || l.title,
                url: enc.url || l.url,
                description: enc.description || '',
                imageUrl: '',
                faviconUrl: '',
                isEncrypted: true,
              };
              newlyEncryptedLinks.push(encItem);
              return encItem;
            }
            return l;
          });
          saveCachedLinks(uid, next);
          return next;
        });
      }

      showToast(
        decodedCat.isPrivate
          ? 'Private category updated!'
          : 'Category updated!'
      );
      setEditingCategory(null);

      if (!isE2ESession) {
        try {
          await updateDoc(doc(db, `users/${uid}/categories`, targetId), {
            name: sanitized.name,
            slug: sanitized.slug,
            color: sanitized.color,
            icon: sanitized.icon,
            description: sanitized.description,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          console.warn('Firestore category update fallback to setDoc:', error);
          try {
            await setDoc(doc(db, `users/${uid}/categories`, targetId), sanitized);
          } catch (innerErr) {
            console.warn('Could not sync updated category to Firestore:', innerErr);
          }
        }

        for (const encLink of newlyEncryptedLinks) {
          const sanitizedLink = sanitizeLinkCreate(encLink, uid);
          try {
            await updateDoc(doc(db, `users/${uid}/links`, encLink.id), {
              title: sanitizedLink.title,
              url: sanitizedLink.url,
              description: sanitizedLink.description,
              imageUrl: '',
              faviconUrl: '',
              updatedAt: serverTimestamp(),
            });
          } catch {
            try {
              await setDoc(doc(db, `users/${uid}/links`, encLink.id), sanitizedLink);
            } catch {}
          }
        }
      }
    } else {
      const encoded = encodeCategoryForStorage(
        {
          ...catData,
          id: `cat-${Date.now()}`,
        },
        uid
      );

      const payload = sanitizeCategoryCreate(
        {
          ...catData,
          id: `cat-${Date.now()}`,
          name: encoded.name,
          description: encoded.description,
          isDefault: false,
        },
        uid,
        categories.length
      );

      const decodedCat = decodeCategoryFromStorage(
        {
          ...payload,
          createdAt: Date.now(),
          isPrivate: encoded.isPrivate,
          privatePinHash: encoded.privatePinHash,
        },
        uid
      );

      setCategories((prev) => {
        const next = [...prev, decodedCat];
        saveCachedCategories(uid, next);
        return next;
      });

      if (decodedCat.isPrivate) {
        setUnlockedPrivateSlugs((prev) => new Set(prev).add(decodedCat.slug));
        setActiveCategory(decodedCat.slug);
        showToast('Private category created!');
      } else {
        showToast('Category created!');
      }

      if (!isE2ESession) {
        try {
          await setDoc(doc(db, `users/${uid}/categories`, payload.id), payload);
        } catch (error) {
          console.warn('Could not create category in Firestore:', error);
        }
      }
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

    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
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
        console.warn('Could not delete category from Firestore:', error);
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

    const next = [...categories];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const reordered = next.map((c, idx) => ({ ...c, order: idx }));
    setCategories(reordered);

    if (!isE2ESession) {
      const uid = userProfile.uid;
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
        console.warn('Could not reorder categories in Firestore:', error);
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
      createdCategoryPayload = sanitizeCategoryCreate(
        {
          id: `cat-${Date.now()}`,
          name: newCategoryMeta.name,
          slug: newCategoryMeta.slug,
          icon: newCategoryMeta.icon || 'Sparkles',
          color: newCategoryMeta.color || '#ff9000',
          description: newCategoryMeta.description || 'Shared category collection',
          isDefault: false,
        },
        uid,
        categories.length
      );
      destinationSlug = createdCategoryPayload.slug;
      setCategories((prev) => [
        ...prev,
        {
          ...createdCategoryPayload!,
          createdAt: Date.now(),
        },
      ]);
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
        console.warn('Could not sync shared category links to Firestore:', error);
      }
    }

    setPendingSharedBundle(null);
    setPendingSharedSummary(null);
    showToast(`Saved ${newItems.length} shared link${newItems.length === 1 ? '' : 's'}!`);
  },
  [userProfile, categories, pendingSharedBundle, isE2ESession, saveCachedLinks, showToast]
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

  // Lock and PIN operations stored in UserProfile in Firestore
  const handleLockVault = () => {
    playRetroLock();
    setIsLocked(true);
    setUnlockedPrivateSlugs(new Set());
    if (privateCategorySlugs.has(activeCategory)) {
      setActiveCategory('all');
    }
    showToast('Vault locked!');
  };

  const handleSavePin = async (newPin: string | null) => {
    if (!userProfile) return;
    const cleanPin = sanitizePin(newPin);

    setUserProfile((prev) => (prev ? { ...prev, pin: cleanPin } : null));

    if (!isE2ESession) {
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          pin: cleanPin,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Could not sync PIN to Firestore:', error);
      }
    }

    if (cleanPin) {
      showToast('Security PIN saved!');
    } else {
      showToast('Security PIN removed!');
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    playRetroClick();
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

  // Profile update handler (syncs allowed fields to Firestore and extended fields to localStorage)
  const handleSaveProfile = async (updated: Partial<UserProfile>) => {
    if (!userProfile) return;
    const uid = userProfile.uid;
    const mergedExtras: Partial<UserProfile> = {
      ...loadProfileExtras(uid),
      ...updated,
    };
    saveProfileExtras(uid, mergedExtras);

    const nextDisplayName = (updated.displayName || userProfile.displayName || 'LINKHUB User').slice(
      0,
      100
    );
    const nextEmail = (updated.email || userProfile.email || 'user@linkhub.cloud').slice(0, 150);
    const nextPhoto = updated.photoURL ?? userProfile.photoURL ?? '';

    setUserProfile((prev) =>
      prev
        ? {
            ...prev,
            ...updated,
            displayName: nextDisplayName,
            email: nextEmail,
            photoURL: nextPhoto,
          }
        : null
    );
    showToast('Settings saved!');

    if (!isE2ESession) {
      try {
        const firestorePatch: Record<string, unknown> = {
          displayName: nextDisplayName,
          email: nextEmail,
          updatedAt: serverTimestamp(),
        };
        if (typeof nextPhoto === 'string' && nextPhoto.length <= 32768) {
          firestorePatch.photoURL = nextPhoto;
        }
        await updateDoc(doc(db, 'users', uid), firestorePatch);
      } catch (err) {
        console.warn('Could not sync profile update to Firestore:', err);
      }
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
      .slice(0, 20);

    setCategories((prev) => [...prev, ...newCats]);
    setLinks((prev) => {
      const next = [...newItems, ...prev];
      saveCachedLinks(uid, next);
      return next;
    });

    if (!isE2ESession) {
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
        console.warn('Could not sync imported bookmarks to Firestore:', error);
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

  // 1. Auth Initialization Loading Screen
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

  // 2. Mandatory Login Landing Page when Unauthenticated (with Pre-Login Shared QR Preview Support)
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
            onClose={() => setIsScanQrOpen(false)}
            categories={categories}
            links={links}
            activeCategorySlug={activeCategory}
            initialBundle={pendingSharedBundle}
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

  // 3. Session PIN Lock Screen when Locked
  if (isLocked) {
    return (
      <>
        <LockedScreen
          onUnlock={() => setIsLocked(false)}
          hasPin={Boolean(userProfile.pin)}
          correctPin={userProfile.pin || null}
          userEmail={userProfile.email}
          userName={userProfile.displayName}
          securityQuestion={userProfile.securityQuestion}
          securityAnswer={userProfile.securityAnswer}
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
        hasPin={Boolean(userProfile.pin)}
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

          {/* Unlocked Private Encrypted Category Banner */}
          {activeCategory !== 'all' &&
            activeCategory !== 'starred' &&
            privateCategorySlugs.has(activeCategory) &&
            unlockedPrivateSlugs.has(activeCategory) && (
              <div className="rounded-xl bg-[#ff9000]/10 border border-[#ff9000]/35 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#ff9000]/20 text-[#ff9000] flex items-center justify-center shrink-0">
                    <ShieldCheck size={15} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="truncate">
                        {categories.find((c) => c.slug === activeCategory)?.name || 'Private Vault'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#ff9000] text-black text-[9px] font-extrabold uppercase tracking-wider">
                        Encrypted
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 truncate">
                      Bookmarks in this category are encrypted in the database and hidden from All Links.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleLockPrivateCategory(activeCategory)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-[#ff9000] text-white hover:text-black border border-white/[0.12] hover:border-[#ff9000] text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  <LockKeyhole size={12} strokeWidth={2.3} />
                  <span>Lock Category</span>
                </button>
              </div>
            )}

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
                onChange={(val) => setSortOption(val as SortOption)}
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
            <div>
              Created by <strong className="text-[#ff9000] font-bold">@DEBU-21</strong>
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
          currentPin={userProfile.pin || null}
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
          links={links}
          categories={categories}
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
          categories={categories}
          links={links}
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
          }}
          categories={categories}
          links={links}
          activeCategorySlug={activeCategory}
          initialBundle={pendingSharedBundle}
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
          category={pendingPrivateUnlock.category}
          onClose={() => setPendingPrivateUnlock(null)}
          onUnlockSuccess={(unlockedCat) => {
            const action = pendingPrivateUnlock.action;
            setPendingPrivateUnlock(null);
            setUnlockedPrivateSlugs((prev) => new Set(prev).add(unlockedCat.slug));
            showToast('Category unlocked!');
            if (action === 'select') {
              setActiveCategory(unlockedCat.slug);
            } else if (action === 'edit') {
              setEditingCategory(unlockedCat);
              setIsCategoryModalOpen(true);
            } else if (action === 'delete') {
              handleDeleteCategory(unlockedCat);
            } else if (action === 'share') {
              setShareCategorySlug(unlockedCat.slug);
              setIsShareCategoryQrOpen(true);
            }
          }}
        />
      )}
    </div>
  );
}

