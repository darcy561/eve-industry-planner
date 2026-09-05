# Entity id encryption rollout plan

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
| 1. Shared entity id helpers + tests | **Landed** — `shared/crypto/entityid`; see [overlay.md](./overlay.md) § Shared entity id helpers |
| 2. Refs as the internal representation | **Landed** — session grants, websocket scopes, tenant keys and job documents carry refs, and job reads restore ids at the response boundary; see [overlay.md](./overlay.md) § Refs as the internal representation |
| 3. Login-time backfill for legacy accounts | Not started |
| 4. Refresh-token encryption at rest + migration | **Landed** — `models.RefreshToken` persists `rTokenCiphertext` / `rTokenNonce` / `rTokenKeyVersion`, with the keyring built by `crypto/aesgcm/keyrings.NewRefreshTokenKeyringSpec` |
| 5. Entitlements store and event recompute worker | Not started |
| 6. API policy checks against entitlements | Not started |
| 7. Websocket scope refresh from entitlements events | Not started |
| 8. Dual-read migration period | Not started |
| 9. Full cutover to entitlements | Not started |

Phases 3 and 5–9 do not exist in the codebase yet: there is no login backfill and no
entitlements store. Refs themselves are in use across sessions, websocket routing and job
documents.

## Design — refs are deterministic reversible encryption

