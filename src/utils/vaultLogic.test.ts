import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  extractDomain,
  generateQuickCode,
  verifyPin,
  filterAndSortLinks,
  exportLinksToHtmlBookmarks,
  parseHtmlBookmarks,
} from './vaultLogic.ts';
import { LinkItem } from '../types.ts';

const dummyLinks: LinkItem[] = [
  {
    id: '1',
    title: 'Hacker News',
    url: 'https://news.ycombinator.com',
    categorySlug: 'information',
    description: 'Tech news and discussions',
    tags: ['tech', 'news'],
    isFavorite: false,
    clickCount: 10,
    imageUrl: '',
    faviconUrl: '',
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: '2',
    title: 'YouTube Hub',
    url: 'https://youtube.com',
    categorySlug: 'entertainment',
    description: 'Video streaming and podcasts',
    tags: ['video', 'music'],
    isFavorite: true,
    clickCount: 50,
    imageUrl: '',
    faviconUrl: '',
    createdAt: 2000,
    updatedAt: 2000,
  },
  {
    id: '3',
    title: 'GitHub Dev',
    url: 'https://github.com',
    categorySlug: 'study',
    description: 'Code repositories and git projects',
    tags: ['coding', 'git'],
    isFavorite: true,
    clickCount: 30,
    imageUrl: '',
    faviconUrl: '',
    createdAt: 3000,
    updatedAt: 3000,
  },
];

test('normalizeUrl prepends https:// if missing', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com');
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com');
  assert.equal(normalizeUrl('http://test.org/path'), 'http://test.org/path');
});

test('extractDomain strips www and handles pathnames', () => {
  assert.equal(extractDomain('https://www.google.com/search?q=test'), 'google.com');
  assert.equal(extractDomain('news.ycombinator.com'), 'news.ycombinator.com');
});

test('generateQuickCode generates a 6 digit formatted code', () => {
  const code = generateQuickCode('https://news.ycombinator.com');
  assert.match(code, /^\d{3}\s\d{3}$/);
});

test('verifyPin checks pin correctly', () => {
  assert.equal(verifyPin('123456', '123456'), true);
  assert.equal(verifyPin('000000', '123456'), false);
  assert.equal(verifyPin('any', null), true);
});

test('filterAndSortLinks filters by category', () => {
  const filtered = filterAndSortLinks(dummyLinks, {
    categorySlug: 'entertainment',
    searchQuery: '',
    sortOption: 'recent',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, 'YouTube Hub');
});

test('filterAndSortLinks filters by starred', () => {
  const starred = filterAndSortLinks(dummyLinks, {
    categorySlug: 'all',
    searchQuery: '',
    sortOption: 'recent',
    starredOnly: true,
  });
  assert.equal(starred.length, 2);
});

test('filterAndSortLinks searches query in title, url, tags, description', () => {
  const searchResults = filterAndSortLinks(dummyLinks, {
    categorySlug: 'all',
    searchQuery: 'music',
    sortOption: 'recent',
  });
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, '2');
});

test('filterAndSortLinks sorts by visits', () => {
  const sorted = filterAndSortLinks(dummyLinks, {
    categorySlug: 'all',
    searchQuery: '',
    sortOption: 'visits',
  });
  assert.equal(sorted[0].id, '2'); // 50 visits
  assert.equal(sorted[1].id, '3'); // 30 visits
  assert.equal(sorted[2].id, '1'); // 10 visits
});

test('export and parse Netscape HTML bookmarks round-trip', () => {
  const html = exportLinksToHtmlBookmarks(dummyLinks);
  assert.ok(html.includes('NETSCAPE-Bookmark-file-1'));
  const parsed = parseHtmlBookmarks(html);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].url, 'https://news.ycombinator.com');
});

test('encodeCategorySharePayload and decodeCategoryShareInput round-trip via shareUrl and qrPayload', async () => {
  const {
    encodeCategorySharePayload,
    decodeCategoryShareInput,
    extractServerShareToken,
  } = await import('./categoryShare.ts');
  const { shareUrl, qrPayload, shareCode } = encodeCategorySharePayload(
    { name: 'AI Tools', slug: 'ai', icon: 'cpu', color: '#ff9000' },
    dummyLinks
  );
  assert.ok(shareUrl.includes('?share='));
  assert.match(shareCode, /^LH-\d{3}-\d{3}$/);
  assert.equal(extractServerShareToken(shareCode), shareCode);
  assert.equal(extractServerShareToken(`https://example.com/?share=${shareCode}`), shareCode);
  assert.equal(extractServerShareToken(qrPayload), null);

  const fromUrl = decodeCategoryShareInput(shareUrl);
  assert.ok(fromUrl);
  assert.equal(fromUrl.categoryName, 'AI Tools');
  assert.equal(fromUrl.links.length, 3);

  const fromToken = decodeCategoryShareInput(qrPayload);
  assert.ok(fromToken);
  assert.equal(fromToken.shortCode, shareCode);
});

