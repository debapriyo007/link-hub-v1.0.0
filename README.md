# LinkHub v2.0.0 — Security Edition

> **Secure your links with us in an organized manner.**

LinkHub is a dark-glassmorphism personal bookmark vault built with React 19, TypeScript, Tailwind CSS v4, Firebase Authentication, Cloud Firestore, Express / Netlify Serverless APIs, and Gemini AI metadata enrichment.

Version **2.0.0** is a ground-up security architecture upgrade over preserved baseline **v1.0.0** (`9c8d5e79e8e1ef41b5c8e0d8c1806cc9e1ba7d93`), delivering production-grade Web Crypto encryption, strict zero-trust Firestore rules, verified-email enforcement, SSRF-hardened backend APIs, server-backed revocable shares, and automated security verification while preserving the `#09090b`/`#121318` + `#ff9000` Outfit UI.

---

## Key Security & Product Capabilities (v2.0.0)

- **Zero-Trust Cloud Firestore Security (`firestore.rules` + `firebase-blueprint.json`)**
  - Default-deny catch-all (`allow read, write: if false`).
  - Owner isolation (`request.auth.uid == userId`) paired with mandatory verified email (`request.auth.token.email_verified == true`) across all authentication providers.
  - Strict schema allowlists, type/size bounds, URL scheme validation (`^https?://.*`), immutable ownership/creation timestamps, and explicit privilege-escalation blocks (`role`, `isAdmin`, `isPremium`, `subscription`, `plan`, etc.).
  - Dedicated server-write-only `/users/{userId}/entitlements/{entitlementId}` subcollection for future billing/plan state.
- **Production Web Crypto Private Vault (`src/utils/vaultCryptoV2.ts`)**
  - Removes all legacy custom XOR / FNV / xorshift / `Math.random()` cryptography for new writes.
  - Derives Key Encryption Keys (KEKs) and PIN/recovery verifiers via **PBKDF2-HMAC-SHA256 (210,000 iterations, random 128-bit salts)** with constant-time byte comparison.
  - Generates random **256-bit Data Encryption Keys (DEKs)** per private category and encrypts every field (`title`, `url`, `description`, `catName`, `catDesc`) using **AES-256-GCM** with unique random **96-bit nonces** and strict **AAD** binding (`userId`, `categorySlug`, `linkId`, `fieldName`).
  - Keeps unlocked DEKs strictly in volatile RAM and clears them on Lock Vault, Auto-Lock tab switch, or sign-out.
- **Lossless v1 -> v2 Legacy Data Migration (`src/utils/vaultMigration.ts`)**
  - Detects legacy `ENC1:` / `LHPRIV1:` records, requires successful PIN verification, re-encrypts to `ENC2:` / `LHPRIV2:`, performs mandatory round-trip decryption verification before touching original records, and preserves recovery checkpoints.
- **SSRF-Hardened & Authenticated Express / Netlify API (`server/`)**
  - Firebase ID Token + verified-email middleware (`firebase-admin` or Google RS256 JWKS verification via `jose`) and optional App Check middleware on `/api/ai/link-metadata`, `/api/stealth/reader`, and `/api/shares`.
  - Deep SSRF defense (`server/ssrf.ts`): HTTP/HTTPS scheme enforcement, port allowlist (`80`/`443`), embedded credential rejection, obfuscated IP blocking (decimal/hex/octal/shorthand/IPv4-mapped IPv6), pre-connect `dns.lookup(..., { all: true })` private/IMDS CIDR validation, and manual hop-by-hop redirect re-validation (`redirect: 'manual'`).
  - Strict CORS allowlist, security headers (`CSP`, `HSTS`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`), `64kb` body limits, and per-identity sliding-window rate limiters.
- **High-Entropy Revocable Category Shares (`server/sharesStore.ts`)**
  - Cryptographically random `lh2_<192-bit>` tokens stored in Firestore/server repository, optional scrypt share passwords, configurable TTL expiry (`24h`/`7d`/`30d`), owner-only revocation, and server-side encrypted-placeholder stripping.

---

## Project Structure

- `src/App.tsx` — Root workspace state, verified-email gate, Firestore realtime sync, auto-lock, and v1 -> v2 migration flows.
- `src/firebase.ts` — Firebase SDK setup, App Check initialization, security header helpers, and rules-synchronized sanitizers.
- `src/utils/vaultCryptoV2.ts` — Web Crypto PBKDF2-SHA256 + AES-256-GCM encryption & key hierarchy.
- `src/utils/legacyV1Crypto.ts` & `src/utils/vaultMigration.ts` — Read-only v1 decoder and verified v1 -> v2 vault migration engine.
- `server/ssrf.ts`, `server/security.ts`, `server/sharesStore.ts`, `server/app.ts` — Hardened Express API core.
- `server.ts` & `netlify/functions/api.ts` — Local Node server and Netlify serverless API entrypoint.
- `firestore.rules` & `firebase-blueprint.json` — Firestore zero-trust security rules and schema blueprint.
- `tests/` & `firestore.rules.test.ts` — Security, cryptography, SSRF, backend API, and Firestore Emulator tests.

---

## Development & Verification Commands

```bash
npm install
npm run typecheck      # TypeScript compiler verification
npm run lint:rules     # Official Firebase ESLint security rules check
npm test               # Cryptography, migration, SSRF, API security & static rules tests
npm run test:emulator  # Live Firestore Emulator adversarial suite (requires Java + firebase-tools)
npm run build          # Production Vite SPA build
npm run dev            # Run local Express + Vite server on http://localhost:3000
```

See `SECURITY.md` for the complete v1.0.0 audit report and v2.0.0 security architecture, `MIGRATION_V1_TO_V2.md` for data upgrade details, and `DEPLOYMENT.md` for production Firebase + Netlify rollout steps.
