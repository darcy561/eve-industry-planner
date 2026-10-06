# Entity id encryption rollout plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## What this project is

Naming EVE characters, corporations and alliances internally by **ref** — a deterministic,
reversible encryption of the entity id, stored in the id's place — so no raw entity id is
persisted, while the response boundary can still hand a client the id it is owed.

That is the whole of it. The project began carrying a second half — server-side entitlements
replacing token-embedded scope lists — which has since been withdrawn; see § The authorization
half is withdrawn.

## Rollout status

Statuses reflect what runs today, not what was intended when this plan was written.

| Phase | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| Shared entity id helpers | **Landed** — `shared/crypto/entityid`; see [overlay.md](./overlay.md) § Shared entity id helpers |
| Refs as the internal representation | **Landed** — session grants, websocket scopes, tenant keys and job documents carry refs, and job reads restore ids at the response boundary; see [overlay.md](./overlay.md) § Refs as the internal representation |
| Refresh-token encryption at rest | **Landed**, with one tail — see § Refresh token encryption at rest |
| Converting stored documents | **Built, not run** — the sweep exists and has two defects; see § Converting stored documents |
| Login-time backfill for legacy accounts | **Withdrawn** |
| Entitlements store, recompute worker, policy checks, dual-read, cutover | **Withdrawn** |

The code half is done. What remains is one operator sweep and two pieces of cleanup, listed next.

## What is still owed

1. **Convert stored documents on every real database.** The sweep is written but has never been
   run against a database that matters, and two defects would make a run misreport. § Converting
   stored documents.
2. **Retire the plaintext refresh-token fallback.** Four steps, starting with a measurement on
   live, because the legacy rows cannot repair themselves. § Refresh token encryption at rest.

Nothing else. When those close, this project promotes into live SoT and the folder is deleted —
subject to shared-planners and archived-jobs-stats, which both cite this folder as the owner of
refs and keep it alive until they close.

## The authorization half is withdrawn

The plan originally ran to nine phases, of which five described a server-side entitlements
snapshot (`authz:snapshot:{account_id}`), a reverse index keyed by character ref, a recompute
worker, API and websocket policy checks reading it, a dual-read period and a cutover. A sixth
described repairing account metadata at login for accounts stored before `character_id` existed.

Both are withdrawn, for different reasons.

**The entitlements design was superseded by [shared-planners](../shared-planners/plan.md).** That
project made a session's grants one list of owner keys, and its Stage C repoints the fill at
membership rows — one query for the owner keys of every membership an account holds. Membership
rows are the entitlements store, `reconcileEntityMemberships` is the recompute, and the owner key
is the snapshot entry. It arrived at the same place by a different route, and it is the route the
code took. Building the snapshot described here as well would be a second answer to a question
already answered.

**Login backfill has nothing to repair.** It was written to fill `character_ref` into account
metadata for accounts missing `character_id`. No such metadata exists: `UserAccountDocument` keys
identity on `CharacterHash` alone, and the only `character_ref` in the codebase is on job
sub-documents. There is no store to backfill and none planned. The reverse index
`character_ref → account_id` is withdrawn with it.

What this leaves is the primitive and its conversion — which is what actually shipped.

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
plaintext.

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

### Single key, never rolled

There is **one** entity id key and it is not rotated. `ENTITY_ID_KEY` is locked once generated,
there is no legacy-key set, and no keyring type exists for it — unlike the refresh-token AES key,
which does roll and keeps legacy versions.

This is a deliberate decision, not a gap, and it follows from refs being **identity** rather than
a query filter. They key statistics aggregation, Redis lock partitions (`corporation:{ref}`) and
websocket tenant pools, and those uses compare refs to each other rather than deriving them from a
supplied id. One entity holding two refs — one per key version — would split aggregates into two
rows per corporation and hand two clients different lock partitions for the same document, both
acquiring the lease. Query-time fan-out across key versions does not fix that.

Rolling would also have nothing to re-derive from. A stored ref cannot be recomputed under a new
key without the original id, and the point of refs is that no raw id is retained. Old refs would
be stranded on the old key.

Consequences to design around:

