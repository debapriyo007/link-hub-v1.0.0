# LinkHub Security Audit Report & v2.0.0 Architecture (`SECURITY.md`)

This document captures the full repository security audit performed against **LinkHub v1.0.0** (`9c8d5e79e8e1ef41b5c8e0d8c1806cc9e1ba7d93`) prior to implementation, along with the production security controls implemented in **LinkHub v2.0.0 — Security Edition**.

---

## Part 1: v1.0.0 Repository Security Audit Report

### Critical Severity Findings

1. **[CRIT-01] Insecure Custom Cryptography in Private Vault (`src/utils/privateVaultCrypto.ts` v1)**
   - **Finding**: v1.0.0 relied on a custom stream cipher built from FNV-1a constants + xorshift PRNG, deterministic key derivation seeded from `userId` and `categorySlug`, XOR ciphertext, and `Math.random()` for salt generation.
   - **Impact**: Known-plaintext / stream-reuse attacks can trivially recover keys and plaintext URLs across encrypted entries; salts lacked CSPRNG entropy.
   - **v2.0.0 Remediation**: Replaced with Web Crypto **AES-256-GCM** using random 256-bit DEKs per private category, unique random 96-bit nonces via `crypto.getRandomValues()`, AAD binding (`userId`, `categorySlug`, `linkId`, `fieldName`), and **PBKDF2-HMAC-SHA256 (210,000 iterations)** key wrapping. Legacy decoders were isolated in read-only `src/utils/legacyV1Crypto.ts` for seamless v1 -> v2 migration.

2. **[CRIT-02] Server-Side Request Forgery (SSRF) on Metadata & Stealth Reader Endpoints (`server.ts` v1)**
   - **Finding**: `/api/ai/link-metadata` and `/api/stealth/reader` fetched arbitrary user-supplied URLs via unauthenticated `fetch()` without IP range filtering, DNS resolution inspection, redirect validation, or port restrictions.
   - **Impact**: Attackers could pivot through the server to probe internal VPC services, loopback ports, or cloud instance metadata (`169.254.169.254`, `metadata.google.internal`).
   - **v2.0.0 Remediation**: Implemented `server/ssrf.ts` enforcing HTTP/HTTPS + ports `80`/`443`, blocking embedded credentials and obfuscated numeric IPs, resolving DNS before requests (`dns.lookup(..., { all: true })`) against all private/reserved IPv4/IPv6 ranges, and following HTTP redirects manually with hop-by-hop re-validation.

3. **[CRIT-03] Unauthenticated Backend Endpoints (`server.ts` v1)**
   - **Finding**: All `/api/*` routes accepted unauthenticated anonymous HTTP requests with wildcard CORS and zero rate limiting.
   - **Impact**: Anyone on the internet could abuse the server's `GEMINI_API_KEY` quota or use the server as an open proxy/scraper.
   - **v2.0.0 Remediation**: Added mandatory Firebase ID Token + verified-email authentication (`server/security.ts`), App Check verification hooks, strict origin CORS allowlists, `64kb` body caps, and per-UID/IP sliding-window rate limiters.

### High Severity Findings

4. **[HIGH-01] Plaintext Vault PIN & Recovery Secret Storage + Weak PIN Lockout Bypass (`src/App.tsx`, `LockedScreen.tsx`)**
   - **Finding**: User vault lock PINs (`pin`) were stored in plaintext in Firestore `/users/{uid}`, and `LockedScreen` offered recovery via email comparison or an unauthenticated one-click PIN removal flow.
   - **Impact**: Anyone with temporary session/DB visibility saw the raw 6-digit PIN; recovery controls could be bypassed locally without re-authenticating or answering the salted challenge.
   - **v2.0.0 Remediation**: Replaced plaintext PIN storage with salted **PBKDF2-SHA256** verifiers (`pinVerifier`, `securityAnswerHash`) verified in constant time; removed the unauthenticated bypass paths and added Firebase credential/popup re-authentication (`reauthenticateWithCredential` / `reauthenticateWithPopup`) for PIN recovery.

5. **[HIGH-02] Unverified Password Account Sign-In Bypass & Missing Email Gate (`src/App.tsx`, `LoginPage.tsx`)**
   - **Finding**: Accounts created with Email/Password were not forced through an `emailVerified` gate across `onAuthStateChanged` and backend routes.
   - **Impact**: Unverified or mistyped email registrations could operate vault flows locally before ownership confirmation.
   - **v2.0.0 Remediation**: Enforced `firebaseUser.emailVerified === true` in `App.tsx`, `firestore.rules` (`request.auth.token.email_verified == true`), and backend token verification (`server/security.ts`), backed by `EmailVerificationScreen.tsx` and instant token reload (`reload(user)`).

