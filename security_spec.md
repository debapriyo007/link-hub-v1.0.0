# LINKHUB Cloud Vault v2.0.0 — Security Specification (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth

1. **Master Gate & Tenant Isolation**:
   - `/users/{userId}` is the root identity document for each authenticated user.
   - All bookmarks (`/users/{userId}/links/{linkId}`), categories (`/users/{userId}/categories/{categoryId}`), preferences (`/users/{userId}/preferences/{prefId}`), and server-managed entitlements (`/users/{userId}/entitlements/{entitlementId}`) are strictly scoped to `{userId}`.
   - Subcollections require `exists(/databases/$(database)/documents/users/$(userId))` and `request.auth.uid == userId`.
2. **Verified Identity Across All Providers**:
   - Every read and write in Firestore and every authenticated `/api/*` endpoint requires `request.auth != null` and `request.auth.token.email_verified == true`.
   - Password-provider accounts without verified emails are blocked at UI login, Firestore Rules, and backend Express middleware.
3. **Privilege-Escalation & Billing Protection**:
   - Client-writable documents explicitly forbid reserved entitlement/role fields (`role`, `roles`, `isAdmin`, `admin`, `isPremium`, `premium`, `subscription`, `plan`, `tier`, `billingStatus`, `entitlements`, `stripeCustomerId`).
   - `/users/{userId}/entitlements/{entitlementId}` permits owner reads (`get`, `list`) only; `create`, `update`, and `delete` are denied (`if false`) to clients and mutated strictly via Firebase Admin SDK.
4. **Strict Schema, Key Allowlisting & Volumetric Bounds**:
   - Every entity enforces `keys().hasAll(...)` and `keys().hasOnly(...)` on create, and field-scoped `affectedKeys().hasOnly(...)` on update, synchronized with `firebase-blueprint.json`.
   - `url`, `imageUrl`, and `faviconUrl` must match `^https?://.*` (or empty string where optional).
   - `pin` stays empty (`""`) on v2 accounts; PIN verification uses `pinVerifier` (`PBKDF2_SHA256:...`).
5. **High-Entropy Revocable Shares (`/shares/{shareId}`)**:
   - Share IDs require `>= 22` URL-safe characters (`lh2_...`).
   - Direct client reads of non-owned shares are permitted only when `revoked == false && hasPassword == false && expiresAt > request.time`. Password-protected shares store hashes in backend-only `shareSecrets/{shareId}` (denied to all clients by default-deny catch-all) and redeem exclusively via `/api/shares/:token/resolve`.

---

## 2. Adversarial Security Test Matrix

1. **Unauthenticated Write**: `auth = null` creating `/users/user_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Bypass**: `email_verified: false` creating `/users/user_1` or calling `/api/*` -> `PERMISSION_DENIED` / `403`.
3. **Cross-Tenant Read**: `attacker_1` reading `/users/victim_1` or subcollections -> `PERMISSION_DENIED`.
4. **Privilege Injection**: Creating/updating any user document with `isAdmin: true`, `plan: 'pro'`, or `role: 'admin'` -> `PERMISSION_DENIED`.
5. **Entitlement Tampering**: Owner attempting write to `/users/user_1/entitlements/default` -> `PERMISSION_DENIED`.
6. **Immutability Violation**: Mutating `createdAt`, `uid`, `userId`, or `id` -> `PERMISSION_DENIED`.
7. **Dangerous URI Injection**: Creating `LinkItem` with `javascript:alert(1)` or `data:text/html` URL -> `PERMISSION_DENIED`.
8. **Invalid Share Enumeration**: Guessing short share ID (`"123456"`) or reading expired/revoked share -> `PERMISSION_DENIED` / `400` / `410`.
9. **SSRF & DNS Rebinding**: Fetching `127.0.0.1`, `169.254.169.254`, `::ffff:127.0.0.1`, obfuscated integers, or redirecting to metadata endpoints -> `403`.
10. **Cryptographic AAD / Ciphertext Tampering**: Moving AES-256-GCM ciphertext across `linkId`, `userId`, or `fieldName`, or modifying a byte -> GCM authentication failure.
