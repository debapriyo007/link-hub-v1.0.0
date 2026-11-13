import { Category, LinkItem } from '../types.ts';

export interface SharedLinkEntry {
  title: string;
  url: string;
  description?: string;
  tags?: string[];
}

export interface SharedCategoryBundle {
  version: 1 | 2;
  shortCode: string;
  shareToken?: string;
  readOnly?: boolean;
  hasPassword?: boolean;
  expiresAt?: number;
  categoryName: string;
  categorySlug: string;
  categoryIcon?: string;
  categoryColor?: string;
  links: SharedLinkEntry[];
  createdAt: number;
}

export interface PendingSharedImport {
  chosenLinks: SharedLinkEntry[];
  targetCategorySlug: string;
  newCategoryMeta?: {
    name: string;
    slug: string;
    icon?: string;
    color?: string;
  };
  bundleName: string;
  savedAt: number;
}

const REGISTRY_STORAGE_KEY = 'linkhub_shared_category_bundles_v1';
const PENDING_IMPORT_STORAGE_KEY = 'linkhub_pending_shared_import_v1';

export function sanitizeSharedHttpUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL((rawUrl || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.hostname === 'encrypted.linkhub.vault') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Generates a CSPRNG offline short label when creating a portable fallback bundle.
 */
export function generateCategoryShortCode(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    const num = (arr[0] % 900000) + 100000;
    const digits = String(num);
    return `LH-${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
  }
  return 'LH-OFF-LINE';
}

export function extractServerShareToken(rawInput: string): string | null {
  let trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('?share=') || trimmed.includes('&share=')) {
    try {
      const urlObj = new URL(trimmed, 'https://linkhub.cloud');
      const param = urlObj.searchParams.get('share');
      if (param) trimmed = decodeURIComponent(param).trim();
    } catch {
      const m = trimmed.match(/[?&]share=([^&#\s]+)/i);
      if (m?.[1]) {
        try {
          trimmed = decodeURIComponent(m[1]).trim();
        } catch {
          trimmed = m[1].trim();
        }
      }
    }
  }

  return /^lh2_[a-zA-Z0-9_-]{18,120}$/.test(trimmed) ? trimmed : null;
}

/**
 * Creates a server-backed high-entropy share link with TTL, optional password, and revocation support.
 */
export async function createServerCategoryShare(params: {
  category: Pick<Category, 'name' | 'slug' | 'icon' | 'color'>;
  links: LinkItem[];
  ttlHours?: number;
  password?: string;
}): Promise<{
  shareToken: string;
  shareUrl: string;
  expiresAt: number;
  hasPassword: boolean;
  linkCount: number;
}> {
  const safeLinks = params.links
    .slice(0, 40)
    .map((l) => {
      const cleanUrl = sanitizeSharedHttpUrl(l.url);
      if (!cleanUrl) return null;
      return {
        title: (l.title || 'Shared Bookmark').slice(0, 120),
        url: cleanUrl,
        description: l.description ? l.description.slice(0, 240) : undefined,
        tags: l.tags ? l.tags.slice(0, 6) : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (safeLinks.length === 0) {
    throw new Error('No shareable HTTP/HTTPS bookmarks found in this collection.');
  }

  const { getSecurityHeaders } = await import('../firebase.ts');
  const headers = await getSecurityHeaders();
  if (!headers.Authorization) {
    throw new Error('Sign in with a verified account to generate server-backed share links.');
  }

  const response = await fetch('/api/shares', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      categoryName: params.category.name,
      categorySlug: params.category.slug,
      categoryIcon: params.category.icon || 'folder',
      categoryColor: params.category.color || '#ff9000',
      links: safeLinks,
      ttlHours: params.ttlHours ?? 24 * 7,
      password: params.password?.trim() || undefined,
    }),
  });

  const payload = (await response.json()) as {
    shareToken?: string;
    expiresAt?: number;
    hasPassword?: boolean;
    linkCount?: number;
    error?: string;
  };

  if (!response.ok || !payload.shareToken) {
    throw new Error(payload.error || 'Could not create secure share link.');
  }

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://linkhub.cloud';
  const shareUrl = `${origin}/?share=${encodeURIComponent(payload.shareToken)}`;

  return {
    shareToken: payload.shareToken,
    shareUrl,
    expiresAt: payload.expiresAt || Date.now() + 7 * 24 * 3600 * 1000,
    hasPassword: Boolean(payload.hasPassword),
    linkCount: payload.linkCount || safeLinks.length,
  };
}

export type ResolveServerShareResult =
  | { status: 'ok'; bundle: SharedCategoryBundle }
  | { status: 'password_required'; categoryName?: string; error?: string }
  | { status: 'error'; error: string };

export async function resolveServerCategoryShare(
  tokenOrUrl: string,
  password?: string
): Promise<ResolveServerShareResult> {
  const token = extractServerShareToken(tokenOrUrl);
  if (!token) {
    return { status: 'error', error: 'Invalid v2 share token format.' };
  }

  try {
    const response = await fetch(`/api/shares/${encodeURIComponent(token)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(password ? { password } : {}),
    });

    const data = (await response.json()) as {
      requiresPassword?: boolean;
      categoryName?: string;
      categorySlug?: string;
      categoryIcon?: string;
      categoryColor?: string;
      hasPassword?: boolean;
      expiresAt?: number;
      createdAt?: number;
      links?: SharedLinkEntry[];
      error?: string;
    };

    if (response.status === 401 && data.requiresPassword) {
      return {
        status: 'password_required',
        categoryName: data.categoryName,
        error: password ? data.error || 'Incorrect share password.' : undefined,
      };
    }

    if (!response.ok || !Array.isArray(data.links)) {
      return {
        status: 'error',
        error: data.error || 'Share link could not be loaded.',
      };
    }

    const sanitizedLinks: SharedLinkEntry[] = data.links
      .map((l) => {
        const cleanUrl = sanitizeSharedHttpUrl(l.url);
        if (!cleanUrl) return null;
        return {
          title: String(l.title || 'Shared Bookmark').slice(0, 120),
          url: cleanUrl,
          description: l.description ? String(l.description).slice(0, 240) : undefined,
          tags: Array.isArray(l.tags) ? l.tags.map(String).slice(0, 6) : undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    return {
      status: 'ok',
      bundle: {
        version: 2,
        shortCode: token.slice(0, 12),
        shareToken: token,
        readOnly: true,
        hasPassword: Boolean(data.hasPassword),
        expiresAt: data.expiresAt,
        categoryName: data.categoryName || 'Shared Collection',
        categorySlug: data.categorySlug || 'shared',
        categoryIcon: data.categoryIcon || 'folder',
        categoryColor: data.categoryColor || '#ff9000',
        links: sanitizedLinks,
        createdAt: data.createdAt || Date.now(),
      },
    };
  } catch {
    return {
      status: 'error',
      error: 'Could not reach share resolution service.',
    };
  }
}

export async function revokeServerCategoryShare(shareToken: string): Promise<void> {
  const token = extractServerShareToken(shareToken);
  if (!token) throw new Error('Invalid share token.');
  const { getSecurityHeaders } = await import('../firebase.ts');
  const headers = await getSecurityHeaders();
  const res = await fetch(`/api/shares/${encodeURIComponent(token)}/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Could not revoke share link.');
  }
}

/**
 * Offline portable fallback token generator (sanitizes all URLs and never exports encrypted vault placeholders).
 */
export function encodeCategorySharePayload(
  category: Pick<Category, 'name' | 'slug' | 'icon' | 'color'>,
  links: LinkItem[]
): {
  bundle: SharedCategoryBundle;
  qrPayload: string;
  shareUrl: string;
  shareCode: string;
} {
  const sharedLinks: SharedLinkEntry[] = links
    .slice(0, 40)
    .map((l) => {
      const cleanUrl = sanitizeSharedHttpUrl(l.url);
      if (!cleanUrl) return null;
      return {
        title: l.title,
        url: cleanUrl,
        description: l.description ? l.description.slice(0, 120) : undefined,
        tags: l.tags ? l.tags.slice(0, 4) : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const shortCode = generateCategoryShortCode();

  const bundle: SharedCategoryBundle = {
    version: 1,
    shortCode,
    readOnly: true,
    categoryName: category.name,
    categorySlug: category.slug,
    categoryIcon: category.icon,
    categoryColor: category.color,
    links: sharedLinks,
    createdAt: Date.now(),
  };

  const compact = {
    c: bundle.categoryName,
    s: bundle.shortCode,
    i: bundle.categoryIcon || 'folder',
    k: bundle.categoryColor || '#ff9000',
    l: bundle.links.map((item) => [
      item.title,
      item.url,
      item.description || '',
      (item.tags || []).join(','),
    ]),
  };

  const qrPayload = `LHCAT1:${toBase64Url(JSON.stringify(compact))}`;
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://linkhub.cloud';
  const shareUrl = `${origin}/?share=${encodeURIComponent(qrPayload)}`;

  return {
    bundle,
    qrPayload,
    shareUrl,
    shareCode: shortCode,
  };
}

/**
 * Decodes portable offline LHCAT1 tokens or cached share entries with strict HTTP/HTTPS sanitization.
 */
export function decodeCategoryShareInput(
  rawInput: string,
  _existingCategories: Category[] = [],
  _existingLinks: LinkItem[] = []
): SharedCategoryBundle | null {
  let trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('?share=') || trimmed.includes('&share=')) {
    try {
      const urlObj = new URL(trimmed, 'https://linkhub.cloud');
      const shareParam = urlObj.searchParams.get('share');
      if (shareParam) {
        trimmed = decodeURIComponent(shareParam).trim();
      }
    } catch {
      const match = trimmed.match(/[?&]share=([^&#\s]+)/i);
      if (match?.[1]) {
        try {
          trimmed = decodeURIComponent(match[1]).trim();
        } catch {
          trimmed = match[1].trim();
        }
      }
    }
  }

  const tokenIdx = trimmed.indexOf('LHCAT1:');
  if (tokenIdx > 0) {
    trimmed = trimmed.slice(tokenIdx).trim();
  }

  if (trimmed.startsWith('LHCAT1:')) {
    try {
      const encoded = trimmed.slice('LHCAT1:'.length).trim();
      const jsonStr = fromBase64Url(encoded);
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.c === 'string' && Array.isArray(parsed.l)) {
        const links: SharedLinkEntry[] = parsed.l
          .filter((row: unknown) => Array.isArray(row) && row.length >= 2)
          .map((row: string[]) => {
            const cleanUrl = sanitizeSharedHttpUrl(String(row[1] || ''));
            if (!cleanUrl) return null;
            return {
              title: String(row[0] || 'Shared Bookmark').slice(0, 120),
              url: cleanUrl,
              description: row[2] ? String(row[2]).slice(0, 240) : undefined,
              tags: row[3]
                ? String(row[3])
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 6)
                : undefined,
            };
          })
          .filter((item: SharedLinkEntry | null): item is SharedLinkEntry => Boolean(item));

        if (links.length === 0) return null;

        return {
          version: 1,
          readOnly: true,
          shortCode: typeof parsed.s === 'string' ? parsed.s.slice(0, 20) : generateCategoryShortCode(),
          categoryName: parsed.c.slice(0, 60),
          categorySlug: parsed.c.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || 'shared',
          categoryIcon: typeof parsed.i === 'string' ? parsed.i.slice(0, 40) : 'folder',
          categoryColor: typeof parsed.k === 'string' ? parsed.k.slice(0, 20) : '#ff9000',
          links,
          createdAt: Date.now(),
        };
      }
    } catch {
      return null;
    }
  }

  // Optional local registry lookup for previously created local offline shares
  const normalizedCode = trimmed.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const digitsOnly = normalizedCode.replace(/^LH/, '');
  if (typeof window !== 'undefined' && normalizedCode) {
    try {
      const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
      if (raw) {
        const registry: Record<string, SharedCategoryBundle> = JSON.parse(raw);
        if (registry[normalizedCode]) return registry[normalizedCode];
        if (digitsOnly && registry[digitsOnly]) return registry[digitsOnly];
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

export function savePendingSharedImport(pending: PendingSharedImport): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_IMPORT_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Ignore storage errors
  }
}

export function peekPendingSharedImport(): PendingSharedImport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingSharedImport;
  } catch {
    return null;
  }
}

export function consumePendingSharedImport(): PendingSharedImport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_IMPORT_STORAGE_KEY);
    return JSON.parse(raw) as PendingSharedImport;
  } catch {
    return null;
  }
}
