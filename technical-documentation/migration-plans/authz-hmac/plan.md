# AuthZ HMAC Rollout Plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Rollout status

Statuses reflect what runs today, not what was intended when this plan was written.

| Rollout phase | Status |
|---------------|--------|
| Phase 1 — project docs | Complete |
| 1. Shared HMAC helpers + tests | **Landed** — `shared/crypto/authzhmac/{helper,ref}`; see [overlay.md](./overlay.md) § Shared HMAC helpers |
| 2. Metadata schema fields and reverse indexes | Not started |
| 3. Login-time backfill for legacy accounts | Not started |
| 4. Refresh-token encryption at rest + migration | **Landed** — `models.RefreshToken` persists `rTokenCiphertext` / `rTokenNonce` / `rTokenKeyVersion`, with the keyring built by `crypto/aesgcm/keyrings.NewRefreshTokenKeyringSpec` |
| 5. Entitlements store and event recompute worker | Not started |
| 6. API policy checks against entitlements | Not started |
| 7. Websocket scope refresh from entitlements events | Not started |
| 8. Dual-read migration period | Not started |
| 9. Full cutover to entitlements | Not started |

Nothing under phases 1–3 or 5–9 exists in the codebase yet. No `crypto/hmac` use, no
`char_ref` / `corp_ref` / `alliance_ref` symbols, and no entitlements store are present on
`Development`.

## Shared helper implementation

Rollout phase 1 landed as `shared/crypto/authzhmac/{helper,ref}`. Behaviour and operator surface →
[overlay.md](./overlay.md) § Shared HMAC helpers.

The helpers have no callers yet. Rollout phase 2 (metadata schema fields and reverse indexes) is
the first consumer.

## Objectives

- Keep `character_hash` as canonical identity.
- Introduce deterministic internal refs for `character_id`, `corporation_id`, and `alliance_id`.
- Move authorization to server-side dynamic entitlements (event-driven), not token-embedded scope lists.
- Ensure legacy accounts that were created without `character_id` metadata are repaired at login.

## Ref Model (Model 1)

- `char_ref = HMAC_SHA256(pepper, "char:"+character_id)`
- `corp_ref = HMAC_SHA256(pepper, "corp:"+corporation_id)`
- `alliance_ref = HMAC_SHA256(pepper, "alliance:"+alliance_id)`

Implementation notes:

- Use domain separation prefixes exactly as above.
- Use a version prefix in stored values (example: `v1_char_...`).
- Encode as base64url without padding (optionally truncate digest before encoding).
- Keep pepper in secrets management, never in source control.

## ID Spec (Implementation Contract)

### Canonical ref format

- `v1_char_<token>`
- `v1_corp_<token>`
- `v1_alliance_<token>`

Where `<token>` is base64url(no padding) of an HMAC-SHA256 digest (optionally truncated to 20 bytes before encoding).

### Input canonicalization rules

- Treat all raw ids as signed integer input and canonicalize to base-10 string via `strconv.FormatInt(id, 10)`.
- Reject `id <= 0` as invalid input.
- Always hash exactly `<kind>:<canonical_id>` (no whitespace).
- Never hash display names or mixed-case strings for identity refs.

### Determinism and scope separation guarantees

- Same `(kind, id, key_version)` always yields the same ref.
- Different kinds must not collide for the same numeric id because kind prefix is part of HMAC input.
- Ref stability is guaranteed only while the same HMAC key/version remains active.

### Required shared helper API

- `RefFromCharacterID(id int64) (string, error)`
- `RefFromCorporationID(id int64) (string, error)`
- `RefFromAllianceID(id int64) (string, error)`
- `ParseRefVersion(ref string) (version string, kind string, ok bool)`
- `ValidateRefShape(ref string) bool`

Operational rules:

- Helpers read HMAC key and key version from environment (`AUTHZ_HMAC_KEY`, `AUTHZ_HMAC_KEY_VERSION`).
- Fail fast at service startup if key is missing/too short.
- Never log raw ids or full secret material from helper failures.

## Key Management and Rotation

### Runtime env

- `AUTHZ_HMAC_KEY` is the active signing key material.
- `AUTHZ_HMAC_KEY_VERSION` defaults to `v1` for initial rollout.

