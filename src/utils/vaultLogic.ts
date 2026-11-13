import type { LinkItem, SortOption } from '../types.ts';

export function normalizeUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

export function extractDomain(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const normalized = normalizeUrl(rawUrl);
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return rawUrl;
  }
}

export function getFaviconUrl(rawUrl: string): string {
  const domain = extractDomain(rawUrl);
  if (!domain || domain === 'encrypted.linkhub.vault') return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function getFaviconCandidates(rawUrl: string, explicitFaviconUrl?: string): string[] {
  const candidates: string[] = [];
  const pushUnique = (u: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  const trimmedRaw = (rawUrl || '').trim();
  if (
    !trimmedRaw ||
    trimmedRaw.startsWith('https://encrypted.linkhub.vault') ||
    trimmedRaw.startsWith('ENC1:') ||
    trimmedRaw.startsWith('ENC2:')
  ) {
    return [];
  }

  if (explicitFaviconUrl && /^https?:\/\//i.test(explicitFaviconUrl.trim())) {
    const cleanExplicit = explicitFaviconUrl.trim();
    if (!cleanExplicit.startsWith('https://encrypted.linkhub.vault')) {
      pushUnique(cleanExplicit);
    }
  }

  try {
    const parsed = new URL(normalizeUrl(trimmedRaw));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return candidates;
    }
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (!hostname || hostname === 'encrypted.linkhub.vault') {
      return candidates;
    }

    pushUnique(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`);
    pushUnique(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`);
    pushUnique(`${parsed.origin}/favicon.ico`);
  } catch {
    const domain = extractDomain(trimmedRaw);
    if (domain && domain !== 'encrypted.linkhub.vault') {
      pushUnique(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
      pushUnique(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);
    }
  }

  return candidates;
}

export function generateQuickCode(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const code = (positive % 900000 + 100000).toString();
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function verifyPin(enteredPin: string, storedPin: string | null): boolean {
  if (!storedPin) return true;
  return enteredPin === storedPin;
}

/**
 * Formats category names consistently (first letter capitalized, rest lowercase)
 * even if the user enters ALL CAPS (e.g., "GAMING" -> "Gaming").
 */
export function formatCategoryName(rawName: string): string {
  const trimmed = (rawName || '').trim();
  if (!trimmed) return 'General';
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-&/])([a-z])/g, (_m, sep, ch) => `${sep}${ch.toUpperCase()}`)
    .replace(/\b(Ui|Ux|Ai|Api|Seo)\b/g, (m) => m.toUpperCase());
}