6. **[HIGH-03] Predictable Category Share Codes & Unprotected QR/Import Fallback (`src/utils/categoryShare.ts`, `ScanQrModal.tsx`)**
   - **Finding**: v1 generated deterministic 6-digit FNV-1a share codes stored only locally or trivially enumerable; `ScanQrModal` fell back to `categories[0]` when QR image decoding failed, creating confusing/incorrect imports.
   - **v2.0.0 Remediation**: Replaced with server-backed `lh2_<192-bit>` share tokens (`server/sharesStore.ts`), optional scrypt password protection, configurable TTL expiration, owner-only revocation, strict encrypted-link stripping, and explicit QR decode errors without substituting arbitrary categories.

7. **[HIGH-04] Missing Netlify Serverless Deployment Wiring (`netlify.toml`)**
   - **Finding**: v1 relied on a standalone `server.ts` while Netlify published static `dist/` without serverless `/api/*` routing or strict HTTP security headers.
   - **Impact**: Production API calls failed or lacked HSTS, CSP, `X-Frame-Options`, and `Referrer-Policy`.
   - **v2.0.0 Remediation**: Added `netlify/functions/api.ts` (`serverless-http` wrapper around shared `createApiApp()`), `/api/*` function rewrites, and hardened security headers + CSP in `netlify.toml`.

### Medium Severity Findings

8. **[MED-01] Preference & Security Setting Persistence Gaps + Unscoped Search/Export Leakage**
   - **Finding**: Auto-lock and sound toggles in `ProfileSettingsPage` were not cleanly synced to `/users/{uid}/preferences/default`, and private link URLs/notes needed consistent masking while categories remained locked.
   - **v2.0.0 Remediation**: Synced `/users/{uid}/preferences/default` strictly under Firestore schema rules, masked locked private links in global search and exports (`lockedPrivateCount` notice), and cleared unlocked DEKs immediately on lock or tab hide when auto-lock is enabled.

9. **[MED-02] Unvalidated URL Protocols in Manual Link Add & HTML/JSON Imports**
   - **Finding**: Imported or user-entered URLs lacked uniform strict `http:` / `https:` parsing before persistence and rendering.
   - **v2.0.0 Remediation**: Enforced `new URL()` `http:` / `https:` checks across `AddLinkModal.tsx`, `ImportModal.tsx`, `sharesStore.ts`, and `firestore.rules` (`^https?://.*`).

10. **[MED-03] Missing Explicit Entitlement / Privilege Escalation Rules**
    - **Finding**: Firestore rules needed explicit guards against client-side privilege/subscription injection and read-only enforcement on entitlement documents.
    - **v2.0.0 Remediation**: Added `hasNoPrivilegeFields()` blocks across all client-writable collections and dedicated server-only-write `/users/{uid}/entitlements/{id}` rules.

### Low & Informational Findings

11. **[LOW-01] Password Signup Minimum Length** — Increased minimum signup password requirement to `8` characters in `LoginPage.tsx`.
12. **[INFO-01] Missing Security CI Pipeline & Documentation** — Added `.github/workflows/security.yml`, `tests/cryptoAndMigration.test.ts`, `tests/ssrfAndBackendSecurity.test.ts`, `tests/firestore.emulator.test.ts`, `SECURITY.md`, and `MIGRATION_V1_TO_V2.md`.

---

## Part 2: Key Security Architecture Invariants (v2.0.0)

| Layer | Security Control | Enforcement Location |
| --- | --- | --- |
| Database Access | Default-deny + Owner UID + `email_verified` + Field Allowlists | `firestore.rules`, `firebase-blueprint.json` |
| Private Vault Crypto | PBKDF2-SHA256 (210k) + Random 256-bit DEK + AES-256-GCM + AAD | `src/utils/vaultCryptoV2.ts` |
| RAM Key Hygiene | DEKs held strictly in volatile `Map`; cleared on Lock/Sign-Out | `src/utils/vaultCryptoV2.ts`, `src/App.tsx` |
| Legacy Migration | Verified PIN unlock -> AES-256-GCM re-encrypt -> round-trip check | `src/utils/vaultMigration.ts` |
| API AuthN / AuthZ | Firebase ID Token (`firebase-admin` / RS256 JWKS) + `email_verified` + App Check | `server/security.ts` |
| SSRF Defense | Scheme/Port/Cred checks + `dns.lookup` CIDR block + manual redirect check | `server/ssrf.ts` |
| Abuse Prevention | Sliding-window per-UID/IP rate limiters + `64kb` payload limit | `server/app.ts`, `server/security.ts` |
| Transport / Browser | HSTS, strict CSP (no inline scripts), `X-Frame-Options: DENY`, `no-referrer` | `netlify.toml`, `server/security.ts` |

---

## Vulnerability Disclosure

If you discover a security issue in LinkHub, please report it responsibly via the repository maintainer before public disclosure. Do not include live credentials, Firebase service accounts, or private user bookmarks in bug reports.
