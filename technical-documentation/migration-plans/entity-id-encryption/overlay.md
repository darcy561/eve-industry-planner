# Entity id encryption — behaviour overlay

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).

While this project is active, this file is the overlay on top of live SoT: where it describes a
surface, it wins for that in-flight work. Where it is silent, live documentation remains the truth.

Each rollout phase fills its section as it lands — what changed, and how that part works
afterwards. Empty sections mean the phase has not landed.

## Current behaviour (before this project)

Identity is keyed on `character_hash`, and authorization decisions read what the session carries
rather than a server-side entitlements snapshot. Raw EVE entity ids appear in stores that back
those decisions. There are no entity refs in the codebase.

Live detail: [backend/api/auth/overview.md](../../backend/api/auth/overview.md).

## Refresh token encryption (landed)

ESI refresh tokens are encrypted at rest. `models.RefreshToken` persists `rTokenCiphertext`,
`rTokenNonce`, and `rTokenKeyVersion`; plaintext is produced only at use time. The AES-GCM keyring
is built by `crypto/aesgcm/keyrings.NewRefreshTokenKeyringSpec`, which takes key material from
`swarmsecret.Require("REFRESH_TOKEN_AES_KEY")` and the version from
`REFRESH_TOKEN_AES_KEY_VERSION`, defaulting to `v1`.

This was the plan's blocking security milestone and no longer gates later phases.

## Shared entity id helpers

`shared/crypto/entityid` converts EVE entity ids to and from **refs** — the value stored in
their place. It is consumed by session grants, websocket scope upgrades and job documents; see
§ Refs as the internal representation.

### The primitive

A ref is deterministic *and* reversible. Both properties are load-bearing and neither alone is
enough:

| Property | Why it is needed |
|---|---|
| The same `(kind, id)` always yields the same ref | A ref is identity — it keys statistics aggregation, lock partitions and websocket tenant pools, and it is how a caller holding an id queries for stored documents |
| A ref decrypts back to its id | The response boundary must return the raw id a client is owed; for fields where the document is the only copy, nothing else can reconstruct it |

