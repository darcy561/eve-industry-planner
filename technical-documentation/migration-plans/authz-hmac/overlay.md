# AuthZ HMAC — behaviour overlay

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).

While this project is active, this file is the overlay on top of live SoT: where it describes a
surface, it wins for that in-flight work. Where it is silent, live documentation remains the truth.

Each rollout phase fills its section as it lands — what changed, and how that part works
afterwards. Empty sections mean the phase has not landed.

## Current behaviour (before this project)

Identity is keyed on `character_hash`, and authorization decisions read what the session carries
rather than a server-side entitlements snapshot. Raw EVE entity ids appear in stores that back
those decisions. There are no HMAC-derived refs in the codebase.

Live detail: [backend/api/auth/overview.md](../../backend/api/auth/overview.md).

## Refresh token encryption (landed)

ESI refresh tokens are encrypted at rest. `models.RefreshToken` persists `rTokenCiphertext`,
`rTokenNonce`, and `rTokenKeyVersion`; plaintext is produced only at use time. The AES-GCM keyring
is built by `crypto/aesgcm/keyrings.NewRefreshTokenKeyringSpec`, which takes key material from
`swarmsecret.Require("REFRESH_TOKEN_AES_KEY")` and the version from
`REFRESH_TOKEN_AES_KEY_VERSION`, defaulting to `v1`.

This was the plan's blocking security milestone and no longer gates later phases.

## Shared HMAC helpers

Two packages under `shared/crypto/authzhmac` derive and validate entity refs. Nothing calls them
yet; the metadata schema work is their first consumer.

### Deriving refs — `authzhmac/helper`

A `Helper` derives refs under one key version:

| Call | Produces |
|------|----------|
| `RefFromCharacterID(id)` | `{version}_char_{token}` |
| `RefFromCorporationID(id)` | `{version}_corp_{token}` |
| `RefFromAllianceID(id)` | `{version}_alliance_{token}` |

The token is base64url without padding of `HMAC-SHA256(key, "{kind}:{id}")`. The kind is part of
the HMAC input, so one numeric id yields a different token per entity kind. Ids of zero or below
are rejected, as is key material under 16 bytes.

`New(version, key)` takes key material directly. `NewFromEnv()` resolves it through
`swarmsecret.Require("AUTHZ_HMAC_KEY")`, so the key is read from `/run/secrets` or the
environment, and reads the version from `AUTHZ_HMAC_KEY_VERSION`, defaulting to `v1`.

Determinism holds for a given `(kind, id, key version)` while that key is active. A different key
produces different tokens for the same id, which is why the version is stamped into the ref.

### Validating refs — `authzhmac/ref`

`ParseRefVersion` splits a ref into version and kind, reporting whether it is well formed.
`ValidateRefShape` additionally checks the token holds only base64url characters. Neither touches
key material, so callers can validate refs without access to the secret.

### Operator surface

`AUTHZ_HMAC_KEY` was already provisioned: an `EnvFields` entry that autogenerates on first create
and locks once set, registered as a Swarm secret and mounted for the api and worker services.

`AUTHZ_HMAC_KEY_VERSION` is new — a hidden `EnvFields` entry defaulting to `v1`, published to
containers through the stack's public env block. It is not secret. Changing it changes every ref
derived afterwards, so stored refs from an earlier version stay readable only if that version's
key is still what the helper holds.

## Metadata schema and reverse indexes

_Not landed._

Fill in: persisted fields added, the `character_ref -> account_id` index, and which stores stop
carrying raw entity ids.

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

**Broken plan links in the auth roadmap.** [backend/api/auth/roadmap.md](../../backend/api/auth/roadmap.md)
lists two related rollouts with paths that do not resolve from its own location — this project's
plan and the refresh-token encryption plan both live under `migration-plans/`, not beside the auth
docs. Both links predate this project and are not corrected here, because live SoT is not edited
while a project is active. Fix them on promote.