### Rotation strategy (no downtime)

1. Introduce new key as `v2`.
2. Dual-read refs (`v1` + `v2`) during migration windows where needed.
3. Recompute snapshots/indexes writing `v2` refs.
4. Cut readers to `v2` only after convergence.
5. Retire `v1` key from runtime.

### Security constraints

- Key must be generated once per environment and backed up securely.
- Never commit key to source control or image layers.
- Restrict key access to services that derive refs.

## Refresh Token Security Hardening (Required)

Current gap:

- ESI refresh tokens are currently stored unencrypted at rest. This must be remediated before full authz cutover.

Required target:

- Store ESI refresh tokens encrypted at rest (envelope encryption).
- Never persist ESI access tokens.
- Decrypt refresh tokens only at use time in backend worker/API paths, then discard plaintext from memory as soon as possible.

Encryption model:

- Use a data encryption key (DEK) for token payload encryption.
- Protect DEK with a key encryption key (KEK) from environment/secret manager or KMS.
- Persist token records as:
  - `refresh_token_ciphertext`
  - `refresh_token_nonce` (or IV)
  - `refresh_token_key_version`
  - metadata (`character_ref`, `account_id`, timestamps)

Runtime rules:

- No plaintext refresh/access tokens in logs, metrics labels, traces, or panic payloads.
- Use authenticated encryption (AEAD) and fail closed on decrypt/auth tag errors.
- Add key versioning to support rotation without downtime.

Migration plan:

1. Add dual-read support (plaintext legacy + encrypted new format).
2. On successful legacy token read, re-encrypt and write encrypted format (read-repair).
3. Run background backfill for remaining legacy rows.
4. Cut write path to encrypted-only.
5. Remove plaintext fallback once migration reaches completion threshold.

Verification checklist:

- New refresh tokens are always encrypted before persistence.
- Existing plaintext records are converging toward encrypted format.
- Decrypt failures are observable with redacted error telemetry.
- No token plaintext present in DB snapshots or application logs.

## Data Contracts

### Account Identity Metadata

Keyed by `account_id`:

- `account_id`
- `character_hash` (identity source of truth)
- `characters[]` with:
  - `character_ref` (required)
- `authz_version`
- timestamps

Storage rule:

- Do not persist raw `character_id` in metadata or planner-facing stores.
- `character_id` is transient input only (client request or ESI response), used immediately to derive `character_ref`, then discarded.

### Dynamic Entitlements Snapshot

Keyed by `account_id`:

- `version`
- `character_refs[]`
- `corporation_refs[]`
- `alliance_refs[]`
- `roles_by_scope` (future)
- `updated_at`

### Reverse Lookup Indexes

- `character_ref -> account_id` (required)

Recommended Redis keys:

- `authz:snapshot:{account_id}` -> snapshot blob/hash (TTL 25d)
- `authz:idx:char:{character_ref}` -> `account_id` (TTL 25d or aligned touch policy)

Consistency rule:

- Update snapshot and related indexes in one atomic write path (Lua or transaction) per account recompute.

## Critical Login Backfill Requirement

Some existing accounts were stored before `character_id` metadata existed. We must repair that during login.

At login (after ESI token validation):

1. Resolve current `character_id` from ESI verify endpoint / token introspection data.
2. Compute `character_ref` using HMAC helper.
3. Load account metadata by `account_id` (derived from `character_hash` as today).
4. If account metadata is missing `character_ref` (or missing the corresponding character entry), upsert:
   - add `character_ref`
   - add reverse index `character_ref -> account_id`
   - set/update `authz_version` if needed
5. Proceed with auth flow even when this is a backfill path.

Input handling rule:

- Do not write `character_id` to persistent storage during login backfill.
- Do not include raw `character_id` in logs/metrics labels.

Failure policy:

- If identity is valid but metadata backfill fails due to transient storage issues, return retryable server error (do not write partial authz state).
- Emit structured metrics and logs for backfill attempts, success, and failure.

This login-time check remains permanently as a safety net for any partially migrated or old records.

## End-to-End ID Lifecycle

