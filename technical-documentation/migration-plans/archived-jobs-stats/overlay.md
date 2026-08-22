# Archived jobs statistics — behaviour overlay

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).

While this project is active, this file is the overlay on top of live SoT: where it describes a
surface, it wins for that in-flight work. Where it is silent, live documentation remains the truth.

Each stage fills its section as it lands — what changed, and how that part works afterwards. Empty
sections mean the stage has not landed.

## Current behaviour (before this project)

Archived jobs are aggregated into one flat document per account and item type, mirroring the shape
the planner used before the Mongo move. There is no time dimension, no snapshot history, and no
corporation-level view. The statistics API exposes a single build-stats read.

Live detail: [backend/contents.md](../../backend/contents.md).

## Stage A — data model and Mongo layer

_Partially landed: entity refs on job documents, the statistics models, the account-scoped
Mongo layer and index specs. Corporation scope waits for Stage C; partial indexes wait for
Stage D._

### Entity refs on job documents

Corporation and character ids on a job's sale and linked-job lines are stored as **refs**,
never as raw ids. A ref is deterministic, so a caller holding an id derives the same ref and
queries on it; it is also reversible, so the response boundary restores the id a client is
owed.

Refs are owned by the [entity id encryption project](../entity-id-encryption/plan.md) — this
project consumes them. Mechanism, key handling and the single-key decision live there.

**`shared/protectedfields`** is the framework. A `Declaration[T]` names a document type's
protected fields and the spec they belong to, and `Encrypt`, `Decrypt` and `HasRawIDs` all
traverse that one declaration, so they cannot disagree about which fields carry identity. `ValuesForIDs` covers the query direction, converting ids a caller already
holds.

**`shared/jobidentity`** declares the job document: a corporation and a character target on
every transaction, market order, broker fee and linked job, so the count scales with the
document rather than being fixed. Adding an identity-bearing line type means adding it there
and nowhere else.

The model convention makes the boundary visible in the type:

| Field | Tags | Meaning |
|-------|------|---------|
| `CorporationID int` | `json:"corporation_id"` `bson:"-"` | client-facing only, never persisted |
| `CorporationRef string` | `json:"-"` `bson:"corporationRef"` | stored, never sent |

`LinkedESIJob.CorporationID` is the one exception: it keeps `bson:"corporation_id,omitempty"`
because the backfill selects on that field to find documents predating conversion. It is
cleared on write like every other id, so no converted document carries one.

`Job.Protected` records which field set a document was written under
(`models.FieldProtection`), so a backfill can find documents predating a later declaration
rather than guessing from field presence. It lives in `models` because it is a persisted
shape; `models` does not import the packages that transform it.

**Conversion happens on write, restoration on read.** `PUT /job-documents` and
`PUT /archived-jobs` convert before the document reaches Mongo; every job read handler calls
`jobidentity.Decrypt` before serialising, so the response carries ids and the ref stays off
the wire through the model's json tags.

Restoration is not cosmetic. A linked job's corporation exists nowhere but the stored
document, so serialising without restoring it means the client echoes the document back with
the field absent and the next write persists that absence — destroying the ref. That loop is
pinned by `TestClientRoundTripPreservesStoredIdentity`, which stores, decrypts, serialises,
echoes and re-encrypts, and asserts the refs return byte for byte.

A second test asserts the response carries the raw ids and none of the stored refs.

**Backfill.** `eip cli encodeJobIdentity` fans out one task per account holding documents
that still carry raw ids, or that were written under an older field set, and workers
convert. Re-running is safe and is how progress is measured: with `--dry-run` the queued
count is the work remaining.

Against production **1,404 documents** carry a raw id — 131 in `user_job_documents` and
1,273 in `archivedJobs`, all `linkedJobs[].corporation_id`. Nothing else persists an entity
id: transactions, market orders and broker fees identify a character by `CharacterHash`,
which EVE supplies, and record only whether a line was a corporation one.

The sweep is wider than that number. A document also qualifies when its `protected.spec` is
missing or older than the current field set, which is true of every job written before this
project — roughly 41,500 documents across the two collections. Each is rewritten once and
then stops matching, so the backlog does drain; the 1,404 figure is how many hold a raw id to
convert, not how many the sweep visits.

**Wire compatibility:** breaking for `linkedJobs[].corporation_id`, which becomes
`corporationRef`. Additive elsewhere. No ref has ever been written to the production
database, so there is no stored ref to migrate.

### Statistics models

The persisted shapes for account and corporation statistics, in `shared/models`.

Measures that every aggregate shares are declared once and embedded with `bson:",inline"`, so the
stored documents and JSON stay flat while a new measure lands in a single struct:

