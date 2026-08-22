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

Current names, their owner, and the target. **Nothing here is applied yet** — this is the agreed
destination, and collections move individually.

| Current | Scope | Target | Client-visible |
|---------|-------|--------|----------------|
| `users` | account | `accounts` | yes |
| `application_settings` | account | `account_settings` | yes |
| `jobs` | account | `account_jobs` | yes |
| `archivedJobs` | account | `account_archived_jobs` | yes |
| `user_job_documents` | account | `account_job_documents` | yes |
| `user_job_groups` | account | `account_job_groups` | yes |
| `build_stats` | account | `account_production_totals` | yes — defer to Stage E |
| `user_watchlist_deprecated` | account | `account_watchlist_deprecated` | yes |
| `user_group_template_catalog` | account | `account_group_template_catalog` | no |
| `user_group_template_payloads` | account | `account_group_template_payloads` | no |
| `user_archived_job_stats` | account | `account_archived_job_stats` | no |
| `user_rollup_buckets` | account | `account_timeline_months` (name also changing — see [archived-jobs-stats](../archived-jobs-stats/plan.md) § Stage D) | no |
| `stats_rebuild_queue_accounts` | account | `account_stats_rebuild_queue` | no |
| `citadel_names` | shared | `shared_citadel_names` | no |
| `blueprints` | shared | `shared_blueprints` | in a group, but unscoped |

`users` becomes plain `accounts`, not `account_accounts`: the collection *is* the account records,
so the tier word is the noun rather than a prefix on one. Everything else is a thing an account
owns, and reads as `account_<noun>`.

`archivedJobs` is also the only camelCase name; it is snake_cased by the same move.

`user_watchlist_deprecated` is **kept**, so it is renamed with the rest. The `deprecated` suffix
describes the feature's status and is left alone; this project changes the scope prefix only.

## How a rename lands

The mechanism exists: `CollectionRenames` in
[`deployment-tool/internal/dataplane/mongo/renames.go`](../../../deployment-tool/internal/dataplane/mongo/renames.go),
applied by `eip ensure-mongo` before preimages and indexes, using Mongo's atomic
`renameCollection`. It is idempotent — a rename whose source is gone is skipped — and refuses to act
when both names exist, because two populated collections need a human to say which survives.

A rename is **four coordinated edits**, and the tests fail until all four agree:

1. The constant in `services/shared/mongo/names.go` and its `TestCollectionNames_canonical` row
2. Index specs in `deployment-tool/internal/dataplane/mongo/index_specs.go`
3. The preimage list in `deployment-tool/internal/dataplane/mongo/preimage.go`, where the collection appears
4. A `CollectionRenames` entry, so deployed databases move with the code

Nothing else makes this fail. An index spec naming a collection nothing reads is silent — Mongo
creates the collection to hold the index rather than erroring — so a half-finished rename surfaces
only as missing data. `TestCollectionNames_canonical`,
`TestIndexSpecCollectionsAreKnown`, `TestPreimageCollectionsAreKnown` and
`TestCollectionRenamesAgreeWithKnownNames` exist to convert that silence into a failing build.

**Order within one rename:** ship the code and the `CollectionRenames` entry together. `Ensure`
moves the data before the new code reads it, and the old code is already gone.

## Client-visible names

Some collection names are not private storage detail. They appear in the changestream collection
groups (`services/core/changestream/collection_groups.go`) and, for most, the websocket subscribe
allow-list (`services/websocket/server/subscribe_auth.go`), so the name is part of a live
subscription surface the SPA uses:

| Collection | Changestream group | Subscribe allow-list |
|------------|--------------------|----------------------|
| `users` | account | no |
| `application_settings` | account | no |
| `user_watchlist_deprecated` | account | no |
| `jobs` | planner | yes |
| `user_job_documents` | planner | yes |
| `user_job_groups` | planner | yes |
| `archivedJobs` | archive_and_stats | yes |
| `build_stats` | archive_and_stats | yes |
| `blueprints` | blueprints | no |

Renaming one of these breaks realtime delivery unless the SPA moves in the same change. They are not
blocked, only more expensive — each needs its frontend subscription updated and shipped with the
backend. The two lists are separate: a collection can be watched without being directly
subscribable, so both need checking, not just the allow-list.

`build_stats` is the clearest case to defer: [archived-jobs-stats](../archived-jobs-stats/plan.md)
Stage E retires the endpoint that reads it, so renaming it before then is work that Stage E would
redo.

## Suggested order

1. **Collections with no client coupling first** — `user_archived_job_stats`,
   `stats_rebuild_queue_accounts`, `user_rollup_buckets`, the template collections. These prove the
   mechanism on collections whose only readers are backend code.
2. **The shared collections and `user_watchlist_deprecated`** — `citadel_names` has no client
   coupling at all; `blueprints` and the watchlist are watched by a changestream group but nothing
   subscribes to either directly, so they are cheaper than the rest of the client-visible set
   without being free.
3. **Client-visible collections**, one at a time, each with its SPA subscription change.
4. **`build_stats`** last, folded into archived-jobs-stats Stage E.

## Done when

- Every collection carries a scope prefix — `account_`, `corporation_`, `alliance_` or `shared_` —
  and no collection uses `user_`. `accounts` is the one bare name, because the tier word is its noun.
- An unprefixed collection is therefore a defect: something nobody has classified.
- The naming convention is promoted into live SoT beside the Mongo access layer, so the next new
  collection is named correctly without reading this plan.

## Handoff status

**Phase 1 only.** The rename mechanism and its drift guards are written; no collection has been
renamed and `CollectionRenames` is empty.

**The mapping is settled.** Every collection has an agreed target name; no naming questions remain
open. Work from the table in § Mapping rather than re-deriving it.

**Start here:** rename one backend-only collection end to end to prove the four-edit flow before
batching the rest. `user_archived_job_stats` → `account_archived_job_stats` is the cleanest
candidate: this project owns it, nothing subscribes to it, and its documents are rebuilt from
archived jobs anyway.

Then verify the guards actually caught a mistake, rather than assuming: change the name in one
module only and confirm the other module's test fails. Both directions were checked when the guards
were written, and a rename is the point at which that matters.

### What a rename touches

For `user_archived_job_stats` → `account_archived_job_stats`, all four in one change:

1. `CollectionArchivedJobStats` in `services/shared/mongo/names.go`, plus its row in
   `TestCollectionNames_canonical`
2. Two `IndexSpec` entries in `deployment-tool/internal/dataplane/mongo/index_specs.go`
3. Not in the preimage list, so nothing to do there — but check, because most collections are
4. A `CollectionRenames` entry in `deployment-tool/internal/dataplane/mongo/renames.go`, whose
   `From` must no longer appear in that module's `knownCollections`

The Go symbol `ArchivedJobStats` (the `Docs` handle) and `ArchivedJobStatsDocumentID` are separate
from the collection name and need not move in the same change; decide deliberately rather than
letting a find-and-replace decide.

Verify with `eip ensure-mongo` against a deployed stack — the rename is applied by `Ensure`, so it
is not exercised by unit tests alone.