export function filterAndSortLinks(
  links: LinkItem[],
  options: {
    categorySlug: string;
    searchQuery: string;
    sortOption: SortOption;
    starredOnly?: boolean;
    activeTag?: string | null;
    privateCategorySlugs?: Set<string> | string[];
  }
): LinkItem[] {
  const {
    categorySlug,
    searchQuery,
    sortOption,
    starredOnly,
    activeTag,
    privateCategorySlugs,
  } = options;
  const q = (searchQuery || '').trim().toLowerCase();
  const rawPrivateList =
    privateCategorySlugs instanceof Set
      ? Array.from(privateCategorySlugs)
      : Array.isArray(privateCategorySlugs)
        ? privateCategorySlugs
        : [];
  const privateSlugsSet = new Set(
    rawPrivateList.flatMap((s) => [s, (s || '').toLowerCase().trim()])
  );

  return links
    .filter((link) => {
      const normalizedLinkSlug = (link.categorySlug || '').toLowerCase().trim();
      const isPrivateLink =
        privateSlugsSet.has(link.categorySlug) ||
        privateSlugsSet.has(normalizedLinkSlug) ||
        Boolean(link.isEncrypted) ||
        Boolean(link.title?.startsWith('ENC1:')) ||
        Boolean(link.url?.startsWith('https://encrypted.linkhub.vault/')) ||
        Boolean(link.description?.startsWith('ENC1:'));

      // Private links NEVER appear in "All Links" or "Favorites"
      if (categorySlug === 'all') {
        if (isPrivateLink) return false;
      } else if (categorySlug === 'starred') {
        if (isPrivateLink || !link.isFavorite) return false;
      } else if (
        link.categorySlug !== categorySlug &&
        normalizedLinkSlug !== (categorySlug || '').toLowerCase().trim()
      ) {
        return false;
      }

      // Starred only toggle
      if (starredOnly && !link.isFavorite) {
        return false;
      }

      // Active tag filter
      if (activeTag && !link.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase())) {
        return false;
      }

      // Search query
      if (q) {
        const titleMatch = link.title.toLowerCase().includes(q);
        const urlMatch = link.url.toLowerCase().includes(q);
        const descMatch = (link.description || '').toLowerCase().includes(q);
        const tagMatch = link.tags.some((t) => t.toLowerCase().includes(q));
        const domainMatch = extractDomain(link.url).toLowerCase().includes(q);
        if (!titleMatch && !urlMatch && !descMatch && !tagMatch && !domainMatch) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      switch (sortOption) {
        case 'recent':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'oldest':
          return (a.createdAt || 0) - (b.createdAt || 0);
        case 'visits':
          return (b.clickCount || 0) - (a.clickCount || 0);
        case 'alpha':
          return a.title.localeCompare(b.title);
        case 'alpha-desc':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
}

export function exportLinksToJson(links: LinkItem[], categories: unknown[]): string {
  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    generator: 'Linkora Retro Vault v1.0',
    categories,
    links,
  };
  return JSON.stringify(backup, null, 2);
}

export function exportLinksToHtmlBookmarks(links: LinkItem[]): string {
  const dateNow = Math.floor(Date.now() / 1000);
  const itemsHtml = links
    .map((link) => {
      const addDate = Math.floor(link.createdAt / 1000) || dateNow;
      const tagsAttr = link.tags.length ? ` TAGS="${link.tags.join(',')}"` : '';
      const iconAttr = link.faviconUrl ? ` ICON="${link.faviconUrl}"` : '';
      return `        <DT><A HREF="${link.url}" ADD_DATE="${addDate}"${tagsAttr}${iconAttr}>${escapeHtml(link.title)}</A>\n        <DD>${escapeHtml(link.description || '')}`;
    })
    .join('\n');

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${dateNow}" LAST_MODIFIED="${dateNow}">Linkora Retro Vault</H3>
    <DL><p>
${itemsHtml}
    </DL><p>
</DL><p>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function parseHtmlBookmarks(html: string): Partial<LinkItem>[] {
  const results: Partial<LinkItem>[] = [];
  const regex = /<A\s+(?:[^>]*?\s+)?HREF="([^"]*)"(?:[^>]*?\s+)?(?:TAGS="([^"]*)")?(?:[^>]*?\s+)?(?:ICON="([^"]*)")?[^>]*>(.*?)<\/A>(?:\s*<DD>(.*?)(?=<DT|<DL|<\/DL|$))?/gis;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawUrl = match[1];
    const tagsString = match[2];
    const icon = match[3];
    const title = match[4]?.replace(/<[^>]+>/g, '').trim() || extractDomain(rawUrl);
    const description = match[5]?.replace(/<[^>]+>/g, '').trim() || '';

    if (rawUrl && rawUrl.startsWith('http')) {
      results.push({
        title,
        url: rawUrl,
        description,
        tags: tagsString ? tagsString.split(',').map((t) => t.trim()).filter(Boolean) : [],
        faviconUrl: icon || getFaviconUrl(rawUrl),
        categorySlug: 'development',
        isFavorite: false,
        clickCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  return results;
}

export function getCategoryIconName(icon: string | undefined): string {
  if (!icon) return 'folder';
  return icon;
}