test('encodeCategoryForStorageAsync and verifyPrivateCategoryPinAsync store v2 wrapped vaults cleanly', async () => {
  const {
    encodeCategoryForStorageAsync,
    decodeCategoryFromStorage,
    verifyPrivateCategoryPinAsync,
  } = await import('./privateVaultCrypto.ts');

  const rawCat = {
    id: 'cat_secret',
    name: 'Secret Banking',
    slug: 'secret-banking',
    icon: 'lock',
    color: '#ff9000',
    description: 'Confidential financial portals',
    isPrivate: true,
    privatePin: '482910',
  };

  const encoded = await encodeCategoryForStorageAsync(rawCat, 'user_123');
  assert.ok(encoded.privateVaultMeta.startsWith('LHPRIV2:'));
  assert.equal(encoded.description, '[Encrypted Private Vault]');

  const decoded = decodeCategoryFromStorage(encoded, 'user_123');
  assert.equal(decoded.isPrivate, true);
  assert.equal(await verifyPrivateCategoryPinAsync('482910', decoded, 'user_123'), true);
  assert.equal(await verifyPrivateCategoryPinAsync('000000', decoded, 'user_123'), false);
});

test('encryptLinkForStorageAsync and decryptLinkInMemoryAsync use AES-256-GCM and mask until unlocked', async () => {
  const {
    encodeCategoryForStorageAsync,
    unlockAndStoreCategoryDek,
    encryptLinkForStorageAsync,
    decryptLinkInMemoryAsync,
    isLinkEncrypted,
  } = await import('./privateVaultCrypto.ts');

  const encodedPrivateCat = await encodeCategoryForStorageAsync(
    {
      id: 'cat_secret',
      name: 'Secret Banking',
      slug: 'secret-banking',
      icon: 'lock',
      color: '#ff9000',
      isPrivate: true,
      privatePin: '482910',
    },
    'user_123'
  );

  await unlockAndStoreCategoryDek('user_123', encodedPrivateCat, '482910');

  const privateLink: LinkItem = {
    id: 'priv_1',
    title: 'Swiss Vault Account',
    url: 'https://vault.example.ch/login',
    categorySlug: 'secret-banking',
    description: 'Private key recovery portal',
    tags: ['finance'],
    isFavorite: true,
    clickCount: 1,
    imageUrl: '',
    faviconUrl: '',
    createdAt: 5000,
    updatedAt: 5000,
  };

  const encrypted = (await encryptLinkForStorageAsync(
    privateLink,
    'user_123',
    encodedPrivateCat
  )) as LinkItem;
  assert.equal(isLinkEncrypted(encrypted), true);
  assert.ok(encrypted.title.startsWith('ENC2:'));
  assert.ok(encrypted.url.startsWith('https://encrypted.linkhub.vault/ENC2:'));
  assert.ok(encrypted.description.startsWith('ENC2:'));

  const lockedView = await decryptLinkInMemoryAsync(encrypted, 'user_123', encodedPrivateCat, false);
  assert.equal(lockedView.title, 'Encrypted Private Link');
  assert.equal(lockedView.url, 'https://encrypted.linkhub.vault');

  const unlockedView = await decryptLinkInMemoryAsync(encrypted, 'user_123', encodedPrivateCat, true);
  assert.equal(unlockedView.title, 'Swiss Vault Account');
  assert.equal(unlockedView.url, 'https://vault.example.ch/login');
  assert.equal(unlockedView.description, 'Private key recovery portal');
});

test('filterAndSortLinks excludes private category links from All Links and Favorites', () => {
  const mixedLinks: LinkItem[] = [
    ...dummyLinks,
    {
      id: '4',
      title: 'Private Crypto Seed',
      url: 'https://private.vault.io',
      categorySlug: 'secret-vault',
      description: 'Top secret link',
      tags: ['secret'],
      isFavorite: true,
      clickCount: 99,
      imageUrl: '',
      faviconUrl: '',
      createdAt: 6000,
      updatedAt: 6000,
      isEncrypted: true,
    },
  ];

  const allLinks = filterAndSortLinks(mixedLinks, {
    categorySlug: 'all',
    searchQuery: '',
    sortOption: 'recent',
    privateCategorySlugs: ['secret-vault'],
  });
  assert.equal(allLinks.length, 3);
  assert.equal(allLinks.some((l) => l.id === '4'), false);

  const starredLinks = filterAndSortLinks(mixedLinks, {
    categorySlug: 'starred',
    searchQuery: '',
    sortOption: 'recent',
    privateCategorySlugs: ['secret-vault'],
  });
  assert.equal(starredLinks.some((l) => l.id === '4'), false);

  const privateCategoryLinks = filterAndSortLinks(mixedLinks, {
    categorySlug: 'secret-vault',
    searchQuery: '',
    sortOption: 'recent',
    privateCategorySlugs: ['secret-vault'],
  });
  assert.equal(privateCategoryLinks.length, 1);
  assert.equal(privateCategoryLinks[0].id, '4');
});

