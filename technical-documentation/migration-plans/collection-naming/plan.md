# Collection naming — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Name every Mongo collection for the scope of its documents, so who can see a row is legible from the
collection name and adding a corporation- or alliance-scoped equivalent is a prefix rather than a
new vocabulary. This mirrors the endpoint and websocket surfaces, which already scope by
account / corporation / alliance.

`jobs` becomes `account_jobs`; a future corporation equivalent is `corporation_jobs`.

## The convention

```
<owner>_<noun>
```

`<owner>` is the tier whose identity **scopes the documents** — the thing a query filters on to
decide which rows a caller may see.

The planner has four tiers, and they are not interchangeable:

| Tier | Identity | Note |
|------|----------|------|
| Account | `accountID`, derived from the EVE main character hash | The login. One account, one main character |
| Character | a linked character | An account attaches **several** in-game characters |
| Corporation | `corporationRef` | An account sees corporations it holds grants for |
| Alliance | `allianceRef` | Same, one level up |

**Every collection today is scoped by account.** Without exception they filter on
`_meta.accountID`; `characterHash` appears only as a field *inside* job documents, recording which
character earned a transaction, and never as a collection key. So the prefix is `account_`.

`character_` is deliberately **not** used yet. Naming an account-scoped collection `character_jobs`
would assert a scope the data does not have — the collection holds every job across all characters
on the account, and no query narrows to one character. The prefix is reserved for collections that
are genuinely character-keyed if per-character scoping is ever built, at which point they are new
collections rather than renamed ones.

**Reference data that every caller reads identically takes `shared_`.** It has no owning entity, and
naming it for one would imply a scoping that does not exist. `shared_` states that positively rather
than leaving those collections as the unprefixed remainder, so an unprefixed name is a collection
nobody has classified yet rather than a deliberate choice.

| Kind | Test | Prefix |
|------|------|--------|
| Entity data | The rows a caller sees depend on which account / corporation / alliance they are | `account_` / `corporation_` / `alliance_` |
| Shared reference | Every caller reads the same rows regardless of who they are | `shared_` |

`shared_` is about **scope, not mutability**: `shared_blueprints` is rebuilt from the SDE and
`shared_citadel_names` is written by users submitting names they have seen, but both serve every
caller the same rows.

`user_` is retired as a prefix. It is ambiguous between the account and the several characters
attached to it, which is exactly the distinction the tiers above exist to keep visible.

## Mapping

Every collection, its scope, and the name it carries. All fifteen renames are applied in code and
declared in `CollectionRenames`.

| Name | Scope | Renamed from | Client-visible |
|------|-------|--------------|----------------|
| `accounts` | account | `users` | yes |
| `account_settings` | account | `application_settings` | yes |
| `account_jobs` | account | `jobs` | yes |
| `account_archived_jobs` | account | `archivedJobs` | yes |
| `account_job_documents` | account | `user_job_documents` | yes |
| `account_job_groups` | account | `user_job_groups` | yes |
| `account_production_totals` | account | `build_stats` | yes |
| `account_watchlist_deprecated` | account | `user_watchlist_deprecated` | yes |
| `account_group_template_catalog` | account | `user_group_template_catalog` | no |
| `account_group_template_payloads` | account | `user_group_template_payloads` | no |
| `account_archived_job_stats` | account | `user_archived_job_stats` | no |
| `account_timeline_months` | account | `user_rollup_buckets` | no |
| `account_stats_rebuild_queue` | account | `stats_rebuild_queue_accounts` | no |
| `shared_citadel_names` | shared | `citadel_names` | no |
| `shared_blueprints` | shared | `blueprints` | in a group, but unscoped |

`users` became plain `accounts`, not `account_accounts`: the collection *is* the account records, so
the tier word is the noun rather than a prefix on one. Everything else is a thing an account owns,
and reads as `account_<noun>`.

`account_watchlist_deprecated` keeps its `deprecated` suffix — that describes the feature's status,
and this convention governs the scope prefix only.

Collections added since carry the convention without a rename entry: `account_stats_reconcile_rota`
is one.

## How a rename lands

The mechanism is `CollectionRenames` in
[`deployment-tool/internal/dataplane/mongo/renames.go`](../../../deployment-tool/internal/dataplane/mongo/renames.go),
applied by `eip ensure-mongo` before preimages and indexes, using Mongo's atomic
`renameCollection`. It is idempotent — a rename whose source is gone is skipped — and refuses to act
when both names exist, because two populated collections need a human to say which survives.

A rename is **four coordinated edits**, and the tests fail until all four agree:

1. The constant in `services/shared/mongo/names.go` and its `TestCollectionNames_canonical` row.
   Rename the constant with the value when the old identifier would contradict it — a
   `CollectionUserGroupTemplateCatalog = "account_group_template_catalog"` reads as a bug at every
   call site. A `Docs` handle or an `_id` builder is a separate decision, since those name the data
   rather than the collection.
2. Every `IndexSpec` naming it in `deployment-tool/internal/dataplane/mongo/index_specs.go`
3. The preimage list in `deployment-tool/internal/dataplane/mongo/preimage.go`, if it appears there
4. A `CollectionRenames` entry, whose `From` must no longer appear in that module's
   `knownCollections`, so deployed databases move with the code. Give it **the next
   `Version`** — see § Structural versions below; an entry at a version the database has
   already recorded never runs, and `TestEveryRenameIsReachable` catches that

Nothing else makes this fail. An index spec naming a collection nothing reads is silent — Mongo
creates the collection to hold the index rather than erroring — so a half-finished rename surfaces
only as missing data. `TestCollectionNames_canonical`, `TestIndexSpecCollectionsAreKnown`,
`TestPreimageCollectionsAreKnown` and `TestCollectionRenamesAgreeWithKnownNames` exist to convert
that silence into a failing build.

