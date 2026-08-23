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
| `build_stats` | account | `account_production_totals` | yes — done |
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

**The expense is the SPA, not the backend.** Both files reference the `eipmongo.Collection*`
constants rather than string literals, as do the `Docs` handles in `store.go` and
`SchemaMaintainedCollections`, so a rename reaches them through the compiler and cannot drift
silently. What breaks is the wire: the SPA subscribes by literal collection name, and nothing on the
Go side can catch that.

`build_stats` was planned as the clearest case to defer, on the grounds that
[archived-jobs-stats](../archived-jobs-stats/plan.md) Stage E retires the endpoint reading it. It
moved with the rest anyway — see § Handoff status. The **collection** is now
`account_production_totals`, and the endpoint that read it has since been retired: the SPA reads
`GET /api/v1/statistics/account/totals`, which serves the same documents.

## Suggested order

**All fifteen renames have landed.** The order below is kept because it records why some
collections were cheaper than others, which is the reusable part; the status is in § Handoff status.

1. ~~Collections with no client coupling first~~ — the statistics rows, the rebuild queue and the
   two template collections. These proved the mechanism on collections whose only readers are
   backend code.
2. ~~The shared collections and the watchlist~~ — `citadel_names` had no client coupling at all;
   `blueprints` and the watchlist are watched by a changestream group but nothing subscribes to
   either directly.
3. ~~Client-visible collections~~ — each needed its SPA subscription changed in the same move.
4. ~~`build_stats`~~ — landed here rather than with Stage E; the endpoint it feeds did not move.

## Promotion

**Done.** The convention and the corrected names are in live SoT; this folder keeps the history.

### What was promoted

| Live doc | Change |
|----------|--------|
| [`backend/shared/mongo.md`](../../backend/shared/mongo.md) | New § Collection naming — the four prefixes, the scope test, why `character_` is reserved, and the cross-module pinning. Handle-surface table now names each collection |
| [`backend/shared/contents.md`](../../backend/shared/contents.md) | Task-map row: naming a new collection |
| [`backend/api/document-lock/overview.md`](../../backend/api/document-lock/overview.md) | 6 collection names in the `collection` field description, JSON examples and sequence diagram |
| [`backend/api/document-lock/locks.md`](../../backend/api/document-lock/locks.md) | 5 — endpoint → collection table, group-promotion step, cascade rule |
| [`backend/api/document-lock/roadmap.md`](../../backend/api/document-lock/roadmap.md) | Documents row |
| [`frontend/document-lock/spa.md`](../../frontend/document-lock/spa.md) | `resolveDocumentLockApiTarget` mapping |

The document-lock docs carried the most because that API takes a collection name as a **request
field**, so the name is a published contract there rather than an implementation detail.

**The auth docs were not stale.** An earlier draft of this section listed
`backend/api/auth/overview.md` and `roadmap.md` for their `application_settings` mentions. Those are
JSON **wire field** names (`json:"application_settings"` in `session_types.go`), not collection
names, and the rename did not touch them. Left alone.

### Other migration plans

All six project folders were swept for old collection names. Two needed correcting, and the
distinction between them is the rule to apply next time:

| Project | Verdict |
|---------|---------|
| **websocket-realtime** (active) | **Corrected.** `implementation.md` and `readme.md` are current-behaviour references — the subscribe ACL, the SPA routing table, the sync cursor key `account_job_documents.{jobID}` — and were describing collections that no longer exist |
| **archived-jobs-stats** (active) | **Corrected** — index table, preimage note and schema-maintenance line |
| **swarm-stack** (closed) | Left alone. Its `promote/` folder is explicitly "copies of live at promote time"; rewriting a point-in-time snapshot would falsify the record |
| **changestream-tenant-scale** | No change needed. Its `blueprints` mention is a changestream **group** name, not a collection, and groups did not move |
| **entity-id-encryption** | Clean |

**History keeps its original names; current-behaviour text does not.** Within
websocket-realtime the same folder holds both: `interactions.md` is a dated decision log,
`plan-snapshot.md` a snapshot and `plan-todo-tracker.md` a done-list, so all three keep the names
that were true when written. Only the two "as built" references were rewritten.

Go and JS identifiers were left alone throughout — `USER_JOB_GROUPS_COLLECTION` and
`handlers/userJobGroupsDocument.js` are real symbols that did not change, and only the collection
strings did.

### What stayed here

§ How a rename lands and § What a rename touches are migration process, not current behaviour. Live
docs should not teach a rename procedure as though it were routine work.

### Still open

Promotion was approved and applied ahead of the live-database verification that § Handoff status
calls for. `eip ensure-mongo` has **not** been run against a deployed stack: the running services
are on images built before the rename, so the database still holds the old collection names. Live
docs therefore describe the code as it stands, not the deployed database, until that runs.

