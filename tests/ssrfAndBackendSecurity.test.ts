import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  isBlockedIpAddress,
  safeFetchExternalText,
  SsrfValidationError,
  validateExternalUrl,
} from '../server/ssrf.ts';
import { createApiApp } from '../server/app.ts';
import { InMemorySharesRepository } from '../server/sharesStore.ts';
import { parseServiceAccountConfig, type FirebaseTokenVerifier } from '../server/security.ts';

async function startTestServer(options: Parameters<typeof createApiApp>[0] = {}) {
  const app = createApiApp(options);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

const mockTokenVerifier: FirebaseTokenVerifier = async (token: string) => {
  if (token === 'valid-alice') {
    return { uid: 'alice_uid_1', email: 'alice@example.com', emailVerified: true };
  }
  if (token === 'valid-bob') {
    return { uid: 'bob_uid_2', email: 'bob@example.com', emailVerified: true };
  }
  if (token === 'unverified-carol') {
    const err = new Error('Verified email required');
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
  throw new Error('Invalid token');
};

test('SSRF URL & IP validators block loopback, RFC1918, cloud metadata, obfuscated IPs, embedded creds, and non-HTTP schemes', () => {
  const blockedAddresses = [
    '127.0.0.1',
    '127.0.1.1',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.100',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456:789a::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::10.0.0.1',
  ];

  for (const ip of blockedAddresses) {
    assert.equal(isBlockedIpAddress(ip), true, `Expected ${ip} to be blocked`);
  }

  assert.equal(isBlockedIpAddress('93.184.216.34'), false);
  assert.equal(isBlockedIpAddress('2606:4700:4700::1111'), false);

  const blockedUrls = [
    'http://localhost/admin',
    'http://127.0.0.1:8080/health',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://10.20.30.40/',
    'http://192.168.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://0177.0.0.1/',
    'http://127.1/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://admin:secret@example.com/',
    'https://example.com:6379/',
  ];

  for (const target of blockedUrls) {
    assert.throws(
      () => validateExternalUrl(target),
      SsrfValidationError,
      `Expected URL ${target} to throw SsrfValidationError`
    );
  }

  const okUrl = validateExternalUrl('https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto');
  assert.equal(okUrl.hostname, 'developer.mozilla.org');
});

test('safeFetchExternalText defeats DNS rebinding and malicious HTTP redirects to private/metadata IPs', async () => {
  // 1. DNS resolves public hostname to loopback (DNS rebinding)
  await assert.rejects(
    () =>
      safeFetchExternalText('https://rebind.attacker.example/secret', {
        lookupFn: async () => [{ address: '127.0.0.1', family: 4 }],
        fetchImpl: async () => {
          throw new Error('fetch should never be called on blocked DNS result');
        },
      }),
    (err: unknown) => err instanceof SsrfValidationError && err.statusCode === 403
  );

  // 2. Public endpoint returns 302 redirect pointing to AWS IMDS 169.254.169.254
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      safeFetchExternalText('https://public-redirector.example/go', {
        lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response(null, {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data/iam/' },
          });
        },
      }),
    (err: unknown) => err instanceof SsrfValidationError && err.statusCode === 403
  );
  assert.equal(fetchCalls, 1);

  // 3. Safe public fetch enforces maxBytes truncation cleanly
  const largeHtml = '<html><head><title>Safe Page</title></head><body>' + 'A'.repeat(2000) + '</body></html>';
  const safeRes = await safeFetchExternalText('https://safe.example.com/article', {
    maxBytes: 256,
    lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () =>
      new Response(largeHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  });
  assert.equal(safeRes.ok, true);
  assert.equal(safeRes.bodyText.length <= 256, true);
});

test('Express API enforces authentication, verified emails, CORS, security headers, rate limits, and SSRF checks', async () => {
  const srv = await startTestServer({
    tokenVerifier: mockTokenVerifier,
    sharesRepo: new InMemorySharesRepository(),
    allowedOrigins: new Set(['https://linkhub-v1.netlify.app', 'http://localhost:3000']),
    aiRateLimitMax: 2,
    readerRateLimitMax: 2,
    lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () =>
      new Response(
        '<html><head><title>Example Docs</title><meta name="description" content="Helpful documentation page"></head><body><p>Structured content paragraph with enough length to pass reader extraction checks.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      ),
  });

  try {
    // Health check + security headers
    const healthRes = await fetch(`${srv.baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');
    assert.equal(healthRes.headers.get('access-control-allow-origin'), 'http://localhost:3000');

    // Disallowed CORS origin rejected with 403
    const badCors = await fetch(`${srv.baseUrl}/api/health`, {
      headers: { Origin: 'https://evil-phish.example' },
    });
    assert.equal(badCors.status, 403);

    // Unauthenticated API access blocked with 401
    const unauthAi = await fetch(`${srv.baseUrl}/api/ai/link-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    assert.equal(unauthAi.status, 401);

    const unauthReader = await fetch(`${srv.baseUrl}/api/stealth/reader`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    assert.equal(unauthReader.status, 401);

    // Unverified email user blocked with 403
    const unverifiedRes = await fetch(`${srv.baseUrl}/api/ai/link-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer unverified-carol',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    assert.equal(unverifiedRes.status, 403);

    // Authenticated SSRF attempt blocked with 403
    const ssrfRes = await fetch(`${srv.baseUrl}/api/stealth/reader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-alice',
      },
      body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' }),
    });
    assert.equal(ssrfRes.status, 403);

    // Authenticated valid stealth reader succeeds (rate-limit budget: 2)
    const okReader1 = await fetch(`${srv.baseUrl}/api/stealth/reader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-alice',
      },
      body: JSON.stringify({ url: 'https://docs.example.com/guide' }),
    });
    assert.equal(okReader1.status, 200);
    const readerJson = (await okReader1.json()) as { ok: boolean; title: string };
    assert.equal(readerJson.ok, true);
    assert.equal(readerJson.title, 'Example Docs');

    // 3rd call (including blocked/valid calls against readerLimiter) hits 429 Too Many Requests
    const rateLimited = await fetch(`${srv.baseUrl}/api/stealth/reader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-alice',
      },
      body: JSON.stringify({ url: 'https://docs.example.com/guide' }),
    });
    assert.equal(rateLimited.status, 429);
    assert.ok(rateLimited.headers.get('retry-after'));
  } finally {
    await srv.close();
  }
});

