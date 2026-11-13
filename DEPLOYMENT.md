# LinkHub v2.0.0 — Deployment & Release Guide (`DEPLOYMENT.md`)

This guide covers deploying **LinkHub v2.0.0 — Security Edition** safely to Firebase and Netlify, as well as publishing the GitHub Release after code review.

---

## 1. Pre-Deployment Verification Checklist

Before releasing or deploying rules to production:

```bash
npm ci
npm run typecheck
npm run lint:rules
npm test
npm run build
```

If running in an environment with JDK 17+ / 21+ and `firebase-tools`:

```bash
firebase emulators:exec --only firestore --project linkhub-test "npm run test:emulator"
```

---

## 2. Firebase Configuration & Firestore Rules Rollout

Target Firebase Project (from `firebase-applet-config.json`): `gen-lang-client-0297873222`

1. **Deploy Hardened Firestore Security Rules** (when ready for v2 cutover):
   ```bash
   firebase use gen-lang-client-0297873222
   firebase deploy --only firestore:rules
   ```
   > **Important**: `firestore.rules` enforces `request.auth.token.email_verified == true` and strict schema allowlists. Deploy the v2 frontend (`dist/`) together with these rules so legacy plaintext PIN fields are cleanly cleared upon login/unlock.

2. **Configure Firebase App Check**:
   - In the Firebase Console -> **App Check**, register the Web app with **reCAPTCHA Enterprise** (recommended) or reCAPTCHA v3.
   - Set `VITE_FIREBASE_APPCHECK_SITE_KEY` (and `VITE_APPCHECK_PROVIDER="enterprise"` or `"v3"`) in Netlify build environment variables.
   - Enable App Check monitoring first; once verified clean in metrics, set `APPCHECK_ENFORCE="true"` in server/Netlify runtime environment variables and enable Cloud Firestore App Check enforcement in Firebase Console.

3. **Firebase Authentication Policies**:
   - Confirm **Email/Password** and **Google** providers remain enabled.
   - Verify Authorized Domains include `linkhub-v1.netlify.app` and your custom domains.

---

## 3. Netlify Production Deployment (`netlify.toml` + `netlify/functions/api.ts`)

`netlify.toml` configures:
- Static frontend build (`npm run build` -> `dist`)
- Serverless API function (`netlify/functions/api.ts` bundled with `esbuild`)
- Rewrite `/api/*` -> `/.netlify/functions/api/:splat`
- Production security headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, strict `Content-Security-Policy`, and `Cache-Control: no-store` on `/api/*`).

Set the following **Netlify Environment Variables** in Site Settings -> Environment Variables:
- `GEMINI_API_KEY` — Gemini API key (backend-only).
- `ALLOWED_ORIGINS` — e.g. `https://linkhub-v1.netlify.app`.
- `FIREBASE_PROJECT_ID` — `gen-lang-client-0297873222`.
- `FIRESTORE_DATABASE_ID` — matching `firebase-applet-config.json` (if using named database `ai-studio-linkoravaultretr-fdd3ed0b-0e23-48d8-8915-218536d5f0da`).
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Admin service account JSON string (required in serverless environments so `/api/shares/*` persists across cold starts in Cloud Firestore).
- `APPCHECK_ENFORCE` — `false` during monitoring rollout, `true` once App Check keys are active.
- `VITE_FIREBASE_APPCHECK_SITE_KEY` — Web reCAPTCHA site key.
- `VITE_APPCHECK_PROVIDER` — `enterprise` or `v3`.

---

## 4. GitHub Branch, PR & `v2.0.0` Release Workflow

Development stays isolated on branch `codex/linkhub-v2-security-upgrade`; **`v1.0.0` and `main` remain untouched until review**:

1. Push the development branch:
   ```bash
   git push -u origin codex/linkhub-v2-security-upgrade
   ```
2. Open a Pull Request from `codex/linkhub-v2-security-upgrade` -> `main` and confirm `.github/workflows/security.yml` passes all checks (including Firestore Emulator tests).
3. After review & merge to `main`, create and push annotated tag `v2.0.0`:
   ```bash
   git checkout main
   git pull origin main
   git tag -a v2.0.0 -m "LinkHub v2.0.0 — Security Edition"
   git push origin v2.0.0
   ```
4. Publish the GitHub Release titled **LinkHub v2.0.0 — Security Edition** using `CHANGELOG.md` and `SECURITY.md` notes while keeping `v1.0.0` intact.
