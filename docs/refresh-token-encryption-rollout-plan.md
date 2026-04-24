# Refresh Token Encryption Rollout Plan (Pre-Req)

## Purpose

This plan is a standalone prerequisite that must be completed before the HMAC ID/authz migration work.

Goal:

- Encrypt ESI refresh tokens at rest.
- Remove plaintext refresh-token persistence.
- Keep runtime behavior stable while migrating existing data safely.
- Preserve current app contract: refresh tokens are returned to the client on login and accepted back on user/account-settings writes.

Out of scope:

- HMAC ref generation (`char_ref`/`corp_ref`/`alliance_ref`)
- authz snapshot/index rollout
- frontend planner scope changes
- client-side refresh-token storage changes (local encryption, storage backend changes, device hardening)

## Security Requirements

- Never store ESI access tokens at rest.
- Store refresh tokens only as encrypted ciphertext.
- Use authenticated encryption (AEAD).
- Include key version metadata with each encrypted token.
- No plaintext token content in logs, traces, metrics, panics, or dead-letter payloads.
- Plaintext refresh tokens are allowed only in controlled runtime transit:
  - server decrypts and returns token in login response (TLS)
  - client sends token back on save/update flows (TLS)
  - server re-encrypts before persistence

## Token Flow Contract (Current App Model)

This plan explicitly supports the existing lifecycle:

1. Refresh token is stored encrypted at rest.
2. On login/bootstrap read, backend decrypts token and includes plaintext token in response to client.
3. Client owns refresh-token lifecycle handling.
4. On writes that persist user/account settings, client sends token payload back.
5. Backend encrypts token before any DB write.

Invariants:

- DB never stores plaintext refresh tokens after cutover.
- Decryption is server-side only; client does not hold encryption keys.
- Internal JWT tokens remain out of scope for this plan (they are not persisted).

## Client-Stored Refresh Tokens (Handling Rules)

The client currently stores and sends refresh tokens as part of the existing app flow. This rollout keeps that behavior unchanged.

Client-side rules:

- No client storage model changes are introduced in this phase.
- Existing client refresh-token lifecycle behavior remains as-is.
- Client-side storage hardening is explicitly deferred to a later phase.

Transport rules:

- Client sends refresh token only to required authenticated endpoints over TLS.
- Backend responses containing refresh tokens must include anti-caching headers (`Cache-Control: no-store`, `Pragma: no-cache`).

Server-side ingestion rules:

- Any refresh token received from client is plaintext transit data only.
- Before persistence, backend encrypts token and stores encrypted fields only.
- Backend must not persist plaintext token from request payloads in any DB/queue/log.

Loss/invalid token behavior:

- If client token is missing/invalid/revoked, backend returns re-auth required response.
- Client clears local token and prompts character/account re-attachment.

## Scope Boundary (Current Phase)

This plan is server-side only:

- in scope: encrypting persisted refresh tokens at rest and migrating legacy plaintext records.
- out of scope: changing how the frontend stores tokens locally on user machines.

Any frontend storage hardening work should be tracked as a separate follow-up plan.

## Data Model Target

For each stored refresh token record:

- `CharacterHash` (existing)
- `rTokenCiphertext` (required)
- `rTokenNonce` (required)
- `rTokenKeyVersion` (required)
- `tokenFormatVersion` (required)
- existing metadata fields already present in the user document

Model alignment note:

- This plan follows the current user document token array model (`refreshTokens[]`) and does not require introducing unavailable per-token fields like status/expiry in phase 1.

Legacy plaintext field:

- Keep temporarily for migration only.
- Remove after migration completion gate is met.

## Cryptography Model

- Use envelope-style keying:
  - DEK for payload encryption.
  - KEK from env/secret manager/KMS protecting DEK strategy.
- Use deterministic key-version labels (`v1`, `v2`, ...).
- Fail closed on decrypt/authentication tag failure.

## Rollout Phases

### Phase 1: Foundation

- Add crypto module for encrypt/decrypt refresh token values.
- Add startup config validation:
  - key present
  - minimum key length
  - valid key version format
