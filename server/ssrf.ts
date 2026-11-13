/**
 * Comprehensive SSRF Protection Engine (LinkHub v2.0.0)
 *
 * Mitigates Server-Side Request Forgery across metadata scraping & Stealth Reader:
 * - Enforces HTTP/HTTPS schemes only and restricts ports to standard web ports (80/443).
 * - Rejects embedded URL credentials (`user:pass@host`).
 * - Rejects obfuscated IP notations (decimal, octal, hex, short IPv4, bracketed quirks).
 * - Blocks all IPv4 loopback, private RFC1918, CGNAT, link-local / cloud metadata (169.254.169.254),
 *   multicast, and reserved ranges.
 * - Blocks IPv6 loopback (::1), unspecified (::), link-local (fe80::/10), unique-local (fc00::/7),
 *   IPv4-mapped (::ffff:127.0.0.1, ::ffff:7f00:1), multicast, and documentation prefixes.
 * - Performs DNS resolution before connecting (`dns.lookup(..., { all: true })`) and validates every IP.
 * - Follows HTTP redirects manually (`redirect: 'manual'`) and re-validates every hop.
 * - Enforces tight request timeouts and streaming response size caps.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export class SsrfValidationError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SsrfValidationError';
    this.statusCode = statusCode;
  }
}

export type DnsLookupFn = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.arpa', '.home.arpa'];

function parseIpv4Bytes(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return [nums[0], nums[1], nums[2], nums[3]];
}

function isBlockedIpv4Bytes([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0) return true; // 0.0.0.0/8 ("This network")
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT RFC6598
  if (a === 127) return true; // 127.0.0.0/8 Loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 6to4 relay
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 Benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reserved/Broadcast
  return false;
}

function expandIpv6Hextets(ip: string): number[] | null {
  const clean = ip.split('%')[0].toLowerCase();
  // Convert trailing embedded IPv4 (e.g. ::ffff:127.0.0.1) into two hextets
  let working = clean;
  const lastColon = clean.lastIndexOf(':');
  if (lastColon !== -1 && clean.slice(lastColon + 1).includes('.')) {
    const v4 = parseIpv4Bytes(clean.slice(lastColon + 1));
    if (!v4) return null;
    const h1 = ((v4[0] << 8) | v4[1]).toString(16);
    const h2 = ((v4[2] << 8) | v4[3]).toString(16);
    working = `${clean.slice(0, lastColon)}:${h1}:${h2}`;
  }

  const sides = working.split('::');
  if (sides.length > 2) return null;

  const parseGroup = (seg: string): number[] | null => {
    if (!seg) return [];
    const parts = seg.split(':');
    const out: number[] = [];
    for (const p of parts) {
      if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
      out.push(parseInt(p, 16));
    }
    return out;
  };

  const left = parseGroup(sides[0]);
  if (!left) return null;
  if (sides.length === 1) {
    return left.length === 8 ? left : null;
  }
  const right = parseGroup(sides[1]);
  if (!right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

export function isBlockedIpAddress(rawIp: string): boolean {
  const cleaned = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const ipVersion = net.isIP(cleaned);
  if (ipVersion === 0) return true;

  if (ipVersion === 4) {
    const bytes = parseIpv4Bytes(cleaned);
    return !bytes || isBlockedIpv4Bytes(bytes);
  }

  const hextets = expandIpv6Hextets(cleaned);
  if (!hextets) return true;

  const allZeroExceptLast = hextets.slice(0, 7).every((h) => h === 0);
  if (allZeroExceptLast && (hextets[7] === 0 || hextets[7] === 1)) {
    return true; // :: (unspecified) or ::1 (loopback)
  }

  // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96 or 64:ff9b::/96 (NAT64)
  const isV4Mapped =
    hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff;
  const isV4Compatible =
    hextets.slice(0, 6).every((h) => h === 0) && (hextets[6] !== 0 || hextets[7] > 1);
  const isNat64 =
    hextets[0] === 0x0064 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((h) => h === 0);

  if (isV4Mapped || isV4Compatible || isNat64) {
    const v4: [number, number, number, number] = [
      (hextets[6] >> 8) & 0xff,
      hextets[6] & 0xff,
      (hextets[7] >> 8) & 0xff,
      hextets[7] & 0xff,
    ];
    return isBlockedIpv4Bytes(v4);
  }

  const first = hextets[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 Unique Local (ULA)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 Link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 Deprecated site-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 Multicast
  if (first === 0x2001 && hextets[1] === 0x0db8) return true; // 2001:db8::/32 Documentation
  if (first === 0x2002) {
    // 6to4 embeds IPv4 in hextets 1..2
    const v4: [number, number, number, number] = [
      (hextets[1] >> 8) & 0xff,
      hextets[1] & 0xff,
      (hextets[2] >> 8) & 0xff,
      hextets[2] & 0xff,
    ];
    if (isBlockedIpv4Bytes(v4)) return true;
  }

  return false;
}

function isObfuscatedNumericHost(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (/^\d+$/.test(bare)) return true; // decimal integer IP e.g. 2130706433
  if (/^0x[0-9a-f]+$/i.test(bare)) return true; // hex IP e.g. 0x7f000001
  // Octal/hex dotted quad e.g. 0177.0.0.1 or 0x7f.1
  const parts = bare.split('.');
  if (parts.length >= 2 && parts.length <= 4 && parts.every((p) => /^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(p))) {
    // Only allow strict canonical decimal IPv4 if every octet passes net.isIP === 4 later
    if (parts.some((p) => p.startsWith('0x') || p.startsWith('0X') || (p.length > 1 && p.startsWith('0')))) {
      return true;
    }
    if (parts.length < 4) return true; // shorthand 127.1
  }
  return false;
}

/**
 * Validates URL syntax, scheme, port, credentials, hostname rules, and literal IP safety.
 */