Determinism comes from deriving the AES-GCM nonce from the id rather than at random — the
construction SIV mode formalises ([RFC 5297](https://www.rfc-editor.org/rfc/rfc5297),
[RFC 8452](https://www.rfc-editor.org/rfc/rfc8452)). Reusing a nonce is only unsafe across
differing plaintexts under one key; here the nonce is a function of the plaintext, so a repeat
always accompanies the identical plaintext. Rationale → [plan.md](./plan.md) § Design.

### Deriving and reading refs — `entityid`

A `Cipher` converts in both directions:

| Call | Produces |
|------|----------|
| `Character(id)` / `Corporation(id)` / `Alliance(id)` | `char_{token}` / `corp_{token}` / `alliance_{token}` |
| `Encrypt(kind, id)` | the ref for any kind |
| `Decrypt(ref)` | the kind and raw id |
| `DecryptKind(want, ref)` | the raw id, rejecting a ref of another kind |

The token is base64url without padding of the derived nonce followed by the AES-GCM ciphertext.
The kind is bound into both the nonce and the AEAD's additional data, so one numeric id yields a
different ref per kind and a ref cannot be reinterpreted as another kind. Ids of zero or below
are rejected, as is key material under 16 bytes.

Decryption also verifies that the nonce is the one its recovered id derives. Without that check a
ref could be assembled from one id's nonce and another's ciphertext; with it, the id-to-ref
mapping is one-to-one in both directions.

`New(secret)` takes key material directly. `NewFromEnv()` resolves it through
`swarmsecret.Require("ENTITY_ID_KEY")`, so the key is read from `/run/secrets` or the
environment. The encryption and nonce-derivation subkeys are derived from that one secret under
distinct labels, so operators manage a single value.

Refs carry **no key version**. There is one key and it is never rolled, so a version segment would
advertise a capability that does not exist and cost bytes in every document, Redis partition key
and log line. Rationale → [plan.md](./plan.md) § Single key, never rolled.

### Validating refs without the key

`ParseKind` returns the entity kind a ref names, reporting whether it is well formed.
`ValidShape` additionally checks the token holds only base64url characters. Neither decrypts, so
callers can validate refs without access to the secret.

### Operator surface

`ENTITY_ID_KEY` is the only entity id knob and it is a **secret**: an `EnvFields` entry that
autogenerates on first create and locks once set, registered as a Swarm secret and mounted for the
api, worker and websocket services. It is never published through the stack's public env block.

Its secrecy is the whole control. Anyone holding both the database and this key can read every
entity id; refs defend against a database leak *without* it. Keep it out of database backups and
out of anything that dumps `.env`.

It is locked because refs are identity: re-deriving them under a new key would orphan every
stored document, lock partition and routing lane that matched on the old value.

## Refs as the internal representation (landed)

Organisations are named internally by ref everywhere — Mongo documents, Redis, NATS
subjects, websocket indexes, tenant keys and log fields. A raw EVE id exists only at the
boundaries below, and is converted the moment it arrives or the moment before it leaves.

### Ingest — id to ref

| Boundary | Where | Converted by |
|----------|-------|--------------|
| ESI ids computed into a session | `auth.UpdateAccountSessionGrants` | `protectedfields.ValuesForIDs64` |
| Ids a browser names in `upgrade_scopes` | `Server.ApplyRealtimeScopeUpgrade` | `protectedfields.ValuesForIDs` |
| Ids on a job document being written | `jobdocuments` / `archivedjobs` PUT handlers | `jobidentity.Encrypt` |

`SessionGrants` persists `corporation_refs` / `alliance_refs`, so Redis session records hold
no entity ids. The websocket reads those refs straight through without converting.

`upgrade_scopes` keeps `corporationIDs` in its client message on purpose: the browser has no
key and can only name organisations by id. Anything that cannot be converted is dropped
rather than compared raw — otherwise a client could send a string that matched a grant
directly.

### Response — ref to id

`jobidentity.Decrypt` restores the raw ids on a job document immediately before it is
serialised, in every job read handler. The ref is left on the struct and suppressed on the wire
by the model's `json:"-"` tags, so a document decrypted for a response is still the document
that would be written back.

This direction is not optional. A job's linked-job corporation exists nowhere but the stored
document: converting it and then serialising without restoring it means the client echoes the
document back with the field absent, and the next write persists that absence. The ref is then
unrecoverable. `TestClientRoundTripPreservesStoredIdentity` walks the whole loop — store,
decrypt, serialise, echo, re-encrypt — and asserts the refs come back byte for byte.

### The conversion framework — `shared/protectedfields`

A `Declaration[T]` names a document type's protected fields and the spec they belong to.
`Encrypt`, `Decrypt` and `HasRawIDs` all traverse the same declaration, so they cannot
disagree about which fields hold ids. `ValuesForIDs` and `ValuesForIDs64` cover the
query direction for callers that hold ids and want to match stored refs.

Non-positive ids are refused rather than converted: a zero from a missing query parameter
would otherwise derive a valid ref for "entity zero" that matches nothing, turning a bad
request into an empty result set.

### Tenant keys are guarded

`wsplacement.TenantKeyCorporation` and `TenantKeyAlliance` accept only a well formed ref of
the matching kind and return `""` for anything else, so a caller that has not been converted
produces an empty key instead of routing on a raw id and leaking it into placement and the
client-visible affinity cookie. `TenantStringFromRouting` treats an empty key as absence and
falls through to the next lane. `TenantKeyAccount` is unguarded, because an account id is not
an entity ref.

The guard found four unconverted call sites when it was introduced — the affinity cookie
builder, the changestream publish subject and two soak-harness paths.

### Naming

A field named `…ID` means an actual EVE id and you are at a boundary. Anywhere else it is
`…Ref`. That asymmetry is the point: a raw id appearing internally reads as wrong rather
than plausible, and someone reading a log line or task payload can tell which they hold.

"Ref" names what the value *is* — a reference to an entity — not how it is produced, so it is
unaffected by the primitive behind it. `Encrypt` and `Decrypt` name the operations.

Carrying the convention: `RealtimeScopes.CorporationRefs`, `Client.grantedCorpRefs`,
`Server.corpRefToClients`, `RouteInfo.CorporationRef`, the `corporationRefs` NATS key and
the `corporation_refs` Redis handoff payload.

### Not converted

Only character, corporation and alliance ids become refs. `type_id`, `location_id`,
`region_id`, `order_id`, `job_id` and the rest name items and places, not people or
organisations, and stay as ids.

### The outward boundary

Refs must not reach a browser. Two paths carry them outward and are handled differently:

- **API reads** restore ids and keep the ref off the wire through the model's json tags — see
  § Response above.
- **`doc.update` payloads** carry routing metadata the websocket server routes on —
  `corporationRef`, `allianceRef` and `scopes` — and `outgoinglogic.ClientPayload` strips it once
  per message before delivery, rather than per recipient.

`ClientPayload` strips the top-level routing keys and then walks the document body,
replacing every ref with the id behind it. It runs on the copy handed to delivery, after
routing has been decided from the untouched message, because delivery matches on refs — a
conversion any earlier would produce a message that routes to nobody. A value that looks
like a ref but does not decrypt is dropped rather than passed through.

A ref is spelled to match the id field it stands in for, which differs by area: job bodies
mirror ESI, so `corporation_id` pairs with `corporation_ref`; `_meta` is ours and camelCase,
so `accountID` pairs with `corporationRef`. The rewrite produces the key the **client** reads,
so it must land on the model's json tag rather than on the storage convention — the two
spellings are the mechanism for that, not drift between them.

`TestClientPayloadKeysMatchTheAPIResponse` pins it by putting the same job through both
transports and comparing the delivered key sets, so a storage rename that breaks the
derivation fails there rather than in the browser.

`models.MetaData` declares `CorporationRef` / `AllianceRef` so the changestream reads the
field names from the model rather than matching a bare string.

The body walk is exercised now — every job `doc.update` carries refs on the sale and
linked-job lines. The top-level routing strip is not: no document carries
`_meta.corporationRef` until corporation and alliance documents land, and the org-scoped path
is built ahead of them deliberately. What such a document has to supply for the existing
machinery to carry it is set out in
[archived-jobs-stats/overlay.md](../archived-jobs-stats/overlay.md) § What a corporation
document has to supply.

## Login backfill

_Not landed._

Fill in: what login repairs for legacy accounts, failure policy, and why the check stays permanent.

## Entitlements store and recompute

_Not landed._

Fill in: snapshot shape, what triggers recompute, TTL policy, and how websocket sessions learn a
version changed.

## Authorization cutover

_Not landed._

Fill in: how API and websocket checks read entitlements, and what the dual-read period looks like
while both paths are live.

## Missing live SoT found during this work

Drafts for documentation that should exist but does not, written here first and promoted when the
project closes.

_None recorded yet._
