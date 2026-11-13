/**
 * Backend API Security Middleware & Firebase Token / App Check Verifier (LinkHub v2.0.0)
 */

import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App as FirebaseAdminApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';

export interface AuthenticatedPrincipal {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

export interface ApiRequest extends Request {
  auth?: AuthenticatedPrincipal;
}

export type FirebaseTokenVerifier = (idToken: string) => Promise<AuthenticatedPrincipal>;

function readProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID?.trim()) {
    return process.env.FIREBASE_PROJECT_ID.trim();
  }
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string };
    if (parsed.projectId) return parsed.projectId;
  } catch {
    // Fallback below
  }
  return 'gen-lang-client-0297873222';
}

export const FIREBASE_PROJECT_ID = readProjectId();

let adminAppInitialized: FirebaseAdminApp | null = null;
let adminAttempted = false;

function parseServiceAccountConfig(rawValue: string): ServiceAccount | null {
  let candidate = (rawValue || '').trim();
  if (!candidate || candidate === '-' || candidate === '--') {
    return null;
  }

  // Unwrap matching outer quotes if set by a secrets UI
  if (
    (candidate.startsWith('"') && candidate.endsWith('"')) ||
    (candidate.startsWith("'") && candidate.endsWith("'"))
  ) {
    candidate = candidate.slice(1, -1).trim();
  }

  let jsonText: string | null = null;
  if (candidate.startsWith('{')) {
    jsonText = candidate;
  } else if (/^[A-Za-z0-9+/=_-]+$/.test(candidate) && candidate.length >= 32) {
    // Support Base64-encoded service account JSON strings
    try {
      const decoded = Buffer.from(candidate, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) {
        jsonText = decoded;
      }
    } catch {
      return null;
    }
  }

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const clientEmail =
      typeof parsed.client_email === 'string'
        ? parsed.client_email
        : typeof parsed.clientEmail === 'string'
          ? parsed.clientEmail
          : '';
    const privateKeyRaw =
      typeof parsed.private_key === 'string'
        ? parsed.private_key
        : typeof parsed.privateKey === 'string'
          ? parsed.privateKey
          : '';

    if (!clientEmail || !privateKeyRaw) {
      return null;
    }

    const privateKey = privateKeyRaw.includes('\\n')
      ? privateKeyRaw.replace(/\\n/g, '\n')
      : privateKeyRaw;

    return {
      ...(parsed as ServiceAccount),
      projectId:
        (typeof parsed.project_id === 'string' && parsed.project_id) ||
        (typeof parsed.projectId === 'string' && parsed.projectId) ||
        FIREBASE_PROJECT_ID,
      clientEmail,
      privateKey,
    };
  } catch {
    return null;
  }
}

export function getFirebaseAdminApp(): FirebaseAdminApp | null {
  if (adminAttempted) return adminAppInitialized;
  adminAttempted = true;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminAppInitialized = existingApps[0] || null;
    return adminAppInitialized;
  }

  const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceJson) {
    const cred = parseServiceAccountConfig(serviceJson);
    if (cred) {
      try {
        adminAppInitialized = initializeApp({
          credential: cert(cred),
          projectId: FIREBASE_PROJECT_ID,
        });
        return adminAppInitialized;
      } catch {
        // Fall through to GOOGLE_APPLICATION_CREDENTIALS or JWKS fallback
      }
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    try {
      adminAppInitialized = initializeApp({
        credential: applicationDefault(),
        projectId: FIREBASE_PROJECT_ID,
      });
      return adminAppInitialized;
    } catch {
      // Fall through to JWKS verifier
    }
  }

  return null;
}

export interface UnverifiedCleanupResult {
  cleaned: boolean;
  adminConfigured: boolean;
}

/**
 * Deletes an unverified, password-only Firebase Auth user so re-registration
 * is never blocked by stale unverified signups. Never touches verified or OAuth users.
 */
export async function cleanupUnverifiedPasswordUserByEmail(
  rawEmail: string
): Promise<UnverifiedCleanupResult> {
  const email = (rawEmail || '').trim().toLowerCase();
  if (!email) {
    return { cleaned: false, adminConfigured: false };
  }

  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return { cleaned: false, adminConfigured: false };
  }

  try {
    const authAdmin = getAuth(adminApp);
    const userRecord = await authAdmin.getUserByEmail(email);
    const isPasswordOnly =
      Array.isArray(userRecord.providerData) &&
      userRecord.providerData.length > 0 &&
      userRecord.providerData.every((p) => p.providerId === 'password');

    if (userRecord.emailVerified === false && isPasswordOnly) {
      await authAdmin.deleteUser(userRecord.uid);
      return { cleaned: true, adminConfigured: true };
    }
    return { cleaned: false, adminConfigured: true };
  } catch {
    return { cleaned: false, adminConfigured: true };
  }
}