- A ref is stable for the life of the deployment; treat it as a permanent identifier.
- Refs carry no version prefix. A version would advertise a rotation that cannot happen, and cost
  bytes in every document, Redis partition key and log line. If the key ever has to change, old
  and new refs are indistinguishable — accepted, because without a way to canonicalise across
  keys they could not be used together regardless.
- Making rolling possible later needs a way to canonicalise refs across versions without storing
  ids — for example a table grouping refs known to denote the same entity, filled as real ids
  cross the API boundary. That is future work, not a current requirement.
- Because the key is permanent, its secrecy is the entire control. Character, corporation and
  alliance ids are a small enumerable space, so anyone holding both the database and the key can
  read every id back — and could rebuild the id-to-ref table even without decrypting. Refs defend
  against a database leak *without* the secrets, which is the case worth defending given Mongo and
  Swarm secrets have different blast radii.

## ID spec (implementation contract)

### Canonical ref format

- `char_<token>`, `corp_<token>`, `alliance_<token>`

Where `<token>` is base64url (no padding) of the derived 12-byte nonce followed by the AES-GCM
ciphertext of the id. Refs carry no key version.

### Input canonicalization

- Raw ids are signed integers, encrypted as a big-endian `int64`, so no string formatting can vary
  the ref.
- `id <= 0` is rejected as invalid input.
- Exactly `<kind>` is bound into the nonce derivation and the additional data, so one numeric id
  yields a different ref per kind and a ref cannot be reinterpreted as another kind.
- Display names and mixed-case strings are never encrypted as identity refs.

### Helper API

Landed as `shared/crypto/entityid`; behaviour → [overlay.md](./overlay.md) § Shared entity id
helpers.

- `(*Cipher).Character(id int64) (string, error)`, and the `Corporation` / `Alliance` pair
- `(*Cipher).Encrypt(kind string, id int64) (string, error)`
- `(*Cipher).Decrypt(ref string) (kind string, id int64, err error)`
- `(*Cipher).DecryptKind(want, ref string) (int64, error)`
- `ParseKind(ref string) (kind string, ok bool)` and `ValidShape(ref string) bool`, neither of
  which needs the key

Operational rules: the cipher reads its key through `swarmsecret.Require("ENTITY_ID_KEY")`, fails
fast at service startup when the key is missing or too short, and never logs raw ids or key
material from helper failures.

### Key management

`ENTITY_ID_KEY` is the only entity id knob. It is a Swarm secret mounted for the api, worker and
websocket services, generated once per environment, backed up out of band, and never committed to
source control or an image layer. The encryption and nonce-derivation subkeys are derived from it
under distinct labels, so operators manage a single value.

## Wire and schema compatibility

Converting organisations to refs changed several cross-process and persisted surfaces. All
producers and consumers live in this repo and deploy together, so these were coordinated cuts
rather than migrations.

| Surface | Change | Classification |
|---------|--------|----------------|
| Redis account sessions | `SessionGrants.corporation_ids` / `alliance_ids` (`[]int64`) became `corporation_refs` / `alliance_refs` (`[]string`) | **breaking** — existing sessions lost org grants until re-authentication; the key rename means old records are ignored rather than failing to unmarshal a number into a string |
| Redis websocket handoff | `corporation_ids` / `alliance_ids` became `corporation_refs` / `alliance_refs` | **breaking**, short-lived keys |
| NATS `doc.update` | route fields and `scopes` renamed to ref names | **breaking**, same-deploy |
| Affinity cookie | `corporation:{id}` became `corporation:{ref}` | **breaking** — existing cookies stop matching, so connected clients are reshuffled across websocket replicas once |
| Operator env | `ENTITY_ID_KEY` is required, mounted for api, worker and websocket | **migrate-required** — the key must be mounted before deploy, or the services will not start |
| Browser `upgrade_scopes` | unchanged — the client still names organisations by id | additive |

Since those cuts, [shared-planners](../shared-planners/plan.md) has replaced the ref-named grant
fields with a single owner-key list. That is its change to describe, not this project's; the ref
values inside those keys are unchanged.

## Refresh token encryption at rest