test('Server-backed Category Shares enforce high-entropy tokens, password protection, owner-only revocation, and encrypted-placeholder stripping', async () => {
  const srv = await startTestServer({
    tokenVerifier: mockTokenVerifier,
    sharesRepo: new InMemorySharesRepository(),
  });

  try {
    // 1. Creating share with ONLY encrypted placeholder URLs is rejected
    const badShareRes = await fetch(`${srv.baseUrl}/api/shares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-alice',
      },
      body: JSON.stringify({
        categoryName: 'Private Docs',
        categorySlug: 'private-docs',
        links: [
          {
            title: 'ENC2:secret',
            url: 'https://encrypted.linkhub.vault/ENC2:secret',
          },
        ],
      }),
    });
    assert.equal(badShareRes.status, 400);

    // 2. Alice creates password-protected share with valid HTTPS links
    const createRes = await fetch(`${srv.baseUrl}/api/shares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-alice',
      },
      body: JSON.stringify({
        categoryName: 'Architecture Refs',
        categorySlug: 'arch-refs',
        ttlHours: 24,
        password: 'CorrectHorseBattery99',
        links: [
          {
            title: 'OWASP Top 10',
            url: 'https://owasp.org/www-project-top-ten/',
            tags: ['security', 'owasp'],
          },
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as {
      shareToken: string;
      hasPassword: boolean;
      readOnly: boolean;
    };
    assert.ok(created.shareToken.startsWith('lh2_'));
    assert.ok(created.shareToken.length >= 30);
    assert.equal(created.hasPassword, true);
    assert.equal(created.readOnly, true);

    // 3. Unauthenticated GET or wrong password resolve returns 401 requiresPassword
    const lockedGet = await fetch(`${srv.baseUrl}/api/shares/${created.shareToken}`);
    assert.equal(lockedGet.status, 401);

    const wrongPw = await fetch(`${srv.baseUrl}/api/shares/${created.shareToken}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'WrongPassword!' }),
    });
    assert.equal(wrongPw.status, 401);

    // 4. Correct password returns sanitized read-only share bundle
    const okResolve = await fetch(`${srv.baseUrl}/api/shares/${created.shareToken}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'CorrectHorseBattery99' }),
    });
    assert.equal(okResolve.status, 200);
    const resolved = (await okResolve.json()) as {
      categoryName: string;
      links: Array<{ title: string; url: string }>;
    };
    assert.equal(resolved.categoryName, 'Architecture Refs');
    assert.equal(resolved.links.length, 1);
    assert.equal(resolved.links[0].url, 'https://owasp.org/www-project-top-ten/');

    // 5. Bob cannot revoke Alice's share (403 Forbidden)
    const bobRevoke = await fetch(`${srv.baseUrl}/api/shares/${created.shareToken}/revoke`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-bob' },
    });
    assert.equal(bobRevoke.status, 403);

    // 6. Alice revokes her share (200 OK), and subsequent resolution fails with 410 Gone
    const aliceRevoke = await fetch(`${srv.baseUrl}/api/shares/${created.shareToken}/revoke`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-alice' },
    });
    assert.equal(aliceRevoke.status, 200);

    const afterRevoke = await fetch(`${srv.baseUrl}/api/shares/${created.shareToken}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'CorrectHorseBattery99' }),
    });
    assert.equal(afterRevoke.status, 410);
  } finally {
    await srv.close();
  }
});

test('parseServiceAccountConfig handles raw/quoted/base64 JSON cleanly and skips malformed or PEM-only values without throwing', () => {
  assert.equal(parseServiceAccountConfig(''), null);
  assert.equal(parseServiceAccountConfig('--'), null);
  assert.equal(parseServiceAccountConfig('-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----'), null);
  assert.equal(parseServiceAccountConfig('not-json-at-all'), null);

  const validObj = {
    project_id: 'gen-lang-client-0297873222',
    client_email: 'firebase-adminsdk@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----\\n',
  };
  const validStr = JSON.stringify(validObj);

  const parsedRaw = parseServiceAccountConfig(validStr);
  assert.equal(parsedRaw?.clientEmail, validObj.client_email);
  assert.equal(parsedRaw?.privateKey?.includes('\nTEST_KEY\n'), true);

  const parsedQuoted = parseServiceAccountConfig(`'${validStr}'`);
  assert.equal(parsedQuoted?.clientEmail, validObj.client_email);

  const parsedB64 = parseServiceAccountConfig(Buffer.from(validStr, 'utf8').toString('base64'));
  assert.equal(parsedB64?.clientEmail, validObj.client_email);
});

test('CORS permits exact same-origin forwarded host requests while still rejecting cross-origin attackers', async () => {
  const srv = await startTestServer({
    tokenVerifier: mockTokenVerifier,
    sharesRepo: new InMemorySharesRepository(),
    allowedOrigins: new Set(['https://linkhub-v1.netlify.app']),
  });

  try {
    const sameOriginRes = await fetch(`${srv.baseUrl}/api/health`, {
      headers: {
        Origin: 'https://ais-dev-example.asia-southeast1.run.app',
        'X-Forwarded-Host': 'ais-dev-example.asia-southeast1.run.app',
      },
    });
    assert.equal(sameOriginRes.status, 200);
    assert.equal(
      sameOriginRes.headers.get('access-control-allow-origin'),
      'https://ais-dev-example.asia-southeast1.run.app'
    );

    const evilOriginRes = await fetch(`${srv.baseUrl}/api/health`, {
      headers: {
        Origin: 'https://attacker.example',
        'X-Forwarded-Host': 'ais-dev-example.asia-southeast1.run.app',
      },
    });
    assert.equal(evilOriginRes.status, 403);
  } finally {
    await srv.close();
  }
});

test('POST /api/auth/cleanup-unverified validates emails and safely delegates unverified cleanup', async () => {
  const cleanedEmails: string[] = [];
  const srv = await startTestServer({
    tokenVerifier: mockTokenVerifier,
    sharesRepo: new InMemorySharesRepository(),
    cleanupUnverifiedAuthUser: async (email) => {
      if (email === 'unverified@example.com') {
        cleanedEmails.push(email);
        return { cleaned: true, adminConfigured: true };
      }
      return { cleaned: false, adminConfigured: true };
    },
  });

  try {
    const invalidRes = await fetch(`${srv.baseUrl}/api/auth/cleanup-unverified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(invalidRes.status, 400);

    const unverifiedRes = await fetch(`${srv.baseUrl}/api/auth/cleanup-unverified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '  Unverified@Example.com  ' }),
    });
    assert.equal(unverifiedRes.status, 200);
    assert.deepEqual(await unverifiedRes.json(), {
      ok: true,
      cleaned: true,
      adminConfigured: true,
    });
    assert.deepEqual(cleanedEmails, ['unverified@example.com']);

    const verifiedRes = await fetch(`${srv.baseUrl}/api/auth/cleanup-unverified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'verified@example.com' }),
    });
    assert.equal(verifiedRes.status, 200);
    assert.deepEqual(await verifiedRes.json(), {
      ok: true,
      cleaned: false,
      adminConfigured: true,
    });
  } finally {
    await srv.close();
  }
});