1. Client/ESI provides raw id (transient only).
2. Backend derives `*_ref` via HMAC helper.
3. Raw id is discarded after derivation (not persisted in planner-facing stores).
4. Snapshot/index state is written using only refs.
5. API/WS authorization evaluates refs + roles from snapshot.
6. On TTL expiry, snapshot/indexes are rebuilt from source data on next access.

## Runtime Authorization Model

- JWT contains stable identity/session claims only (`account_id`, `session_id`, expiry).
- API and websocket authorization consult server-side entitlements keyed by `account_id`.
- Permission changes (corp/alliance/role) are applied by event processing and become effective without waiting for token refresh.

## Event-Driven Flow

Event sources:

- ESI sync updates (character membership, corp membership, alliance membership, role changes)
- admin/manual role updates

Implementation requirement:

- The corporation ESI claims task must be migrated to this framework:
  - derive `corp_ref` from ESI `corporation_id` via shared HMAC helper
  - write only refs into authz snapshots/metadata used for authorization
  - trigger authz recompute/version bump events after updates
  - avoid persisting raw `corporation_id` in planner-facing authz stores

Pipeline:

1. Emit authz recompute event for account.
2. Consumer loads latest source state.
3. Derive refs (`char_ref`, `corp_ref`, `alliance_ref`) using HMAC helpers.
4. Write new entitlements snapshot, increment `version`.
5. Notify live websocket sessions (`entitlements_updated` with version).

## Redis TTL Alignment Policy

- Set dynamic authz snapshot TTL to **25 days**.
- Key scope:
  - `authz:snapshot:{account_id}` (required)
  - related authz cache/index keys should use aligned TTL or be rebuilt from snapshot/source on demand.
- Refresh TTL on:
  - successful login/refresh
  - authz recompute writes
  - authenticated activity touch interval (bounded; avoid touching on every request).
- Expiration behavior:
  - if snapshot is expired/missing, rebuild from source-of-truth at next login (or first protected access with bounded singleflight rebuild).
  - stale accounts naturally age out of Redis without persistent memory growth.

Rationale:

- EVE SSO refresh lifecycle is finite and stale accounts eventually require re-attachment.
- A 25-day TTL keeps cache size bounded while retaining active-user performance.

## Rollout Phases

1. Add shared HMAC helpers + tests.
2. Add metadata schema fields and reverse indexes.
3. Add login-time backfill check for legacy accounts (required before broader cutover).
4. Implement refresh-token encryption at rest + migration (blocking security milestone).
5. Introduce entitlements store and event recompute worker.
6. Integrate API policy checks with entitlements.
7. Integrate websocket scope refresh from entitlements update events.
8. Dual-read migration period (legacy path fallback).
9. Cut over fully to entitlements as authorization source.

Corporation claims task milestone (must be completed before phase 5 cutover):

- Update the corporation ESI claims worker/task to publish/consume only HMAC-derived refs for authz writes.
- Ensure downstream authz recompute reads those ref outputs directly.
- Add regression coverage for corporation membership changes flowing through the ref-based pipeline.

## Migration and Test Plan for IDs

### Migration tasks

- Backfill `character_ref` for all active accounts at login and background sweep.
- Build/repair `authz:idx:char:{character_ref}` for lookup reliability.
- Keep legacy logic as fallback only until ref coverage reaches target threshold.

### Required tests

- Unit: deterministic vectors for char/corp/alliance refs.
- Unit: invalid id rejection and ref shape validation.
- Integration: login backfill creates `character_ref` + reverse index without persisting `character_id`.
- Integration: snapshot rebuild after TTL expiry restores authz behavior.
- Security: assert logs/metrics do not emit raw ids for these entities.

### Readiness gates

- >= 99% accounts have `character_ref`.
- Reverse index hit-rate meets lookup SLO.
- No auth decisions depend on raw corp/alliance ids in runtime paths.

## Validation Checklist

- Login for legacy account with missing character metadata creates `character_ref` and reverse index automatically.
- Corp/alliance grants become effective without token re-issuance.
- Corp/alliance revokes become effective within defined propagation SLA.
- No planner-facing storage path requires raw corp/alliance IDs.
- Account lookup by `character_id` works by deriving `character_ref` and resolving `account_id`.