**Landed** — see [overlay.md](./overlay.md) § Refresh token encryption. `models.RefreshToken`
persists `rTokenCiphertext` / `rTokenNonce` / `rTokenKeyVersion`, the AES-GCM keyring is built by
`crypto/aesgcm/keyrings.NewRefreshTokenKeyringSpec`, and ESI access tokens are never persisted.
Unlike the entity id key, this key rolls and keeps legacy versions; `tasks rotateRefreshTokenKeys`
re-encrypts under a new one.

Runtime rules that hold today: authenticated encryption, fail closed on a decrypt or auth-tag
error, and no token plaintext in logs, metrics labels, traces or panic payloads.

### The tail — the plaintext fallback

`RefreshToken.PlainRefreshMaterial` still falls back to the legacy plaintext `rToken` field when
the encrypted trio is absent. Three things about it are not what they look like, and each changes
what closing it involves.

**`rToken` is a live ingress field, not only legacy storage.** The SPA holds ESI refresh tokens and
sends them up as `rToken`; `user/document.go` and `user/cloudStoredEsiRefreshTokens.go` encrypt
each one on arrival, and `EncryptRefreshAtRest` clears the plaintext before the row is persisted.
No write path puts plaintext in Mongo. So the field cannot simply be deleted — what goes is the
**stored-read** fallback, leaving `rToken` an ingress-only value (`bson:"-"`), which makes
persisting or reading back plaintext impossible by construction rather than by discipline.

**The legacy rows cannot converge on their own.** Read-repair only fires on a path that reads a
stored token, and every one of those is gated on `UserCloudAccounts` — the login bundles in
`refresh.go` and `user/document.go`, and cloud maintenance, which refuses a non-cloud account
outright. The plaintext rows that remain belong to accounts with cloud storage off, which are not
supposed to carry `refreshTokens` at all: `StripRefreshTokenSecretsForTransport` drops the list for
them on the way out. Nothing will ever read those rows, so nothing will ever repair them.

**The rotation tool cannot convert them either.** `ReencryptTowardActiveVersion(kr, false)` has a
branch for legacy plaintext rows and a comment advertising it, but both callers guarantee
ciphertext is present before calling: the command's selection filter
(`keyrings.EncryptedRefreshTokenElemMatch`) requires `rTokenCiphertext` to be non-empty, and the
worker skips empty-ciphertext rows again before the call. The `skipUntagged` parameter therefore
has one reachable value, and the branch behind the other is dead.

Measured on the development database: 12 accounts, of which 2 hold plaintext across 6 rows, all
with cloud storage off and last logins in 2023 and 2024. The stored values are 24 characters —
far short of a real ESI refresh token — so on that database they are almost certainly seed data.
**Live has not been measured, and that measurement comes first.**

Closing it, in order:

1. Count plaintext rows on live and confirm whose they are.
2. Remove them rather than encrypt them — a secret no path will ever read is worth deleting, not
   protecting. An operator step, either in `prepareRelease` or as its own `tasks` command; not yet
   decided.
3. Make `rToken` ingress-only and delete the fallback branch in `PlainRefreshMaterial`.
4. Delete the `skipUntagged` parameter, its dead branch, and the comment describing it.

Dropping the stored field needs no schema version bump; stored copies age out on their own.

## Converting stored documents

New writes have carried refs since the boundaries landed: every job write path calls
`jobidentity.Encrypt` before persisting. Documents written *before* that still hold their ids in
the clear, and `tasks encodeJobIdentity` is the sweep that converts them across `jobs`,
`jobDocuments` and `archivedJobs`.

### What it converts

`jobidentity.Declaration` names corporation and character on three line types —
`build.sale.transactions[]`, `build.sale.marketOrders[]` and `build.costs.linkedJobs[]`. Of those
six targets, exactly one is persisted: `build.costs.linkedJobs[].corporation_id`. Every other id
field is `bson:"-"`, a client-facing value that never reaches the database. So the sweep's real
work per document is: derive `corporation_ref` on each linked-job line, clear the id, stamp the
spec.

