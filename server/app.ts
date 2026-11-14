/**
 * Hardened LinkHub Backend Express API Factory (LinkHub v2.0.0)
 * Shared between local/Node Express (`server.ts`) and Netlify Serverless (`netlify/functions/api.ts`).
 */

import express, { type NextFunction, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import {
  safeFetchExternalText,
  SsrfValidationError,
  validateExternalUrl,
  type DnsLookupFn,
} from './ssrf.ts';
import {
  cleanupUnverifiedPasswordUserByEmail,
  createAppCheckMiddleware,
  createAuthMiddleware,
  createCorsMiddleware,
  createSlidingWindowRateLimiter,
  securityHeadersMiddleware,
  type ApiRequest,
  type FirebaseTokenVerifier,
  type UnverifiedCleanupResult,
} from './security.ts';
import {
  createDefaultSharesRepository,
  isValidShareTokenFormat,
  toPublicSharePayload,
  verifySharePassword,
  type SharesRepository,
} from './sharesStore.ts';

interface SmartMetadataResult {
  title: string;
  description: string;
  tags: string[];
  suggestedCategorySlug?: string;
}

const KNOWN_DOMAINS: Record<
  string,
  { title: string; description: string; tags: string[]; category: string }
> = {
  'github.com': {
    title: 'GitHub Repository & Developer Workspace',
    description:
      'Source code repository, issue tracking, and collaborative software development resources on GitHub.',
    tags: ['github', 'code', 'dev'],
    category: 'code',
  },
  'figma.com': {
    title: 'Figma Design System & Interface Workspace',
    description:
      'Collaborative UI/UX design file, interactive prototype, and component library in Figma.',
    tags: ['design', 'figma', 'ui'],
    category: 'design',
  },
  'youtube.com': {
    title: 'YouTube Video & Creator Channel',
    description:
      'Curated video tutorial, keynote presentation, or media stream saved from YouTube.',
    tags: ['video', 'youtube', 'media'],
    category: 'social',
  },
  'youtu.be': {
    title: 'YouTube Video Stream',
    description: 'Direct short-link to a saved YouTube video tutorial or showcase.',
    tags: ['video', 'youtube'],
    category: 'social',
  },
  'x.com': {
    title: 'X (Twitter) Post & Thread',
    description: 'Saved discussion thread, announcement, or insight shared on X.',
    tags: ['social', 'thread', 'news'],
    category: 'social',
  },
  'twitter.com': {
    title: 'Twitter Post & Thread',
    description: 'Saved discussion thread, announcement, or insight shared on Twitter.',
    tags: ['social', 'thread', 'news'],
    category: 'social',
  },
  'linkedin.com': {
    title: 'LinkedIn Professional Network & Article',
    description: 'Professional insight, career resource, or industry post saved from LinkedIn.',
    tags: ['career', 'network', 'linkedin'],
    category: 'social',
  },
  'chatgpt.com': {
    title: 'ChatGPT AI Assistant & Prompt Workspace',
    description: 'Interactive AI research assistant, coding copilot, and prompt workflow.',
    tags: ['ai', 'assistant', 'llm'],
    category: 'ai',
  },
  'openai.com': {
    title: 'OpenAI Platform & Research Documentation',
    description: 'AI model documentation, API guides, and research publications from OpenAI.',
    tags: ['ai', 'openai', 'research'],
    category: 'ai',
  },
  'claude.ai': {
    title: 'Claude AI Workspace',
    description: 'AI reasoning, writing, and technical analysis assistant by Anthropic.',
    tags: ['ai', 'claude', 'assistant'],
    category: 'ai',
  },
  'vercel.com': {
    title: 'Vercel Cloud Deployment & Frontend Platform',
    description: 'Frontend cloud deployment dashboard, edge functions, and hosting platform.',
    tags: ['cloud', 'deploy', 'dev'],
    category: 'code',
  },
  'react.dev': {
    title: 'React Official Documentation & Guides',
    description: 'Modern React hooks, component architecture, and API reference documentation.',
    tags: ['react', 'frontend', 'docs'],
    category: 'code',
  },
  'tailwindcss.com': {
    title: 'Tailwind CSS Framework Documentation',
    description: 'Utility-first CSS framework reference for building responsive modern interfaces.',
    tags: ['css', 'tailwind', 'design'],
    category: 'design',
  },
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSmartFallbackMetadata(
  parsedUrl: URL,
  availableCategorySlugs: string[] = []
): SmartMetadataResult {
  try {
    const host = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    const pathSegments = parsedUrl.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    const known = KNOWN_DOMAINS[host];
    const domainParts = host.split('.');
    const brandRaw = domainParts[0] || host;
    const brandName = brandRaw.charAt(0).toUpperCase() + brandRaw.slice(1);

    let readablePath = '';
    if (pathSegments.length > 0) {
      const lastSeg = decodeURIComponent(pathSegments[pathSegments.length - 1])
        .replace(/\.(html|htm|php|aspx|jsp|md)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (lastSeg && lastSeg.length > 1) {
        readablePath = lastSeg
          .split(/\s+/)
          .slice(0, 6)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
    }

    if (known) {
      const title = readablePath ? `${brandName} — ${readablePath}` : known.title;
      const description = readablePath
        ? `${known.description} Focused on ${readablePath}.`
        : known.description;
      const suggestedCategorySlug = availableCategorySlugs.includes(known.category)
        ? known.category
        : availableCategorySlugs[0];
      return {
        title: title.slice(0, 90),
        description: description.slice(0, 220),
        tags: known.tags,
        suggestedCategorySlug,
      };
    }

    const title = readablePath
      ? `${brandName} — ${readablePath}`
      : `${brandName} Official Resource & Web Portal`;
    const description = readablePath
      ? `Curated web resource from ${host} covering ${readablePath.toLowerCase()} for quick reference in your vault.`
      : `Important web bookmark and reference portal hosted on ${host}.`;
    const pathTag = pathSegments[0]
      ? pathSegments[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)
      : '';
    const tags = Array.from(
      new Set([brandRaw.replace(/[^a-z0-9]/g, ''), pathTag, 'resource'].filter(Boolean))
    ).slice(0, 3);

    return {
      title: title.slice(0, 90),
      description: description.slice(0, 220),
      tags,
      suggestedCategorySlug: availableCategorySlugs[0],
    };
  } catch {
    return {
      title: 'Saved Web Bookmark',
      description: 'Curated reference link saved to your personal LINKHUB cloud vault.',
      tags: ['bookmark', 'reference'],
      suggestedCategorySlug: availableCategorySlugs[0],
    };
  }
}

export interface CreateApiAppOptions {
  tokenVerifier?: FirebaseTokenVerifier;
  sharesRepo?: SharesRepository;
  enforceAppCheck?: boolean;
  allowedOrigins?: Set<string>;
  lookupFn?: DnsLookupFn;
  fetchImpl?: typeof fetch;
  aiRateLimitMax?: number;
  readerRateLimitMax?: number;
  shareRateLimitMax?: number;
  cleanupUnverifiedAuthUser?: (email: string) => Promise<UnverifiedCleanupResult>;
}

export function createApiApp(options: CreateApiAppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const sharesRepo = options.sharesRepo || createDefaultSharesRepository();
  const requireAuth = createAuthMiddleware(options.tokenVerifier);
  const checkAppCheck = createAppCheckMiddleware({ enforce: options.enforceAppCheck });

  const aiLimiter = createSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: options.aiRateLimitMax ?? 25,
    keyPrefix: 'ai-meta',
  });
  const readerLimiter = createSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: options.readerRateLimitMax ?? 30,
    keyPrefix: 'stealth-reader',
  });
  const shareWriteLimiter = createSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: options.shareRateLimitMax ?? 20,
    keyPrefix: 'share-write',
  });
  const shareReadLimiter = createSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 60,
    keyPrefix: 'share-read',
  });
  const authCleanupLimiter = createSlidingWindowRateLimiter({
    windowMs: 15 * 60_000,
    maxRequests: 12,
    keyPrefix: 'auth-cleanup',
  });
  const cleanupUnverifiedAuthUser =
    options.cleanupUnverifiedAuthUser || cleanupUnverifiedPasswordUserByEmail;

  app.use(securityHeadersMiddleware);
  app.use(createCorsMiddleware(options.allowedOrigins));
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'linkhub-api',
      version: '2.0.0',
    });
  });

  // Clean up stale unverified password-only Firebase Auth accounts before re-signup
  app.post('/api/auth/cleanup-unverified', authCleanupLimiter, async (req, res) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!rawEmail || rawEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail)) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }

    try {
      const result = await cleanupUnverifiedAuthUser(rawEmail);
      res.json({
        ok: true,
        cleaned: Boolean(result.cleaned),
        adminConfigured: Boolean(result.adminConfigured),
      });
    } catch {
      res.json({
        ok: false,
        cleaned: false,
        adminConfigured: false,
      });
    }
  });

  // =========================================================================
  // 1. Authenticated, SSRF-Protected AI Metadata Generator
  // =========================================================================
  app.post(
    '/api/ai/link-metadata',
    requireAuth,
    checkAppCheck,
    aiLimiter,
    async (req: ApiRequest, res: Response) => {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl) {
        res.status(400).json({ error: 'Please provide a URL first.' });
        return;
      }

      const categories: Array<{ slug: string; name: string }> = Array.isArray(req.body?.categories)
        ? req.body.categories
            .filter(
              (c: unknown): c is { slug: string; name: string } =>
                Boolean(c && typeof c === 'object' && typeof (c as { slug?: unknown }).slug === 'string')
            )
            .slice(0, 30)
        : [];
      const categorySlugs = categories.map((c) => c.slug.slice(0, 60)).filter(Boolean);

      const normalizedInput = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      let targetUrl: URL;
      try {
        targetUrl = validateExternalUrl(normalizedInput);
      } catch (err) {
        const ssrfErr = err instanceof SsrfValidationError ? err : null;
        res.status(ssrfErr?.statusCode || 400).json({
          error: ssrfErr?.message || 'Only public HTTP and HTTPS URLs are permitted.',
        });
        return;
      }

      const fallback = buildSmartFallbackMetadata(targetUrl, categorySlugs);
      let scrapedTitle = '';
      let scrapedDesc = '';

      try {
        const fetched = await safeFetchExternalText(targetUrl.toString(), {
          timeoutMs: 2800,
          maxBytes: 32_000,
          lookupFn: options.lookupFn,
          fetchImpl: options.fetchImpl,
        });
        if (fetched.ok) {
          const titleMatch = fetched.bodyText.match(/<title[^>]*>([^<]+)<\/title>/i);
          const descMatch =
            fetched.bodyText.match(
              /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
            ) ||
            fetched.bodyText.match(
              /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
            );
          scrapedTitle = titleMatch?.[1] ? decodeEntities(titleMatch[1]).slice(0, 95) : '';
          scrapedDesc = descMatch?.[1] ? decodeEntities(descMatch[1]).slice(0, 220) : '';
        }
      } catch (err) {
        if (err instanceof SsrfValidationError && err.statusCode === 403) {
          res.status(403).json({ error: err.message });
          return;
        }
        // Non-fatal scrape failure falls back to domain metadata
      }

      if (scrapedTitle.length > 2) fallback.title = scrapedTitle;
      if (scrapedDesc.length > 8) fallback.description = scrapedDesc;

      const apiKey = process.env.GEMINI_API_KEY;
      const hasValidGeminiKey =
        Boolean(apiKey) &&
        apiKey !== 'MY_GEMINI_API_KEY' &&
        apiKey !== 'YOUR_API_KEY' &&
        apiKey!.trim().length > 10;

      if (hasValidGeminiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const categoryListText =
            categories.length > 0
              ? categories.map((c) => `${c.slug.slice(0, 40)} (${String(c.name || '').slice(0, 60)})`).join(', ')
              : 'information,ai,design,code,social';

          const prompt = `Generate a concise, professional bookmark title, a clear 1-2 sentence description (max 180 characters), 2 to 3 lowercase single-word tags, and pick the best matching category slug from [${categoryListText}] for this URL:
URL: ${targetUrl.toString()}
${scrapedTitle ? `Detected Page Title: ${scrapedTitle}` : ''}
${scrapedDesc ? `Detected Meta Description: ${scrapedDesc}` : ''}`;

          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: 'Clean, human-friendly title for the bookmark (max 80 chars)',
                  },
                  description: {
                    type: Type.STRING,
                    description:
                      'Concise 1-2 sentence summary of what this link is for (max 180 chars)',
                  },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '2 to 3 short lowercase tags without #',
                  },
                  suggestedCategorySlug: {
                    type: Type.STRING,
                    description: 'Best matching category slug from the provided list',
                  },
                },
                required: ['title', 'description', 'tags'],
              },
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text);
            res.json({
              title: String(parsed.title || fallback.title).slice(0, 95),
              description: String(parsed.description || fallback.description).slice(0, 220),
              tags: Array.isArray(parsed.tags)
                ? parsed.tags
                    .map((t: unknown) => String(t).toLowerCase().replace(/^#/, '').trim())
                    .filter(Boolean)
                    .slice(0, 4)
                : fallback.tags,
              suggestedCategorySlug:
                parsed.suggestedCategorySlug && categorySlugs.includes(parsed.suggestedCategorySlug)
                  ? parsed.suggestedCategorySlug
                  : fallback.suggestedCategorySlug,
              source: 'gemini',
            });
            return;
          }
        } catch (err) {
          console.warn('Gemini metadata generation fallback triggered:', err);
        }
      }

      res.json({
        ...fallback,
        source: 'smart-analyzer',
      });
    }
  );

  // =========================================================================
  // 2. Authenticated, SSRF-Hardened Tracker-Free Reader Preview Endpoint
  // =========================================================================
  app.post(
    '/api/stealth/reader',
    requireAuth,
    checkAppCheck,
    readerLimiter,
    async (req: ApiRequest, res: Response) => {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl) {
        res.status(400).json({ error: 'Missing URL.' });
        return;
      }

      const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      let targetUrl: URL;
      try {
        targetUrl = validateExternalUrl(normalized);
      } catch (err) {
        const ssrfErr = err instanceof SsrfValidationError ? err : null;
        res.status(ssrfErr?.statusCode || 400).json({
          error: ssrfErr?.message || 'Only public HTTP/HTTPS links are supported in Reader Preview.',
        });
        return;
      }

      try {
        const fetched = await safeFetchExternalText(targetUrl.toString(), {
          timeoutMs: 4500,
          maxBytes: 180_000,
          maxRedirects: 3,
          accept: 'text/html,application/xhtml+xml,text/plain',
          userAgent: 'Mozilla/5.0 (compatible; LinkHubReader/2.0; +https://linkhub.cloud)',
          lookupFn: options.lookupFn,
          fetchImpl: options.fetchImpl,
        });

        const finalHost = new URL(fetched.finalUrl).hostname.replace(/^www\./i, '');
        if (!fetched.ok) {
          res.json({
            ok: false,
            domain: finalHost,
            reason: `Site returned status ${fetched.status} to automated reader requests.`,
            paragraphs: [],
          });
          return;
        }

        const rawHtml = fetched.bodyText;
        const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? decodeEntities(titleMatch[1]).slice(0, 140) : finalHost;

        const descMatch =
          rawHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
          rawHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        const summary = descMatch ? decodeEntities(descMatch[1]).slice(0, 260) : '';

        const cleanedHtml = rawHtml
          .replace(
            /<(script|style|noscript|svg|iframe|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi,
            ' '
          )
          .replace(/<!--[\s\S]*?-->/g, ' ');

        const blocks: string[] = [];
        const blockRegex = /<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
        let match: RegExpExecArray | null;
        while ((match = blockRegex.exec(cleanedHtml)) !== null && blocks.length < 18) {
          const plain = decodeEntities(match[2].replace(/<[^>]+>/g, ' '));
          if (plain.length >= 28 && !blocks.includes(plain)) {
            blocks.push(plain.slice(0, 360));
          }
        }

        res.json({
          ok: true,
          domain: finalHost,
          title,
          summary,
          paragraphs: blocks,
        });
      } catch (err) {
        if (err instanceof SsrfValidationError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.json({
          ok: false,
          domain: targetUrl.hostname.replace(/^www\./i, ''),
          reason:
            'This site requires an interactive browser session or blocked automated previews.',
          paragraphs: [],
        });
      }
    }
  );

  // =========================================================================
  // 3. Hardened Share Records API (High-Entropy Tokens, TTL, Revocation, Optional Password)
  // =========================================================================
  app.post(
    '/api/shares',
    requireAuth,
    checkAppCheck,
    shareWriteLimiter,
    async (req: ApiRequest, res: Response) => {
      const ownerId = req.auth!.uid;
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || !Array.isArray(body.links)) {
        res.status(400).json({ error: 'A non-empty links array is required.' });
        return;
      }

      try {
        const record = await sharesRepo.create({
          ownerId,
          shortCode: typeof body.shortCode === 'string' ? body.shortCode : undefined,
          categoryName: String(body.categoryName || 'Shared Collection'),
          categorySlug: String(body.categorySlug || 'shared'),
          categoryIcon: typeof body.categoryIcon === 'string' ? body.categoryIcon : 'folder',
          categoryColor: typeof body.categoryColor === 'string' ? body.categoryColor : '#ff9000',
          links: body.links,
          ttlHours: typeof body.ttlHours === 'number' ? body.ttlHours : 24 * 7,
          password: typeof body.password === 'string' ? body.password : undefined,
        });

        res.status(201).json({
          shareToken: record.id,
          shortCode: record.shortCode,
          expiresAt: record.expiresAt,
          hasPassword: record.hasPassword,
          readOnly: record.readOnly,
          linkCount: record.linkCount,
        });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Could not create share.',
        });
      }
    }
  );

  app.get('/api/shares/mine', requireAuth, shareReadLimiter, async (req: ApiRequest, res: Response) => {
    try {
      const list = await sharesRepo.listByOwner(req.auth!.uid);
      res.json({ shares: list });
    } catch {
      res.status(500).json({ error: 'Could not load shares.' });
    }
  });

  app.get('/api/shares/:token', shareReadLimiter, async (req, res) => {
    const token = String(req.params.token || '').trim();
    if (!isValidShareTokenFormat(token)) {
      res.status(400).json({ error: 'Invalid share token format.' });
      return;
    }

    const rec = await sharesRepo.getByToken(token);
    if (!rec) {
      res.status(404).json({ error: 'Share link not found.' });
      return;
    }
    if (rec.revoked) {
      res.status(410).json({ error: 'This share link has been revoked by its owner.' });
      return;
    }
    if (rec.expiresAt <= Date.now()) {
      res.status(410).json({ error: 'This share link has expired.' });
      return;
    }
    if (rec.hasPassword) {
      res.status(401).json({
        error: 'Share password required.',
        requiresPassword: true,
        categoryName: rec.categoryName,
      });
      return;
    }

    res.json(toPublicSharePayload(rec));
  });

  app.post('/api/shares/:token/resolve', shareReadLimiter, async (req, res) => {
    const token = String(req.params.token || '').trim();
    if (!isValidShareTokenFormat(token)) {
      res.status(400).json({ error: 'Invalid share token format.' });
      return;
    }

    const rec = await sharesRepo.getByToken(token);
    if (!rec) {
      res.status(404).json({ error: 'Share link not found.' });
      return;
    }
    if (rec.revoked) {
      res.status(410).json({ error: 'This share link has been revoked by its owner.' });
      return;
    }
    if (rec.expiresAt <= Date.now()) {
      res.status(410).json({ error: 'This share link has expired.' });
      return;
    }

    if (rec.hasPassword) {
      const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!candidate || !verifySharePassword(candidate, rec.passwordHash)) {
        res.status(401).json({
          error: candidate ? 'Incorrect share password.' : 'Share password required.',
          requiresPassword: true,
          categoryName: rec.categoryName,
        });
        return;
      }
    }

    res.json(toPublicSharePayload(rec));
  });

  app.post(
    '/api/shares/:token/revoke',
    requireAuth,
    shareWriteLimiter,
    async (req: ApiRequest, res: Response) => {
      const token = String(req.params.token || '').trim();
      if (!isValidShareTokenFormat(token)) {
        res.status(400).json({ error: 'Invalid share token format.' });
        return;
      }

      const result = await sharesRepo.revoke(token, req.auth!.uid);
      if (result === 'not_found') {
        res.status(404).json({ error: 'Share link not found.' });
        return;
      }
      if (result === 'forbidden') {
        res.status(403).json({ error: 'Only the share creator can revoke this link.' });
        return;
      }
      res.json({ ok: true, revoked: true });
    }
  );

  // Centralized error handler — never expose internal stack traces
  app.use((err: unknown, _req: ApiRequest, res: Response, _next: NextFunction) => {
    const e = err as { type?: string; status?: number; message?: string };
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request payload exceeds maximum allowed size.' });
      return;
    }
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON request body.' });
      return;
    }
    res.status(e?.status && e.status >= 400 && e.status < 500 ? e.status : 500).json({
      error: 'Internal API request processing error.',
    });
  });

  return app;
}