test('formatCategoryName normalizes all-caps category names to standard case', async () => {
  const { formatCategoryName } = await import('./vaultLogic.ts');
  assert.equal(formatCategoryName('GAMING'), 'Gaming');
  assert.equal(formatCategoryName('SECRET VAULT'), 'Secret Vault');
  assert.equal(formatCategoryName('18+'), '18+');
});

test('getFaviconCandidates generates real site favicon fallback URLs and skips encrypted placeholders', async () => {
  const { getFaviconCandidates } = await import('./vaultLogic.ts');
  const githubIcons = getFaviconCandidates('https://github.com/torvalds/linux');
  assert.equal(githubIcons[0], 'https://www.google.com/s2/favicons?domain=github.com&sz=128');
  assert.equal(githubIcons[1], 'https://icons.duckduckgo.com/ip3/github.com.ico');
  assert.equal(githubIcons[2], 'https://github.com/favicon.ico');

  const withExplicit = getFaviconCandidates('https://figma.com', 'https://static.figma.com/app/icon/1/favicon.png');
  assert.equal(withExplicit[0], 'https://static.figma.com/app/icon/1/favicon.png');
  assert.equal(withExplicit[1], 'https://www.google.com/s2/favicons?domain=figma.com&sz=128');

  assert.deepEqual(getFaviconCandidates('https://encrypted.linkhub.vault'), []);
  assert.deepEqual(getFaviconCandidates('https://encrypted.linkhub.vault/ENC2:abc'), []);
});

test('generateUniqueCategorySlug handles duplicates, reserved slugs, and non-ASCII names', async () => {
  const { generateUniqueCategorySlug } = await import('./vaultLogic.ts');
  assert.equal(generateUniqueCategorySlug('Research', ['study', 'development']), 'research');
  assert.equal(generateUniqueCategorySlug('Study', ['study', 'development']), 'study-2');
  assert.equal(generateUniqueCategorySlug('Study', ['study', 'study-2']), 'study-3');
  assert.equal(generateUniqueCategorySlug('All', ['study']), 'cat-all');
  assert.equal(generateUniqueCategorySlug('Starred', ['study']), 'cat-starred');
  assert.equal(generateUniqueCategorySlug('All', ['cat-all']), 'cat-all-2');
  assert.equal(generateUniqueCategorySlug('C++', ['c']), 'c-2');
  assert.equal(generateUniqueCategorySlug('✨', []), 'category');
  assert.equal(generateUniqueCategorySlug('✨', ['category']), 'category-2');
});

test('mergeCategoriesWithPendingLocal preserves in-flight optimistic categories until reflected on server', async () => {
  const { mergeCategoriesWithPendingLocal } = await import('./vaultLogic.ts');
  const defaults = [
    { id: 'study', name: 'Study', slug: 'study', color: '#3b82f6', icon: 'graduation-cap', description: '', isDefault: true, order: 0, createdAt: 1 },
  ];
  const optimisticNew = {
    id: 'cat-pending-1',
    userId: 'u1',
    name: 'Research',
    slug: 'research',
    color: '#ff9000',
    icon: 'compass',
    description: '',
    isDefault: false,
    order: 1,
    createdAt: 10000,
  };

  // Server snapshot arrives before optimistic category is committed
  const { mergedCategories, missingDefaults } = mergeCategoriesWithPendingLocal({
    prevCategories: [defaults[0], optimisticNew],
    fetchedCategories: [defaults[0]],
    defaultCategories: defaults,
    uid: 'u1',
    pendingIds: new Set(['cat-pending-1']),
    deletedIds: new Set(),
    nowMs: 12000,
  });

  assert.equal(missingDefaults.length, 0);
  assert.equal(mergedCategories.some((c) => c.id === 'cat-pending-1'), true);
  assert.equal(mergedCategories.length, 2);

  // Deleted categories are excluded even if still in prev or server snapshot
  const afterDelete = mergeCategoriesWithPendingLocal({
    prevCategories: mergedCategories,
    fetchedCategories: [defaults[0], optimisticNew],
    defaultCategories: defaults,
    uid: 'u1',
    pendingIds: new Set(),
    deletedIds: new Set(['cat-pending-1']),
    nowMs: 13000,
  });
  assert.equal(afterDelete.mergedCategories.some((c) => c.id === 'cat-pending-1'), false);
});