That also means **the sweep cannot populate `character_ref`**. Decoding a stored document yields
`CharacterID` zero, and `Encrypt` skips a target whose id is not positive, so character refs only
ever arrive on a client write that carried a `character_id`. Anything expecting the sweep to fill
them — archived-jobs-stats has said so — is expecting something it does not do.

### How a converted document is recognised

`protected.spec`, a top-level `FieldProtection` block carried by `models.Job` and
`models.ArchivedJobStats`. A document is selected for conversion when it matches `RawIDFilter()`
(still holds a raw id) **or** `StaleSpecFilter()` (`protected.spec` is not the current spec). A
converted document is one whose spec is current and which holds no
`build.costs.linkedJobs.corporation_id`.

The marker is a spec string rather than a boolean deliberately: when the declaration gains a
field, every document written under the older set re-selects without anyone having to guess from
field presence. It sits beside `_meta` rather than inside it because the protected field set is a
per-type fact, and because the sweep writes through `UpsertStructsPreservingMetaBulk`, which
excludes `_meta` from its `$set` — a marker in `_meta` would be silently dropped by the write that
is meant to set it.

### Reverting a conversion

A ref decrypts back to its exact id, so nothing is lost while `ENTITY_ID_KEY` survives — the
response boundary does this restore on every read. Two gaps remain around that:

- There is **no decode command**. Unwinding a run means writing one, or restoring from a backup.
- The sweep runs **outside the release backup window**. `prepareRelease` copies every collection
  it writes to before any step runs, and `revertRelease` puts them back; `encodeJobIdentity` is a
  standalone fan-out that no manifest covers. Run inside the window after the copy, it is covered.

### Two defects to fix before running it

- **The enumeration reads a field that no longer exists.** The command distincts on
  `_meta.accountID` while the worker filters on `_meta.owner.kind` / `_meta.owner.id`. Since the
  owner cutover, that distinct returns nothing: the command prints `0 accounts need conversion`
  and exits successfully having done nothing — the worst shape for a migration measured with
  `--dry-run`. It should read the owner, using the `shared/mongo` constants rather than a literal.
- **There is no verify gate.** `rewriteOwnerScopedIDs` has `verifyOwnerScopedIDs` as a release
  step; this has nothing equivalent, so a run that did nothing is indistinguishable from a run
  with nothing to do. A gate counting remaining `RawIDFilter()` matches is worth more than the dry
  run.

### Where it should run

As a `prepareRelease` step in the shared-planners release — the one window every open project ships
in — sequenced after the owner stamp (the work filter reads the owner) and paired with its verify gate
beside the two already at the end of the list
([shared-planners](../shared-planners/plan.md) § Every open project ships in this window). That puts it inside the backup window, gives it a manifest to revert
from, and records the data work where every other release's data work is written down.

## Stored format

The stored format is settled: refs are landing on every new write, so changing the format now
would mean converting what has already been written rather than only the legacy ids.

## Open at promote

The `AUTHZ_HMAC_KEY` naming is retired: the auth roadmap names this project and links it,
`deployment/guide.md` names `ENTITY_ID_KEY` and describes what `eip init` actually does, and the
Deployment Tool's field type is `env.FieldSecretKey` — named for the material it generates
(url-safe base64 key material), since the type is not HMAC-specific and the key it serves is not
an HMAC key.

Promotion targets for the landed behaviour are `backend/api/auth/` for the key and the token
encryption, and the ref sections already present in `backend/shared/mongo.md` and
`backend/worker/worker.md` for the conversion boundaries.

## Tests

What exists and must keep passing:

- Deterministic vectors for char/corp/alliance refs and round-trip back to the id; invalid id
  rejection and ref shape validation (`shared/crypto/entityid`).
- `TestClientRoundTripPreservesStoredIdentity` — store, decrypt, serialise, echo, re-encrypt, and
  the refs come back byte for byte.
- `TestClientPayloadKeysMatchTheAPIResponse` — the same job through both transports delivers the
  same key set, so a storage rename that breaks the derivation fails here rather than in the
  browser.

What the remaining work owes: a test that the conversion sweep enumerates the accounts it should
on owner-stamped documents, which is the defect above expressed as coverage.