## Done when

- ~~Every collection carries a scope prefix~~ — **done in code.** No collection uses `user_`, and
  `accounts` is the one bare name because the tier word is its noun. An unprefixed collection is
  now a defect: something nobody has classified.
- `eip ensure-mongo` has been run against a deployed stack and every collection moved with its
  indexes. **Open** — see § Handoff status.
- ~~The naming convention is promoted into live SoT~~ — **done.** It lives in
  [`backend/shared/mongo.md`](../../backend/shared/mongo.md) § Collection naming, so the next new
  collection is named correctly without reading this plan. See § Promotion.

## Handoff status

**Every collection in § Mapping has been renamed.** `CollectionRenames` carries all fifteen entries,
with the constants, index specs, preimage list, both modules' name tests and the SPA's collection
strings updated to match. Both Go modules and the SPA's 194 frontend tests pass.

The constants were renamed alongside their values, so `CollectionUsers` is now `CollectionAccounts`
and `CollectionBuildStats` is `CollectionAccountProductionTotals`. Index name prefixes moved too:
`ujg_` → `ajg_`, `uwd_` → `awd_`, `ujd_` → `ajd_`, `urb_` → `atm_`, `uajs_` → `aajs_`.

**Not yet verified against a live database.** This is the one open item. The renames are applied by
`Ensure`, so no unit test exercises them, and fifteen at once is a much larger first run than the
mechanism has ever done. `renameCollection` refuses when both names exist, so an environment part
way through a manual rename needs resolving by hand first. Run `eip ensure-mongo` against a deployed
stack and confirm every collection moved and kept its indexes.

**Two renames overtook the project that owned them.** `user_rollup_buckets` →
`account_timeline_months` belonged to archived-jobs-stats Stage D and `build_stats` →
`account_production_totals` to Stage E. Both moved here instead:

- `account_timeline_months` is consistent: the `rollup` → `timeline` vocabulary landed separately
  and the word no longer appears in `services/`, so the collection name and the code around it
  agree. Nothing is outstanding for that one.
- `GET /api/v1/statistics/build-stats` is gone. The SPA moved to
  `GET /api/v1/statistics/account/totals` and the old handler was deleted rather than renamed,
  since totals already served the same documents from `account_production_totals`.

**Deploy the SPA and the backend together.** Six of these collections are subscribed to over the
websocket, whose wire format is `collection.docID`. An old SPA against a renamed database subscribes
to names the allow-list no longer recognises, and realtime goes quiet with no error on either side.

**Start here:** § Promotion below. The code work is done; what remains is verifying it against a
live database and moving the convention into live SoT.

### What a rename touches

Four coordinated edits, all in one change:

1. The constant in `services/shared/mongo/names.go`, plus its row in `TestCollectionNames_canonical`
2. Every `IndexSpec` naming it in `deployment-tool/internal/dataplane/mongo/index_specs.go`
3. The preimage list in `deployment-tool/internal/dataplane/mongo/preimage.go`, if it appears there
4. A `CollectionRenames` entry, whose `From` must no longer appear in that module's
   `knownCollections`

**Then sweep the repo for the literal old name.** Those four edits are what *fails a build*; they
are not what *mentions the name*. Comments are guarded by nothing, and the four renames above left
stale ones in `services/shared/mongo/build_stats.go`, two `services/shared/models` files and
`frontend/src/Functions/Endpoints/Pirivate/groupTemplates.js` — the last invisible to any Go-scoped
search. Grep every text file, not just `*.go`, and exclude `node_modules`, `frontend/dist` and
`.tmp` (all generated). Expect the only surviving hits to be the `From:` fields in
`CollectionRenames` and the history in these plans.

**Also rename the constant itself when its name contradicts the value.**
`CollectionUserGroupTemplateCatalog = "account_group_template_catalog"` reads as a bug at every call
site. The constants for the four renamed collections were moved with them; a `Docs` handle or an
`_id` builder is a separate decision, since those names describe the data rather than the
collection.

**Index names carry the prefix too**, and renaming them is cosmetic on an existing database.
`uajs_…` became `aajs_…` when `user_archived_job_stats` moved, but `renameCollection` carries
indexes across under the names they already had. `Ensure` then tries to create `aajs_…` over the
same keys, which Mongo rejects with code 85 (`IndexOptionsConflict`) — and `ensureIndexes` treats
that as idempotent, so nothing happens and the index keeps its old name.

The result is a database where indexes read `uajs_…` while the specs say `aajs_…`. Harmless — the
keys are what matter and only one index exists — but it means index names in a long-lived
environment reflect when they were created, not what the specs currently say. A fresh database gets
the new names. Dropping and recreating to align them is a deliberate choice, not something `Ensure`
will do.
