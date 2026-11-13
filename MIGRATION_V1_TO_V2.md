# LinkHub v1.0.0 -> v2.0.0 Legacy Vault & Schema Migration Guide (`MIGRATION_V1_TO_V2.md`)

LinkHub v2.0.0 is engineered to preserve **all existing v1.0.0 user bookmarks, categories, and private vaults** without forcing data loss.

---

## 1. Account-Level Vault PIN Migration
1. **Unverified Password Accounts**:
   - In v1.0.0, email/password accounts could sign in prior to verifying their inbox address.
   - In v2.0.0, existing unverified accounts are greeted by `EmailVerificationScreen`, where they can send/refresh verification seamlessly without losing saved cloud documents.
2. **Legacy Plaintext PINs (`userProfile.pin`)**:
   - When an existing user with a legacy 6-digit `userProfile.pin` unlocks their `LockedScreen` in v2.0.0:
     - The client verifies the entered 6-digit PIN against the legacy value in memory.
     - On success, `App.tsx` automatically derives a salted **PBKDF2-SHA256 (210,000 iterations)** `pinVerifier`, writes `pinVerifier` and `vaultVersion: 2`, and clears the legacy plaintext `pin` field to `""` in Firestore.

---

## 2. Private Category Cryptography Migration (`ENC1:`/`LHPRIV1:` -> `ENC2:`/`LHPRIV2:`)

Legacy v1.0.0 private categories used `LHPRIV1:` envelopes on the category `description` and `ENC1:` ciphertexts on bookmarks (`https://encrypted.linkhub.vault/ENC1:...`).

When a user unlocks a legacy private category in v2.0.0:

1. **Detection (`needsVaultMigration`)**:
   - Inspects whether the category lacks an `LHPRIV2:` `privateVaultMeta` header or still contains any `ENC1:` link fields.
2. **PIN Authentication (`verifyLegacyV1Pin`)**:
   - Requires the exact original 6-digit category PIN before attempting decryption. Wrong PINs abort immediately with zero writes.
3. **In-Memory Decryption (`legacyV1Crypto.ts`)**:
   - Extracts category name, category description, and every link's `title`, `url`, and `description` into volatile memory using read-only v1 decoders.
   - Retains an immutable `backupLinks` snapshot in memory throughout the operation.
4. **v2 Vault Provisioning & Re-Encryption (`vaultMigration.ts`)**:
   - Generates a fresh cryptographically random **256-bit DEK** (`crypto.subtle.generateKey`).
   - Derives a PBKDF2-SHA256 KEK (210,000 iterations, random 128-bit salt) and wraps the DEK with AES-256-GCM + AAD (`linkhub:v2:dek:<uid>:<slug>`).
   - Encrypts category metadata and every bookmark field with **AES-256-GCM**, unique random 96-bit IVs, and field-specific AAD (`linkhub:v2:field:<uid>:<slug>:<linkId>:<field>`).
5. **Mandatory Round-Trip Verification**:
   - Unwraps the new `privateVaultMeta` from scratch with the user's PIN and decrypts every re-encrypted category field and bookmark field to assert exact string equality against the original v1 plaintexts.
6. **Checkpoint & Atomic Firestore Batch Commit**:
   - Records a `sessionStorage` migration checkpoint (`linkhub_v2_mig_<uid>_<slug>`), commits the upgraded category + links atomically via `writeBatch` in chunks up to 400 operations, and clears the checkpoint upon Firestore confirmation.
   - If network interruption prevents commit, original v1 data remains completely intact in Firestore for clean retry on next unlock.