export { parseServiceAccountConfig };

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/**
 * Cryptographically verifies Firebase ID tokens using either firebase-admin or Google's official JWKS.
 */
export const verifyFirebaseIdToken: FirebaseTokenVerifier = async (idToken: string) => {
  const trimmed = (idToken || '').trim();
  if (!trimmed || trimmed.length > 8192) {
    throw new Error('Malformed token');
  }

  const adminApp = getFirebaseAdminApp();
  if (adminApp) {
    const decoded = await getAuth(adminApp).verifyIdToken(trimmed, true);
    if (!decoded.uid || decoded.email_verified !== true) {
      const err = new Error('Verified email required');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: true,
    };
  }

  // Fallback: cryptographic RS256 signature verification via Firebase Auth public JWKS
  const { payload } = await jwtVerify(trimmed, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
    algorithms: ['RS256'],
  });

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;
  if (!sub || sub.length > 128 || authTime <= 0 || authTime > Math.floor(Date.now() / 1000) + 60) {
    throw new Error('Invalid Firebase token claims');
  }

  if (payload.email_verified !== true) {
    const err = new Error('Verified email required');
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }

  return {
    uid: sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: true,
  };
};

export function createAuthMiddleware(verifier: FirebaseTokenVerifier = verifyFirebaseIdToken) {
  return async (req: ApiRequest, res: Response, next: NextFunction) => {
    const authHeader = req.header('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const principal = await verifier(match[1]);
      req.auth = principal;
      next();
    } catch (err) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 403) {
        res.status(403).json({ error: 'Email verification is required to access this API.' });
        return;
      }
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };
}

export function createAppCheckMiddleware(options?: { enforce?: boolean }) {
  const enforce =
    options?.enforce ?? String(process.env.APPCHECK_ENFORCE || '').toLowerCase() === 'true';

  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('x-firebase-appcheck')?.trim();
    const adminApp = getFirebaseAdminApp();

    if (!token) {
      if (enforce) {
        res.status(401).json({ error: 'App Check token required.' });
        return;
      }
      next();
      return;
    }

    if (adminApp) {
      try {
        await getAppCheck(adminApp).verifyToken(token);
      } catch {
        if (enforce) {
          res.status(401).json({ error: 'Invalid App Check token.' });
          return;
        }
      }
    }
    next();
  };
}

export function getAllowedOrigins(): Set<string> {
  const defaults = [
    'https://linkhub-v1.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  const appUrlRaw = process.env.APP_URL?.trim();
  if (appUrlRaw) {
    try {
      defaults.push(new URL(appUrlRaw).origin);
    } catch {
      // Ignore invalid APP_URL
    }
  }
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return new Set([...defaults, ...configured]);
}

function isSameOriginHost(req: Request, origin: string): boolean {
  const rawHost = (req.header('x-forwarded-host') || req.header('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!rawHost) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host.toLowerCase() === rawHost;
  } catch {
    return false;
  }
}

export function createCorsMiddleware(allowedOrigins: Set<string> = getAllowedOrigins()) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin')?.trim().replace(/\/+$/, '');
    res.setHeader('Vary', 'Origin');

    if (origin) {
      const permitted = allowedOrigins.has(origin) || isSameOriginHost(req, origin);
      if (!permitted) {
        if (req.path.startsWith('/api/')) {
          res.status(403).json({ error: 'Origin not permitted by CORS policy.' });
          return;
        }
      } else {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Firebase-AppCheck'
        );
        res.setHeader('Access-Control-Max-Age', '600');
      }
    }

    if (req.method === 'OPTIONS' && req.path.startsWith('/api/')) {
      res.status(204).end();
      return;
    }

    next();
  };
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  keyFn?: (req: ApiRequest) => string;
}

export function createSlidingWindowRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = 'rl', keyFn } = options;
  const buckets = new Map<string, number[]>();

  return (req: ApiRequest, res: Response, next: NextFunction) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const identity = keyFn
      ? keyFn(req)
      : req.auth?.uid
        ? `uid:${req.auth.uid}`
        : `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const key = `${keyPrefix}:${identity}`;

    const timestamps = (buckets.get(key) || []).filter((ts) => ts > cutoff);
    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    timestamps.push(now);
    buckets.set(key, timestamps);

    // Opportunistic bounded cleanup to prevent unbounded heap growth
    if (buckets.size > 5000) {
      for (const [bKey, bVals] of buckets.entries()) {
        if (bVals.every((ts) => ts <= cutoff)) {
          buckets.delete(bKey);
        }
      }
    }

    next();
  };
}