A ref is the value stored in place of a raw EVE entity id. It is produced by **deterministic
authenticated encryption** — SIV mode ([RFC 5297](https://www.rfc-editor.org/rfc/rfc5297),
[RFC 8452](https://www.rfc-editor.org/rfc/rfc8452)) — so the same id always yields the same ref
and the ref still decrypts.

Both properties are load-bearing:

| Property | Why the design needs it |
|---|---|
| Same id → same ref | A ref is identity: it keys statistics aggregation, Redis lock partitions and websocket tenant pools, and it is how a caller holding an id queries for stored documents |
| A ref decrypts back to its id | The response boundary must return the raw id a client is owed; for fields where the stored document is the only copy, nothing else can reconstruct it |
| Opaque in logs and in the database | A database leak without the key yields nothing |

Because one value carries both, it serves as identity directly: one field per entity id, and no
separate copy of the id stored anywhere alongside it.

### Construction

Implemented in-tree rather than by taking a crypto dependency, because both halves already exist
in the standard library and the construction is small:

```
nonce = HMAC(nonceKey, kind + ":" + id)[:12]
ct    = AES-GCM(dataKey, nonce, id, aad = kind)
```

`nonceKey` and `dataKey` are separate subkeys derived from `ENTITY_ID_KEY` under distinct labels.
Reusing a GCM nonce is only catastrophic across *different* plaintexts under one key; here the
nonce is a function of the plaintext, so a repeated nonce always accompanies the identical
plaintext. Depending on `github.com/secure-io/siv-go` for RFC 5297 / RFC 8452 instead remains
open if the in-tree construction proves awkward to review.

### Accepted trade-off

Anything that can return an id to a client can recover every id in the database, so the key
holder can decrypt. Ids are still never stored in readable form and a database leak without the
key still yields nothing. Irreversibility and returning ids to clients are mutually exclusive;
this project takes the latter.

### Field naming

A field named `…ID` holds an actual EVE id and means you are at a boundary; anywhere else it is
`…Ref`. "Ref" names what the value *is* — a reference to an entity — not the primitive behind it,
so `CorporationRef` / `corporation_ref` are independent of the crypto. `Encrypt` and `Decrypt`
name the operations, `entityid.Cipher` the machinery.

### Stored format

No ref has been written to a deployed database: live job documents still carry raw
`corporation_id`. The stored format is therefore still free to change and no backfill of
existing refs is needed. Converting the legacy raw ids reads the same raw field and writes the
ref in its place.

### Open at promote

Two live docs and one product surface name a retired key. Docs are live SoT, so they are not
edited during the project:

- [backend/api/auth/roadmap.md](../../backend/api/auth/roadmap.md) links to this project under a
  stale folder name and names a stale key — repair both.
- [deployment/guide.md](../../deployment/guide.md) tells the operator they back up
  `AUTHZ_HMAC_KEY` during `eip init`; the prompt is for `ENTITY_ID_KEY`.
- The Deployment Tool labels the field "HMAC" and types it `env.FieldHMAC`; rename to match
  `ENTITY_ID_KEY` with the promote or before it.

## Shared helper implementation

Rollout phase 1 landed as `shared/crypto/entityid`. Behaviour and operator surface →
[overlay.md](./overlay.md) § Shared entity id helpers.

Rollout phase 2 was the first consumer. Refs now carry organisation identity through session
grants, websocket scopes and tenant keys, and through job documents via
`shared/protectedfields`.

## Objectives

- Keep `character_hash` as canonical identity.
- Introduce deterministic internal refs for `character_id`, `corporation_id`, and `alliance_id`.
- Move authorization to server-side dynamic entitlements (event-driven), not token-embedded scope lists.
- Ensure legacy accounts that were created without `character_id` metadata are repaired at login.

## Ref Model

A ref is the deterministic encryption of one entity id under `ENTITY_ID_KEY`, described in
§ Construction:

- `char_ref = Encrypt("char", character_id)`
- `corp_ref = Encrypt("corp", corporation_id)`
- `alliance_ref = Encrypt("alliance", alliance_id)`

Implementation notes:

- Use the kind prefixes exactly as above; the kind is bound into both the derived nonce and
  the AEAD's additional data, so one numeric id yields a different ref per kind and a ref
  cannot be reinterpreted as another kind.
- Refs carry no version prefix: the format is `{kind}_{token}` (example: `char_...`).
- The token is base64url without padding of the derived nonce followed by the ciphertext.
- Keep the key in secrets management, never in source control.

### Single key, never rolled

There is **one** entity id key and it is not rotated. `ENTITY_ID_KEY` is locked once
generated, there is no legacy-key set, and no keyring type exists for it — unlike the
refresh-token AES key, which does roll and keeps legacy versions.

This is a deliberate decision, not a gap. Refs are identity, not merely storage: they key
statistics aggregation, lock partitions and websocket tenant pools, and those uses compare refs
to each other rather than deriving them from a supplied id. One entity holding two refs would
split aggregates and hand two clients separate lock partitions for the same document. Rolling
the key would therefore mean rewriting every stored ref in one pass, not a gradual re-derive.

A stored ref cannot be
recomputed under a new key without the original id, and the whole point of refs is that no
raw id is retained anywhere. Rolling would therefore leave old refs stranded on the old key.

The decisive constraint is that refs are **identity**, not merely a query filter. They key
corp and alliance statistics aggregation, Redis lock partitions (`corporation:{ref}`) and
websocket tenant pools. If one entity held two refs — one per key version — those uses
fragment: aggregates split into two rows per corporation, and two clients on the same corp
document take different lock partitions and both acquire the lease. Query-time fan-out
across key versions does not fix that, because those uses compare refs to each other rather
than deriving them from a supplied id.

Consequences to design around:

- A ref is stable for the life of the deployment; treat it as a permanent identifier.
- Refs carry no version prefix. A version would advertise a rotation that cannot happen, and
  costs bytes in every document, Redis partition key and log line. If the key ever has to
  change, old and new refs are indistinguishable — accepted, because without a way to
  canonicalise across keys they could not be used together regardless.
- Making rolling possible later needs a way to canonicalise refs across versions without
  storing ids — for example a table grouping refs known to denote the same entity, filled
  as real ids cross the API boundary. That is future work, not a current requirement.
- Because the key is permanent, its secrecy is the entire control. Character, corporation
  and alliance ids are a small enumerable space, so anyone holding both the database and the
  key can read every id back — and could rebuild the id-to-ref table even without decrypting. Refs defend against a database leak *without* the
  secrets, which is the case worth defending given Mongo and Swarm secrets have different
  blast radii.

### Wire and schema compatibility

Converting organisations to refs changed several cross-process and persisted surfaces. All
producers and consumers live in this repo and deploy together, so these are coordinated cuts
rather than migrations.

| Surface | Change | Classification |
|---------|--------|----------------|
| Redis account sessions | `SessionGrants.corporation_ids` / `alliance_ids` (`[]int64`) become `corporation_refs` / `alliance_refs` (`[]string`) | **breaking** — existing sessions lose org grants until re-authentication; the key rename means old records are ignored rather than failing to unmarshal a number into a string |
| Redis websocket handoff | `corporation_ids` / `alliance_ids` become `corporation_refs` / `alliance_refs` | **breaking**, short-lived keys |
| NATS `doc.update` | route fields and `scopes` renamed to ref names | **breaking**, same-deploy |
| Affinity cookie | `corporation:{id}` becomes `corporation:{ref}` | **breaking** — existing cookies stop matching, so connected clients are reshuffled across websocket replicas once |
| Operator env | `ENTITY_ID_KEY` is required, mounted for api, worker and websocket | **migrate-required** — the key must be mounted before deploy, or the services will not start |
| Browser `upgrade_scopes` | unchanged — the client still names organisations by id | additive |

## ID Spec (Implementation Contract)

### Canonical ref format

- `char_<token>`
- `corp_<token>`
- `alliance_<token>`

Where `<token>` is base64url(no padding) of the derived 12-byte nonce followed by the AES-GCM
ciphertext of the id.

### Input canonicalization rules

- Treat all raw ids as signed integer input and encrypt the id as a big-endian `int64`, so no
  string formatting can vary the ref.
- Reject `id <= 0` as invalid input.
- Bind exactly `<kind>` into the nonce derivation and the additional data (no whitespace).
- Never encrypt display names or mixed-case strings for identity refs.

### Determinism and scope separation guarantees

- Same `(kind, id)` always yields the same ref. Refs carry no key version.
- Different kinds must not collide for the same numeric id because the kind is bound into both the nonce derivation and the AEAD's additional data.
- Ref stability holds for the life of the deployment, which is what lets a ref serve as identity —
  see § Single key, never rolled.

### Required shared helper API

Landed as `shared/crypto/entityid`; behaviour → [overlay.md](./overlay.md) § Shared entity id helpers.

- `(*Cipher).Character(id int64) (string, error)`, and the `Corporation` / `Alliance` pair
- `(*Cipher).Encrypt(kind string, id int64) (string, error)`
- `(*Cipher).Decrypt(ref string) (kind string, id int64, err error)`
- `(*Cipher).DecryptKind(want, ref string) (int64, error)`
- `ParseKind(ref string) (kind string, ok bool)` and `ValidShape(ref string) bool`, neither of
  which needs the key

Operational rules:

- The cipher reads its key from environment (`ENTITY_ID_KEY`). There is no key version.
- Fail fast at service startup if key is missing/too short.
- Never log raw ids or full secret material from helper failures.

## Key Management and Rotation

### Runtime env

- `ENTITY_ID_KEY` is the key material. It is a Swarm secret mounted for the api, worker
  and websocket services, and it is the only entity id env knob. The encryption and
  nonce-derivation subkeys are derived from it under distinct labels.

### Rotation

The key is not rotated — see § Single key, never rolled for why, and for what would have to be
built first if that decision is ever revisited.

### Security constraints

- Key must be generated once per environment and backed up securely.
- Never commit key to source control or image layers.
- Restrict key access to services that derive refs.

## Refresh Token Security Hardening

**Status: landed** — see [overlay.md](./overlay.md) § Refresh token encryption. The stored field
names are `rTokenCiphertext` / `rTokenNonce` / `rTokenKeyVersion` rather than the
`refresh_token_*` names sketched below. The rest of this section is the contract that work was
built to.

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
2. Compute `character_ref` using the entity id cipher.
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
2. Backend derives `*_ref` via the entity id cipher.
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
  - derive `corp_ref` from ESI `corporation_id` via the shared entity id cipher
  - write only refs into authz snapshots/metadata used for authorization
  - trigger authz recompute/version bump events after updates
  - avoid persisting raw `corporation_id` in planner-facing authz stores

Pipeline:

1. Emit authz recompute event for account.
2. Consumer loads latest source state.
3. Derive refs (`char_ref`, `corp_ref`, `alliance_ref`) using the entity id cipher.
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
- Expiration behaviour:
  - if snapshot is expired/missing, rebuild from source-of-truth at next login (or first protected access with bounded singleflight rebuild).
  - stale accounts naturally age out of Redis without persistent memory growth.

Rationale:

- EVE SSO refresh lifecycle is finite and stale accounts eventually require re-attachment.
- A 25-day TTL keeps cache size bounded while retaining active-user performance.

## Rollout Phases

1. Add shared entity id helpers + tests.
2. Add metadata schema fields and reverse indexes.
3. Add login-time backfill check for legacy accounts (required before broader cutover).
4. Implement refresh-token encryption at rest + migration (blocking security milestone).
5. Introduce entitlements store and event recompute worker.
6. Integrate API policy checks with entitlements.
7. Integrate websocket scope refresh from entitlements update events.
8. Dual-read migration period (legacy path fallback).
9. Cut over fully to entitlements as authorization source.

Corporation claims task milestone (must be completed before phase 5 cutover):

- Update the corporation ESI claims worker/task to publish/consume only refs for authz writes.
- Ensure downstream authz recompute reads those ref outputs directly.
- Add regression coverage for corporation membership changes flowing through the ref-based pipeline.

## Migration and Test Plan for IDs

### Migration tasks

- Backfill `character_ref` for all active accounts at login and background sweep.
- Build/repair `authz:idx:char:{character_ref}` for lookup reliability.
- Keep legacy logic as fallback only until ref coverage reaches target threshold.

### Required tests

- Unit: deterministic vectors for char/corp/alliance refs, and round-trip back to the id.
- Unit: invalid id rejection and ref shape validation.
- Integration: login backfill creates `character_ref` + reverse index without persisting `character_id`.
- Integration: snapshot rebuild after TTL expiry restores authz behaviour.
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