**Then sweep the repo for the literal old name.** Those four edits are what *fails a build*; they
are not what *mentions the name*. Comments are guarded by nothing, and stale ones have survived in
Go comments, `services/shared/models` files and frontend endpoint modules — the last invisible to
any Go-scoped search. Grep every text file, not just `*.go`, and exclude `node_modules`,
`frontend/dist` and `.tmp` (all generated). Expect the only surviving hits to be the `From:` fields
in `CollectionRenames` and the mapping table above.

### Structural versions

Each rename carries the structural `Version` it belongs to, and the database records the highest
version it has reached in `shared_deploy_state` (`{_id: "dataplane", version, updatedAt}`). `Ensure`
reads that once and skips every rename at or below it, so a settled database costs a single read
rather than one `docker exec` per entry — the fifteen renames of this project are all version 1.

The version is written only after the renames it covers have all succeeded, so a failure part way
through leaves the old number and the next run retries from there. A database recording a version
above the binary's — an older tool against a newer database — is left alone rather than wound back,
and says so on the console.

The state collection is the Deployment Tool's own: no service reads it, so it is deliberately absent
from `services/shared/mongo/names.go` and from the `knownCollections` mirror, and
`TestDeployStateCollectionIsNotAServiceCollection` keeps it that way. It takes the `shared_` prefix
because its single row means the same thing to every caller.

The per-rename guard in the JavaScript stays underneath all this: a rename whose source is gone is
still skipped, and one where both names exist still refuses to act. The version gate saves the round
trip; it is not the thing keeping a rename safe.

**Order within one rename:** ship the code and the `CollectionRenames` entry together. `Ensure`
moves the data before the new code reads it, and the old code is already gone.

**Rebuild the Deployment Tool binary before running `ensure-mongo`.** The renames live in that
binary, not in the stack, so a binary built before the entry was added applies the list it was
compiled with and reports success. Nothing detects this: a binary declaring no renames and a
database with nothing left to rename produce identical output. Build from `deployment-tool/`, then
verify with `grep -c <new-collection-name>` against the binary.

**`eip dev` alone does not apply renames.** It skips the Ready phase — and with it `EnsureMongo` —
when the stack is already healthy, which it is on a redeploy. Run `eip ensure-mongo` explicitly
after deploying code that expects renamed collections. Until it runs, services read collections that
do not exist and return empty rather than failing, so the app looks like an empty account rather
than a broken one.

**Index names carry the prefix too**, and changing them is cosmetic on an existing database.
`renameCollection` carries indexes across under the names they already had. `Ensure` then tries to
create the new name over the same keys, which Mongo rejects with code 85
(`IndexOptionsConflict`) — and `ensureIndexes` treats that as idempotent, so nothing happens and the
index keeps its old name. Index names in a long-lived environment therefore reflect when they were
created, not what the specs currently say; a fresh database gets the new names. Dropping and
recreating to align them is a deliberate choice, not something `Ensure` will do.

## Client-visible names

Some collection names are not private storage detail. They appear in the changestream collection
groups (`services/core/changestream/collection_groups.go`) and, for most, the websocket subscribe
allow-list (`services/websocket/server/subscribe_auth.go`), so the name is part of a live
subscription surface the SPA uses:

| Collection | Changestream group | Subscribe allow-list |
|------------|--------------------|----------------------|
| `accounts` | account | no |
| `account_settings` | account | no |
| `account_watchlist_deprecated` | account | no |
| `account_jobs` | planner | yes |
| `account_job_documents` | planner | yes |
| `account_job_groups` | planner | yes |
| `account_archived_jobs` | archive_and_stats | yes |
| `account_production_totals` | archive_and_stats | yes |
| `shared_blueprints` | blueprints | no |

Renaming one of these breaks realtime delivery unless the SPA moves in the same change. The two
lists are separate: a collection can be watched without being directly subscribable, so both need
checking, not just the allow-list.

**The expense is the SPA, not the backend.** Both files reference the `eipmongo.Collection*`
constants rather than string literals, as do the `Docs` handles in `store.go` and
`SchemaMaintainedCollections`, so a rename reaches them through the compiler and cannot drift
silently. What breaks is the wire: the SPA subscribes by literal collection name, and nothing on the
Go side can catch that.

**Deploy the SPA and the backend together.** The websocket wire format is `collection.docID`, so an
old SPA against a renamed database subscribes to names the allow-list no longer recognises, and
realtime goes quiet with no error on either side.

## Promotion

**Done.** The convention lives in [`backend/shared/mongo.md`](../../backend/shared/mongo.md)
§ Collection naming — the four prefixes, the scope test, why `character_` is reserved, and the
cross-module pinning — so the next new collection is named correctly without reading this plan.
[`backend/shared/contents.md`](../../backend/shared/contents.md) carries the task-map row, and the
document-lock docs carry the collection names themselves, because that API takes a collection name
as a **request field** rather than as an implementation detail.

§ How a rename lands stayed here: it is migration process, and live docs should not teach a rename
procedure as though it were routine work.

This folder outlives the promote only because the active
[archived-jobs-stats](../archived-jobs-stats/plan.md) plan cites its renames; it goes when that
project closes.

## Done when

- ~~Every collection carries a scope prefix~~ — **done.** No collection uses `user_`, and `accounts`
  is the one bare name because the tier word is its noun. An unprefixed collection is now a defect:
  something nobody has classified.
- ~~The naming convention is promoted into live SoT~~ — **done.** See § Promotion.
- ~~`eip ensure-mongo` has been run against the deployed stack and every collection moved with its
  indexes~~ — **done.** The deployed stack runs the renamed collections.

Nothing is outstanding. This folder survives only until archived-jobs-stats closes.
