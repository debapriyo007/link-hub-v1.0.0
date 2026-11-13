# LINKHUB Cloud Vault — Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth

1. **Master Gate & Tenant Isolation**:
   - `/users/{userId}` is the root identity document for each authenticated user.
   - All bookmarks (`/users/{userId}/links/{linkId}`) and categories (`/users/{userId}/categories/{categoryId}`) are subcollections owned exclusively by `{userId}`.
   - A `Category` or `LinkItem` cannot be created or updated unless the parent `/users/{userId}` document exists (`exists(/databases/$(database)/documents/users/$(userId))`) and `request.auth.uid == userId`.
2. **Verified Identity**:
   - Every read and write requires `request.auth != null` and `request.auth.token.email_verified == true`.
   - PII in `/users/{userId}` (`email`, `displayName`, `photoURL`, `pin`) is strictly isolated to `request.auth.uid == userId`.
3. **Strict Schema, Key Allowlisting & Volumetric Bounds**:
   - Every entity enforces exact `keys().hasAll(...)` and `keys().hasOnly(...)` on `create`, and action-scoped `incoming().diff(existing()).affectedKeys().hasOnly(...)` on `update`.
   - Every string field enforces `.size()` limits matching `firebase-blueprint.json`.
   - Every ID/slug field matches `^[a-zA-Z0-9_\-]+$` with length `<= 128` (or `<= 60` for slugs).
   - `tags` array in `LinkItem` is bounded to `size() <= 10` and validates element type/length on index 0 when non-empty.
4. **Temporal & Identity Immutability**:
   - `createdAt` must equal `request.time` on `create` and is immutable (`incoming().createdAt == existing().createdAt`) on `update`.
   - `updatedAt` must equal `request.time` on both `create` and `update`.
   - `uid` / `userId` and `id` are immutable after creation.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Unauthenticated Write)**: `auth = null`, creating `/users/user_1` -> `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Spoof)**: `auth = { uid: 'user_1', token: { email_verified: false } }`, creating `/users/user_1` -> `PERMISSION_DENIED`.
3. **Payload 3 (Cross-Tenant PII Read)**: `auth = { uid: 'attacker_1', token: { email_verified: true } }`, reading `/users/victim_1` -> `PERMISSION_DENIED`.
4. **Payload 4 (Identity Spoofing on Create)**: Creating `/users/user_1/links/link_1` with `userId: 'other_user'` -> `PERMISSION_DENIED`.
5. **Payload 5 (Orphaned Subcollection Write)**: Creating `/users/user_no_profile/links/link_1` before `/users/user_no_profile` exists -> `PERMISSION_DENIED`.
6. **Payload 6 (Shadow Field Injection on Create)**: Creating `/users/user_1/links/link_1` with an undeclared field `isAdmin: true` -> `PERMISSION_DENIED`.
7. **Payload 7 (Shadow Field Injection on Update)**: Updating `/users/user_1/links/link_1` with an undeclared field `role: 'admin'` -> `PERMISSION_DENIED`.
8. **Payload 8 (Immortal Field Mutation)**: Updating `/users/user_1/links/link_1` by modifying `createdAt` or `userId` -> `PERMISSION_DENIED`.
9. **Payload 9 (Client Timestamp Forgery)**: Creating `/users/user_1/links/link_1` with a forged past/future timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Payload 10 (Resource Exhaustion / Oversized String)**: Updating `/users/user_1/links/link_1` with a 5,000-character `title` (exceeds `maxLength: 160`) -> `PERMISSION_DENIED`.
11. **Payload 11 (Unbounded Array Injection)**: Creating `/users/user_1/links/link_1` with 25 tags (exceeds `size() <= 10`) -> `PERMISSION_DENIED`.
12. **Payload 12 (Invalid PIN Format Injection)**: Updating `/users/user_1` with `pin: '12345a'` (violates `^([0-9]{6})?$`) -> `PERMISSION_DENIED`.
