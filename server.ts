import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    description:
      'Modern React hooks, component architecture, and API reference documentation.',
    tags: ['react', 'frontend', 'docs'],
    category: 'code',
  },
  'tailwindcss.com': {
    title: 'Tailwind CSS Framework Documentation',
    description:
      'Utility-first CSS framework reference for building responsive modern interfaces.',
    tags: ['css', 'tailwind', 'design'],
    category: 'design',
  },
};

function buildSmartFallbackMetadata(
  rawUrl: string,
  availableCategorySlugs: string[] = []
): SmartMetadataResult {
  let normalized = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathSegments = parsed.pathname
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

async function fetchHtmlHeadSnippet(targetUrl: string): Promise<{
  pageTitle?: string;
  metaDescription?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2800);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LinkHubBot/1.0; +https://linkhub.cloud)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return {};
    const html = (await res.text()).slice(0, 24000);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch =
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
      );
    return {
      pageTitle: titleMatch?.[1]?.replace(/\s+/g, ' ').trim(),
      metaDescription: descMatch?.[1]?.replace(/\s+/g, ' ').trim(),
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // AI Link Metadata Generation Endpoint
  app.post('/api/ai/link-metadata', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const categories: Array<{ slug: string; name: string }> = Array.isArray(req.body?.categories)
      ? req.body.categories
      : [];
    const categorySlugs = categories.map((c) => c.slug).filter(Boolean);

    if (!rawUrl) {
      res.status(400).json({ error: 'Please provide a URL first.' });
      return;
    }

    let normalizedUrl = rawUrl;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const fallback = buildSmartFallbackMetadata(normalizedUrl, categorySlugs);
    const scraped = await fetchHtmlHeadSnippet(normalizedUrl);

    if (scraped.pageTitle && scraped.pageTitle.length > 2) {
      fallback.title = scraped.pageTitle.slice(0, 95);
    }
    if (scraped.metaDescription && scraped.metaDescription.length > 8) {
      fallback.description = scraped.metaDescription.slice(0, 220);
    }

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
            ? categories.map((c) => `${c.slug} (${c.name})`).join(', ')
            : 'information,ai,design,code,social';

        const prompt = `Generate a concise, professional bookmark title, a clear 1-2 sentence description (max 180 characters), 2 to 3 lowercase single-word tags, and pick the best matching category slug from [${categoryListText}] for this URL:
URL: ${normalizedUrl}
${scraped.pageTitle ? `Detected Page Title: ${scraped.pageTitle}` : ''}
${scraped.metaDescription ? `Detected Meta Description: ${scraped.metaDescription}` : ''}`;

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
                  description: 'Concise 1-2 sentence summary of what this link is for (max 180 chars)',
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
  });

  // SSRF-Hardened Zero-History Stealth Reader Endpoint
  const isBlockedHost = (hostname: string): boolean => {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      !h ||
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h === '::1' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      h.startsWith('fe80:') ||
      h.startsWith('fc') ||
      h.startsWith('fd')
    ) {
      return true;
    }
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) {
        return true;
      }
    }
    return false;
  };

  const decodeEntities = (text: string): string =>
    text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  app.post('/api/stealth/reader', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Missing URL.' });
      return;
    }
    let target: URL;
    try {
      target = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      if (!['http:', 'https:'].includes(target.protocol) || isBlockedHost(target.hostname)) {
        res.status(400).json({ error: 'Only public HTTP/HTTPS links are supported in Stealth Reader.' });
        return;
      }
    } catch {
      res.status(400).json({ error: 'Invalid URL format.' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const upstream = await fetch(target.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; LinkHubStealth/1.0; +https://linkhub.cloud)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
      });
      if (!upstream.ok) {
        res.json({
          ok: false,
          domain: target.hostname.replace(/^www\./i, ''),
          reason: `Site returned status ${upstream.status} to automated reader requests.`,
          paragraphs: [],
        });
        return;
      }

      const finalUrl = new URL(upstream.url || target.toString());
      if (isBlockedHost(finalUrl.hostname)) {
        res.status(403).json({ error: 'Redirect target is not permitted.' });
        return;
      }

      const rawHtml = (await upstream.text()).slice(0, 180000);
      const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? decodeEntities(titleMatch[1]).slice(0, 140) : finalUrl.hostname;

      const descMatch =
        rawHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
        rawHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
      const summary = descMatch ? decodeEntities(descMatch[1]).slice(0, 260) : '';

      const cleanedHtml = rawHtml
        .replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
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
        domain: finalUrl.hostname.replace(/^www\./i, ''),
        title,
        summary,
        paragraphs: blocks,
      });
    } catch {
      res.json({
        ok: false,
        domain: target.hostname.replace(/^www\./i, ''),
        reason: 'This site requires an interactive browser session or blocked automated previews.',
        paragraphs: [],
      });
    } finally {
      clearTimeout(timer);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LINKHUB Server running on http://localhost:${PORT}`);
  });
}

startServer();
