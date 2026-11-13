# Changelog

All notable changes to **LinkHub** are documented in this file.

## [2.0.0] — LinkHub v2.0.0 — Security Edition

### Added
- **AES-256-GCM Private Vault & Key Hierarchy** (`src/utils/vaultCryptoV2.ts`): Random 256-bit DEKs per private category, PBKDF2-HMAC-SHA256 (210,000 iterations) KEK wrapping and constant-time PIN/recovery verifiers, unique random 96-bit nonces per encryption, contextual AAD binding, and volatile RAM-only DEK storage.
- **Zero-Data-Loss Legacy Migration Engine** (`src/utils/vaultMigration.ts`, `src/utils/legacyV1Crypto.ts`): Automatic detection of v1.0.0 `ENC1:` / `LHPRIV1:` records on PIN unlock, re-encryption to `ENC2:` / `LHPRIV2:`, round-trip decryption verification prior to replacing v1 data, and `sessionStorage` recovery checkpoints.
- **Email Verification Enforcement Gate** (`src/components/EmailVerificationScreen.tsx`): Mandatory verified-email check on login, registration, Firestore Rules, and backend APIs.
- **Comprehensive SSRF Protection Engine** (`server/ssrf.ts`): Scheme/port/credential validation, obfuscated IP blocking, IPv4/IPv6 private/CGNAT/IMDS CIDR rejection, pre-request `dns.lookup(..., { all: true })` checks, and manual redirect hop validation.
- **Hardened Shared API & Netlify Serverless Support** (`server/app.ts`, `server/security.ts`, `netlify/functions/api.ts`, `netlify.toml`): Firebase ID Token + App Check verification, origin-restricted CORS, HSTS/CSP/X-Frame-Options/Referrer-Policy headers, `64kb` body caps, and per-identity sliding-window rate limiters.
- **Server-Backed Revocable Category Shares** (`server/sharesStore.ts`, `/api/shares/*`): High-entropy `lh2_...` share tokens, optional scrypt share passwords, configurable TTL expiry, owner revocation, and encrypted-placeholder stripping.
- **Synced Preferences & Privilege-Free Entitlements**: `/users/{uid}/preferences/default` sync for Auto-Lock and Sound preferences, PBKDF2 recovery answer hashes, and server-managed read-only `/users/{uid}/entitlements/{id}` schema.
- **Automated Security Verification & CI** (`tests/`, `.github/workflows/security.yml`): Unit/integration tests for cryptography, v1->v2 migration, SSRF, backend auth/rate-limiting/shares, Firestore Rules lint, and Firestore Emulator suite.

### Changed
- Upgraded `firestore.rules` and `firebase-blueprint.json` with strict schema allowlists, URL validation, privilege-field blocks, verified-email gates, and zero-trust defaults.
- Updated `LoginPage`, `LockedScreen`, `PinModal`, `PrivateCategoryPinModal`, `ProfileSettingsPage`, `AddLinkModal`, `IncognitoModal`, `ImportModal`, `ExportModal`, `ShareQrModal`, and `ScanQrModal` to enforce v2 security invariants while preserving the dark glassmorphism UI (`#09090b`/`#121318`, `#ff9000` accent, `Outfit` font).
- Bumped package version from `0.0.0` (v1.0.0 tag) to `2.0.0`.

### Security
- Removed custom XOR/FNV/xorshift encryption and `Math.random()` salts for all new vault writes.
- Removed plaintext vault PIN persistence and unauthenticated lockscreen bypass/removal paths.
- Removed insecure `ScanQrModal` fallback that substituted arbitrary local categories when decoding failed.

---

## [1.0.0] — Initial Release (Preserved)
- Original baseline release tagged at `v1.0.0` (`9c8d5e79e8e1ef41b5c8e0d8c1806cc9e1ba7d93`).