| Shared struct | Fields | Embedded by |
|---------------|--------|-------------|
| `BuildMeasures` | totalJobs, itemBuildCount, buildCostTotal, brokersFeeTotal, transactionFeeTotal, jobCostTotal, salesTotal, profitLoss | `BuildStatsRow`, `CorpBuildStatsRow`, `BuildStatsSegmentTotals` |
| `SalesMeasures` | transactionCount, quantitySold, salesTotal, jobCostTotal, extraCategoryTotals, transactionFeeTotal, brokersFeeTotal, profitLoss | `BuildStatsRollupTotals`, `UserRollupMonthlyBucket`, `CorpRollupMonthlyBucket`, both timeline buckets |
| `CalendarMonth` | year, month | every monthly bucket and timeline entry |
| `ArchivedJobCostTotals` | the seven per-job cost totals | `ArchivedJobStats` |
| `ArchivedJobLine` | orderID, date, year, month, amount, isCorp, corpStatus, resolvedCorpRef | `ArchivedJobTransactionLine`, `ArchivedJobFeeLine` |

Summation lives with the measures as `Plus` methods rather than free functions per row type;
`SalesMeasures.Plus` merges `extraCategoryTotals` by category id without mutating either operand.
Tests assert that each embedding marshals flat in both BSON and JSON, so an omitted `inline` tag
fails the build rather than silently nesting a document.

`corpStatus` values (`personal`, `corp_known`, `corp_unknown`) are the `ArchivedJobCorpStatus`
constants instead of bare strings.

The segment breakdown keeps three named fields — `productionChain`, `retainedStock`,
`standaloneRecordedSale`. A map keyed by segment const was considered: it would make a fourth
segment a one-const change, but segments are a closed classification that changes far less often
than measures, and named fields keep the compiler checking producers.

**Wire compatibility:** additive for the statistics shapes, which no document uses yet.
`BuildStatsRow` keeps `dataSnapshots` — the current build-stats endpoint serves it and the SPA reads
it in three places, so it stays until Stage E moves the frontend off it. Embedding does not change
the stored or served shape of any existing document.

### Also landed

Two `go fix` items in `shared/models`, both removing an `omitempty` that never applied to its type
(a `time.Time` in `group_template.go`, a struct in `BuildStatsRow.Breakdown`). Neither changes what
is emitted. The first is the item the plan reserved for Stage A.

### Mongo layer — account scope

Three collections join the `names.go` list and are bound as named `Docs` handles on `Mongo`, so no
collection name travels as a string:

| Collection | Handle | Holds |
|------------|--------|-------|
| `user_archived_job_stats` | `ArchivedJobStats` | per-archived-job figures the pipelines read |
| `user_rollup_buckets` | `UserRollupBuckets` | pre-aggregated calendar months per account and item type |
| `stats_rebuild_queue_accounts` | `AccountRebuildQueue` | accounts whose statistics need recalculating |

**Rebuild queue.** Queues are named for the work they trigger rather than the state of the data.
`QueueAccountRebuild` keeps the original `queuedAt` across re-queues, so the wait time reflects
when work first became outstanding, and bumps a `claim` counter every time.

`ListQueuedAccounts` returns each account with the claim current when it was read;
`ClearQueuedAccounts` deletes only where that claim still matches. An account re-queued while its
rebuild is in flight therefore stays queued instead of being silently dropped, and the difference
between the count cleared and the count attempted is how many arrived mid-rebuild. Clearing an
empty set returns without reaching Mongo.

**Two additions to the shared `Docs` surface**, rather than query helpers beside the call sites:

- `DistinctStrings(ctx, field, filter, opts...)` — distinct values, skipping non-string and empty
  entries, under `Retry`
- `ListIDs(ctx, filter, opts...)` — `_id` of every match, projected, under `Retry`

Both take `RetryOption`, so every read carries an operation name in its logs the way the write
helpers already do. `DistinctUnprocessedArchivedAccountIDs` now goes through `DistinctStrings`
instead of reaching for `Collection()` and hand-decoding `[]any`, and gains retry it did not have.

**Document `_id` builders** live beside `BuildStatsDocumentID` in `build_stats.go` — the contract
between the workers that write and the API that reads. `UserRollupMonthlyDocumentID` zero-pads the
month (`acct|1234|2026-08`) so `_id` ordering matches calendar ordering.

### Indexes

Index ownership is the Deployment Tool's: `internal/dataplane/mongo/index_specs.go` is the
declarative source of truth and `eip ensure-mongo` applies it. Seven specs join the list:

| Collection | Index | Serves |
|------------|-------|--------|
| `user_archived_job_stats` | `accountID, typeID, isProductionChain, revoked` | per-account, per-type reads that exclude chain intermediates and revoked rows |
| `user_archived_job_stats` | `accountID, archivedAt, revoked` | account rebuild scans in archive order |
| `user_rollup_buckets` | `accountID, year, month, typeID` | rollups over a month range, all types or one |
| `user_job_documents` | `build.costs.linkedJobs.corporation_id` | finding documents that still hold a raw entity id |
| `user_job_documents` | `protected.spec` | finding documents written under an older field set |
| `archivedJobs` | `build.costs.linkedJobs.corporation_id` | as above, for archives |
| `archivedJobs` | `protected.spec` | as above, for archives |

The last four serve the conversion backfill. Both are selective — the raw-id index covers
1,404 documents out of ~41,500 and shrinks to nothing as the backlog drains, since writes
convert before persisting.