- Add redaction-safe error wrappers.

Exit criteria:

- Encryption/decryption unit tests pass.
- Service fails fast if key config is invalid.

### Phase 2: Dual-Read / Encrypted-Write

- Write path:
  - all newly stored refresh tokens must be encrypted only.
- Read path:
  - support encrypted format first.
  - fallback to plaintext legacy format for migration window.
- Response/write path compatibility:
  - login/bootstrap endpoints must still return plaintext token to client (from decrypted-at-read value)
  - user/account-settings write endpoints must accept plaintext token input and encrypt before persistence
- Data-shape compatibility:
  - support existing `refreshTokens[].rToken` (legacy plaintext)
  - write new records as `refreshTokens[].rTokenCiphertext` + nonce/key version

Exit criteria:

- New records are encrypted.
- Existing plaintext records still usable through fallback.

### Phase 3: Read-Repair Migration

- On successful plaintext read:
  - encrypt token from `rToken`
  - write `rTokenCiphertext`, `rTokenNonce`, `rTokenKeyVersion`, `tokenFormatVersion`
  - remove or ignore plaintext `rToken` based on active migration flag
- Keep operation idempotent and safe under retries.

Exit criteria:

- Active records naturally converge toward encrypted format.

### Phase 4: Background Backfill

- Run bounded batch migration job for remaining plaintext records.
- Track progress metrics and retry failures.

Exit criteria:

- Plaintext backlog reaches near-zero.

### Phase 5: Encrypted-Only Cutover

- Disable plaintext fallback reads.
- Reject records missing encrypted fields.
- Remove plaintext write/read codepaths.
- Keep decrypt-for-response behavior for login/bootstrap responses (server-side only).

Exit criteria:

- 100% encrypted records in active dataset.
- No production requests rely on plaintext fallback.

### Phase 6: Cleanup

- Remove legacy plaintext column/field from persistence model.
- Remove migration feature flags.
- Finalize runbook and rotation docs.

Exit criteria:

- No plaintext token storage remains.
- Operational docs complete.

## Key Rotation Plan

- Add `refresh_token_key_version` to all records.
- Rotation steps:
  1. introduce new active key version
  2. encrypt new writes with new key
  3. decrypt with old+new during transition
  4. re-encrypt old records in background
  5. retire old key after convergence

## Operational Safety

- Use feature flags for:
  - encrypted-write enablement
  - plaintext fallback read enablement
  - read-repair enablement
  - encrypted-only enforcement
- Add rate limits/timeouts to backfill job.
- Ensure migration is resumable after deploy/restart.

## Metrics and Alerts

Required metrics:

- `refresh_token_encrypt_success_total`
- `refresh_token_encrypt_failure_total`
- `refresh_token_decrypt_success_total`
- `refresh_token_decrypt_failure_total`
- `refresh_token_plaintext_fallback_read_total`
- `refresh_token_read_repair_success_total`
- `refresh_token_read_repair_failure_total`
- `refresh_token_backfill_remaining`

Alerts:

- decrypt failure rate spike
- fallback reads not decreasing over time
- backfill stalled

## Testing Plan

- Unit:
  - encrypt/decrypt round-trip
  - auth tag tamper failure
  - wrong key version handling
- Integration:
  - legacy plaintext read + read-repair migration
  - encrypted-only mode behavior
  - login/bootstrap response still returns expected token payload
  - user/account-settings save path encrypts incoming token before write
- Security:
  - log scanning confirms no plaintext token leakage
  - DB inspection confirms ciphertext/nonce usage

## Deployment Order

1. Deploy Phase 1+2 code (encrypted-write + dual-read).
2. Enable read-repair.
3. Run and monitor backfill.
4. Flip encrypted-only mode.
5. Remove plaintext schema/legacy code.

## Completion Gate (Required Before Other Work)

This plan is considered complete only when:

- plaintext fallback reads are zero for a sustained window
- plaintext records are fully migrated
- encrypted-only mode is enabled in production

Only after this gate should the broader authz HMAC/snapshot migration proceed.