export function validateExternalUrl(rawUrl: string): URL {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new SsrfValidationError('Invalid or overly long URL.', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SsrfValidationError('Invalid URL format.', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfValidationError('Only HTTP and HTTPS protocols are permitted.', 400);
  }

  if (parsed.username || parsed.password) {
    throw new SsrfValidationError('Embedded credentials in URLs are not allowed.', 400);
  }

  if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
    throw new SsrfValidationError('Non-standard network ports are blocked.', 400);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host || host.length > 253) {
    throw new SsrfValidationError('Invalid hostname.', 400);
  }

  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SsrfValidationError('Private or local network hostnames are blocked.', 403);
  }

  if (isObfuscatedNumericHost(host)) {
    throw new SsrfValidationError('Obfuscated numeric host addresses are blocked.', 403);
  }

  if (net.isIP(host) !== 0 && isBlockedIpAddress(host)) {
    throw new SsrfValidationError('Private or reserved IP targets are blocked.', 403);
  }

  return parsed;
}

export async function resolveAndValidateHostname(
  hostname: string,
  lookupFn: DnsLookupFn = dns.lookup
): Promise<Array<{ address: string; family: number }>> {
  const bareHost = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (net.isIP(bareHost) !== 0) {
    if (isBlockedIpAddress(bareHost)) {
      throw new SsrfValidationError('Private or reserved IP targets are blocked.', 403);
    }
    return [{ address: bareHost, family: net.isIP(bareHost) }];
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookupFn(bareHost, { all: true, verbatim: true });
  } catch {
    throw new SsrfValidationError('Could not resolve target hostname safely.', 400);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new SsrfValidationError('Target hostname resolved to no network addresses.', 400);
  }

  for (const rec of records) {
    if (!rec?.address || isBlockedIpAddress(rec.address)) {
      throw new SsrfValidationError(
        'Target hostname resolved to a blocked private or internal IP address.',
        403
      );
    }
  }

  return records;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
  userAgent?: string;
  lookupFn?: DnsLookupFn;
  fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  bodyText: string;
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const txt = await response.text();
    return txt.slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > maxBytes) {
        const remaining = Math.max(0, maxBytes - total);
        if (remaining > 0) {
          chunks.push(value.subarray(0, remaining));
          total += remaining;
        }
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(combined);
}

/**
 * Performs a DNS-checked, redirect-validated, size-capped, timeout-bounded HTTP GET fetch.
 */
export async function safeFetchExternalText(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const {
    timeoutMs = 4000,
    maxBytes = 200_000,
    maxRedirects = 3,
    accept = 'text/html,application/xhtml+xml,text/plain',
    userAgent = 'Mozilla/5.0 (compatible; LinkHubBot/2.0; +https://linkhub.cloud)',
    lookupFn = dns.lookup,
    fetchImpl = fetch,
  } = options;

  let currentUrl = validateExternalUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await resolveAndValidateHostname(currentUrl.hostname, lookupFn);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: accept,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new SsrfValidationError('Upstream returned an incomplete redirect.', 400);
      }
      if (hop === maxRedirects) {
        throw new SsrfValidationError('Too many HTTP redirects.', 400);
      }
      const nextRaw = new URL(location, currentUrl).toString();
      currentUrl = validateExternalUrl(nextRaw);
      continue;
    }

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await readResponseWithLimit(response, maxBytes);

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: currentUrl.toString(),
      contentType,
      bodyText,
    };
  }

  throw new SsrfValidationError('Too many HTTP redirects.', 400);
}