`stats_rebuild_queue_accounts` gets no spec. Its documents are keyed by account ID alone and
`ListQueuedAccounts` reads the whole collection unordered, so the automatic `_id` index covers it.
A `queuedAt` index only becomes worth adding if draining moves to oldest-first, which would also
need a sort on that read.

No preimage entry is needed: `PreimageCollections` covers the user-document collections the
changestream syncs to clients, which is why `archivedJobs` and `build_stats` are absent from it too.

**Partial indexes are deferred, deliberately.** The branch carried partial indexes over an "active
snapshot" filter, and the rollup query they serve does not exist yet. A partial index only covers a
query whose filter matches it, so writing the filter before the query means guessing at the match —
exactly the failure the pinning below exists to prevent. They land with the Stage D handlers, whose
filters they must mirror.

The single-type rollup path may want `accountID, typeID, year, month` as well. The index above
serves both shapes and is optimal for the all-types one; whether the single-type case justifies a
second index is a Stage D call, once there is a real query to measure rather than a guess.

### Schema maintenance

`archivedJobs` joined the schema-maintenance rotation, because it carries `schemaVersion` like the
planner collections and would otherwise never reach the current version. The rotation now visits
five collections rather than four, so each is scanned every fifth hourly tick.

The batch size default rose from 50 to 200 — the ceiling `maxSchemaMaintenanceBatchSize` already
allowed — in both the scheduler payload and the worker fallback, so they cannot disagree. Only
documents below the current version are selected and only changed documents are written, so this
does not rewrite documents already at the current version.

### Still open in Stage A

The corporation-scoped half of the Mongo layer.

**Partial filters are pinned on both sides.** A partial index only covers a query when its filter
matches that query's, and `deployment-tool` is a separate Go module that cannot import `services`,
so a mirrored filter cannot be shared as code. Each side pins the same canonical JSON in its own
test — `TestUnprocessedArchivedJobFilter_canonicalJSON` in `services/shared/mongo` and
`TestArchivedJobsPartialFilterMatchesServices` in `deployment-tool/internal/dataplane/mongo` — so
changing either alone fails the other module's test, with a message naming the file to update. Any
partial filter added for the new collections follows the same pattern.

Corporation queries are held back deliberately: they key on `_meta.corpRef` and a
`corp_archivedJobs` collection, and neither exists on Development — `JobMetaData` carries no
`CorpRef` or `CorporationID`. Adding those fields now would put shape in the model that nothing
populates, so `corp_archivedJobs`, `corp_build_stats`, `corp_rollup_buckets`, the `CorpRebuildQueue`
(`stats_rebuild_queue_corps`, with `QueueCorpRebuild` / `ListQueuedCorpRefs`) and the corp `_id`
builders land together with Stage C, when that stage is committed to rather than deferred.

Index definitions do **not** land in `services/`. Development has no index-creation code there at
all; `deployment-tool/internal/dataplane/mongo/index_specs.go` is the declared source of truth,
applied by `eip ensure-mongo`, and it already carries an `archivedJobs` entry. The new collections
get `IndexSpec` entries there — an operator-surface change, not a services one.

## Stage B — account statistics pipeline

_Not landed._

Fill in: how an account's archived jobs become rollup buckets and snapshots, what queues an account
for rebuild, recomputation triggers, and task ownership.

## Stage C — corporation statistics pipeline

_Not landed._

Fill in: how member jobs roll into corporation figures, which identity a job is attributed to,
pruning rules, and how this differs from account aggregation.

### Recheck when corporation documents land

`outgoinglogic.ClientPayload` strips routing metadata — `corporationRef`, `allianceRef`, `scopes`,
`sourceClientID`, `sourceSessionID` — from a `doc.update` payload before it reaches a browser. It
was written ahead of the surface it guards and has never run against a populated message, because
`extractOrgRoutingFromDocument` reads `_meta.corporationRef`, `_meta.allianceRef` and `scopes` from
the stored document and no document carries any of them yet. Every field is `omitempty`, so today
they are absent from every published message.

Corporation and alliance documents are what populate them. When they land, confirm:

- The fields are populated as expected, and stripping removes all of them — a new routing field
  added later would not be in the list.
- The strip list still matches what the websocket actually routes on, so nothing the server needs
  is removed and nothing internal survives.
- The decode-and-re-encode cost is acceptable at real corporation fan-out volume. Account-scoped
  messages return the original slice untouched, so only org-scoped traffic pays it.
- Whether `sourceClientID` / `sourceSessionID` should keep being stripped. Unlike the refs these
  are populated today, and they are the receiving client's own identifiers rather than anything
  about another user, so the case for removing them is weaker.

The values were never raw entity ids: the changestream reads them from the document, and documents
store refs. This is defence against a stable internal identifier reaching a client, not against id
disclosure.

## Stage D — statistics API

_Not landed._

Fill in: endpoints, request and response shapes, and which contracts are additive versus replacing
an existing read.

## Stage E — frontend

_Not landed._

Fill in: which views consume which endpoints, and what a user sees that they did not before.

## Missing live SoT found during this work

Drafts for documentation that should exist but does not, written here first and promoted when the
project closes.

_None recorded yet._
