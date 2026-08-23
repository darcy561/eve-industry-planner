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
| `CorporationRef string` | `json:"-"` `bson:"corporation_ref"` | stored, never sent |

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
`corporation_ref`. Additive elsewhere. No ref has ever been written to the production
database, so there is no stored ref to migrate.

### Statistics models

The persisted shapes for account and corporation statistics, in `shared/models`.

Measures that every aggregate shares are declared once and embedded with `bson:",inline"`, so the
stored documents and JSON stay flat while a new measure lands in a single struct:

| Shared struct | Fields | Embedded by |
|---------------|--------|-------------|
| `BuildMeasures` | totalJobs, itemBuildCount, buildCostTotal, brokersFeeTotal, transactionFeeTotal, jobCostTotal, salesTotal, profitLoss | `BuildStatsRow`, `CorpBuildStatsRow`, `BuildStatsSegmentTotals` |
| `SalesMeasures` | transactionCount, quantitySold, salesTotal, jobCostTotal, extraCategoryTotals, transactionFeeTotal, brokersFeeTotal, profitLoss | `TimelineTotals`, `AccountTimelineMonthBucket`, `CorpTimelineMonthBucket`, both timeline buckets |
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
`BuildStatsRow` keeps `dataSnapshots` — the totals read serves it and the SPA reads it in two
places, so it stays until a view exists for the per-job rows it duplicates. Embedding does not
change the stored or served shape of any existing document.

### Also landed

Two `go fix` items in `shared/models`, both removing an `omitempty` that never applied to its type
(a `time.Time` in `group_template.go`, a struct in `BuildStatsRow.Breakdown`). Neither changes what
is emitted. The first is the item the plan reserved for Stage A.

### Mongo layer — account scope

Three collections join the `names.go` list and are bound as named `Docs` handles on `Mongo`, so no
collection name travels as a string:

| Collection | Handle | Holds |
|------------|--------|-------|
| `account_archived_job_stats` | `ArchivedJobStats` | per-archived-job figures the pipelines read |
| `account_timeline_months` | `AccountTimelineMonths` | pre-aggregated calendar months per account and item type |
| `account_stats_rebuild_queue` | `AccountRebuildQueue` | accounts whose statistics need recalculating |

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
between the workers that write and the API that reads. `AccountTimelineMonthDocumentID` zero-pads the
month (`acct|1234|2026-08`) so `_id` ordering matches calendar ordering.

### Indexes

Index ownership is the Deployment Tool's: `internal/dataplane/mongo/index_specs.go` is the
declarative source of truth and `eip ensure-mongo` applies it. Seven specs join the list:

| Collection | Index | Serves |
|------------|-------|--------|
| `account_archived_job_stats` | `accountID, typeID, isProductionChain, revoked` | per-account, per-type reads that exclude chain intermediates and revoked rows |
| `account_archived_job_stats` | `accountID, archivedAt, revoked` | account rebuild scans in archive order |
| `account_timeline_months` | `accountID, year, month, typeID` | timeline reads over a month range, all types or one |
| `account_job_documents` | `build.costs.linkedJobs.corporation_id` | finding documents that still hold a raw entity id |
| `account_job_documents` | `protected.spec` | finding documents written under an older field set |
| `account_archived_jobs` | `build.costs.linkedJobs.corporation_id` | as above, for archives |
| `account_archived_jobs` | `protected.spec` | as above, for archives |

The last four serve the conversion backfill. Both are selective — the raw-id index covers
1,404 documents out of ~41,500 and shrinks to nothing as the backlog drains, since writes
convert before persisting.

`account_stats_rebuild_queue` gets no spec. Its documents are keyed by account ID alone and
`ListQueuedAccounts` reads the whole collection unordered, so the automatic `_id` index covers it.
A `queuedAt` index only becomes worth adding if draining moves to oldest-first, which would also
need a sort on that read.

No preimage entry is needed: `PreimageCollections` covers the user-document collections the
changestream syncs to clients, which is why `account_archived_jobs` and `account_production_totals` are absent from it too.

**No partial indexes were added.** The branch carried them over an "active snapshot" filter, and the
deferral existed so the filter could be written against a real query rather than guessed at. With
the Stage D handlers written, none of them filters on a subset: every read is scoped by `accountID`
and optionally `typeID`, both of which every document carries. A partial filter would exclude
nothing, so it would add a constraint to keep in step across two modules and buy no selectivity.

**The single-type question resolved as yes.** `atm_accountID_year_month_typeID_1` leads with year and
month, so a query naming one item type over a range of months can only use its `accountID` prefix and
scans the account's whole window. `atm_accountID_typeID_year_month_1` puts `typeID` second, which the
archive dialogue's per-blueprint read needs. Both are kept: the first is still the better index when
no type is named.

`account_production_totals` gained `apt_accountID_typeID_1`, which serves the lifetime read in both
its forms. It had no index of its own before — the collection was previously reached only by `_id`.

### Schema maintenance

`account_archived_jobs` joined the schema-maintenance rotation, because it carries `schemaVersion` like the
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

Corporation queries are held back deliberately, though not for the reason first recorded here.

The **field exists**: `models.MetaData` — embedded in `JobMetaData` — declares `CorporationRef` and
`AllianceRef`, stored as `_meta.corporationRef` / `_meta.allianceRef`, and the changestream already
routes on them. It arrived with the entity-ref work. The spelling is `corporationRef`, not
`corpRef`.

What is missing is a **producer**: nothing in `services/` assigns `MetaData.CorporationRef` on a
write path, so every stored job carries it empty. A corporation pipeline built against it today
would aggregate nothing, and its query shapes would be guesses no data exercises. The contract a
corporation document has to meet is in [Stage C](#stage-c--corporation-statistics-pipeline).

So `corporation_archived_jobs`, `corporation_production_totals`, `corporation_timeline_months`,
the `CorpRebuildQueue` (`corporation_stats_rebuild_queue`, with `QueueCorpRebuild` /
`ListQueuedCorpRefs`) and the corp `_id` builders land together with Stage C, when that stage is
committed to rather than deferred.

These are **new** collections, so they take the convention in
[collection-naming](../collection-naming/plan.md) from the start rather than being renamed later.
Corporation-scoped data is the case the `<scope>_` prefix exists for, and it is the first
collection set that is not account scoped. The names also follow the Stage D vocabulary — see
[§ Naming](./plan.md#naming) — so `production_totals` and `timeline_months` rather than
`account_production_totals` and `account_timeline_months`.

Index definitions do **not** land in `services/`. Development has no index-creation code there at
all; `deployment-tool/internal/dataplane/mongo/index_specs.go` is the declared source of truth,
applied by `eip ensure-mongo`, and it already carries an `account_archived_jobs` entry. The new collections
get `IndexSpec` entries there — an operator-surface change, not a services one.

## Stage B — account statistics pipeline

_Landed apart from the schedule._ The transformation, the worker rebuild, the drain, its task and
handler, and the archived-jobs producer are committed. Nothing publishes the drain subject yet — see
[Not wired yet](#not-wired-yet).

### The transformation — `shared/archivestats`

Pure: no Mongo, no clock, no key material, so the attribution rules are testable apart from the
worker that applies them. `now` is a parameter, which is what makes a rebuild reproducible.

`BuildAccountSnapshot` reduces one archived job to its `account_archived_job_stats` row.
`AccumulateAccountBuckets` and `AccountBuckets` fold those rows into `account_timeline_months`.

**Cost attribution.** A job's costs are attributed to the month production started — the earliest
linked industry job, falling back to the earliest sale, then the archive date. A build spanning a
month boundary keeps its costs where they were spent rather than following its sales. The month is
pinned on the row so a rebuild cannot re-decide it and shift historical figures.

The archive date itself resolves through `archiveDateFor`: `_meta.archivedAt`, then the document's
`lastModified`, then its `createdAt`. **The rebuild clock is not in that chain.** It was, and the
consequence was that a job with no archive date, no linked jobs and no sales had its costs filed
under whichever month the rebuild happened to run in — and moved to a new month on the next run,
against a database whose newest archived job was four months old. That is precisely what pinning the
cost month exists to prevent, so `now` is reachable only for a document carrying no usable timestamp
at all, which keeps such a row in some month rather than counting in lifetime totals and none.

The bug was inherited rather than introduced: the same six lines appear in
`feature/archived-jobs-redesign`, which the plan treats as a specification. That branch also applies
the clock a second time at read time, in `jobCostYearMonth`, so it can file a job under one month
when writing and report another when reading. Stage D reads pre-aggregated buckets rather than
re-deriving, so only the write path needed fixing here.

`TestCostMonthDoesNotMoveWithTheRebuildClock` pins the property directly: the same job rebuilt five
months later must keep its month. With the fallback chain removed it fails, moving 2026-08 to
2027-01.

**Validated against the retired pipeline.** For the 5,057 jobs where both a derived date and the old
Firestore `processDate` exist, processing never preceded the derived date — 0 occurrences — and
followed it by a median of 7 days, p90 22 days. A rule picking dates from the wrong field would
produce negatives by chance; none appeared. The two disagree on the calendar month for 30% of jobs,
which is the rule working rather than failing: a build in March that sold in early April incurred
its costs in March, and `processDate` says April.

**Corporation attribution** cascades: the sale line's own ref, then its market order's, then a
single distinct corporation across the linked facility jobs. Two or more resolves to **none** — a
corporation aggregate crediting revenue it never earned is worse than one missing a line. A
corp-flagged line whose corporation cannot be named records `corp_unknown` rather than passing as
personal.

**What a bucket counts.** Sale lines land in the month they occurred; costs land in the job's cost
month, so one job can touch two buckets. Revoked rows are excluded. Production-chain intermediates
are excluded — their costs are already counted through the parent that consumed them. Broker and
transaction fees are never folded into `jobCostTotal`; buckets carry them as their own measures, and
including them there would count them against profit twice.

A job's cost contribution is `TotalBuildCosts + TotalInventionCost`. `TotalBuildCosts` already
covers materials, install and extras, so invention is the only component to add.
`feature/archived-jobs-redesign` summed all four and overstated every month's costs by the install
and extras totals; that bug is not carried over, and `TestJobCostCountsInstallAndExtrasOnce` names
the reason.

**Which segment a job belongs to.** The breakdown on a lifetime totals row partitions a type's jobs
three ways, and a job is credited to exactly one — crediting two would count it twice inside a single
document. The order is: a production-chain step, then an explicit `retainedStockBuild` mark, then a
job with recorded market activity, and anything left over is stock.

Market is decided on **evidence**, not by elimination. It was decided by elimination — a job was
Market whenever it was neither a chain step nor flagged — and since nothing writes
`retainedStockBuild`, the Stock segment was permanently empty and every non-chain job reported as
Market, including builds that never sold. A job with 200 items built and no sale showed zeros for
sales, fees and profit beside a six-figure job cost.

Market activity is either a sale or a broker fee:

- A sale is a **transaction line whoever wrote it**. ESI supplies market transactions; a contract or
  other off-market sale is entered by hand through the SPA's custom-transaction dialogue, carrying
  the same quantity, amount and tax, distinguished only by a negative transaction id. Both arrive as
  `TransactionLines`, so both count.
- A **broker fee alone** is enough. Listing output is market activity before anything sells, and a
  fee-only job sent to stock would report a broker fee total in a block that hides the fee row
  explaining it.
- Lines are weighed by their **figures**, not their presence — a line carrying neither an amount nor
  a quantity records no money and no goods, so it is not evidence of anything.

`retainedStockBuild` is checked ahead of the sale evidence, so a user's explicit mark is honoured
whether or not a line was recorded against the job. `feature/archived-jobs-redesign` resolved this
the other way, letting market win; the divergence is deliberate and currently moot, since nothing
writes the flag.

**Extras by category.** `extraCategoryTotals` folds a job's extra costs by category id — a blank
category becomes `"0"`, Unassigned — and rides the row into the monthly buckets against the **cost
month**, the same attribution `jobCostTotal` uses. Several jobs in a month sum their categories per
id; a month with no extras leaves the map absent so the field stays omitted on the wire rather than
serialising as `{}`. Category ids are per-account and their labels live in the account's
`extrasCategories` setting, so the pipeline never resolves a label — only the SPA can.

### The worker — `worker/tasks/archivedjobs`

`RebuildAccountStatistics` recomputes an account **wholesale**. The queue records only that an
account changed, not which jobs, and recomputing everything is idempotent — which is what lets a
rebuild be retried, or race a re-queue, without corrupting totals.

Rows and buckets are written **before** anything is removed, so a reader arriving mid-rebuild sees
the previous complete set or the new one, never a gap where a month has been pruned and not yet
rewritten.

A job whose snapshot cannot be computed is skipped and counted in `SkippedJobs`, but its row id is
still kept out of the revoke set: the job is still archived, so revoking its row would record it as
removed and drop its history permanently.

`DrainAccountRebuildQueue` carries each account's claim through to the clear, so an account
re-queued mid-rebuild keeps its place. A rebuild that errors is left queued rather than cleared, so
a transient failure retries instead of losing the request. `DrainResult` separates `Failed` from
`Requeued`, which look identical in a count of "not cleared" and mean opposite things.

### Mongo layer added for it

`LoadAccountArchivedJobs`, `LoadAccountArchivedJobStats`, `RevokeAccountArchivedJobStats` and
`PruneAccountTimelineMonths`. Rows are revoked rather than deleted so a rebuild can tell a removed
job from one it has never seen, and so a job restored from the archive keeps its history.

`LoadAccountArchivedJobStats` returns revoked rows too, which is what lets a rebuild distinguish a
job it removed from one it has never processed.

**Revoke and prune share a keep-list convention.** Both take the ids the rebuild produced and act on
everything else for that account, and both **drop the `$nin` when the keep-list is empty** — so a
rebuild that produces nothing empties the account rather than leaving it untouched. That is correct
for a wholesale rebuild whose last archived job was removed, and it is the most destructive path in
the pipeline, so it is pinned by a live test rather than left to inspection.

Behaviour here is covered by `shared/mongo/live_account_rebuild_test.go` against stack Mongo.

#### The retired pipeline could double-count, and did on dev

`$inc` and `$push` guarded only by an `archiveProcessed` flag means a job processed twice is counted
twice, permanently, with nothing to detect or correct it. On dev this produced 9,247 counted jobs
against 9,162 real ones — an 85-job overcount, all on the account reprocessed during this work.

**Production was not affected.** Live shows `sum(totalJobs)` = 10,094 against exactly 10,094
archived jobs and 10,094 snapshot entries, all flagged processed. The dev overcount came from this
project resetting the flag on data the worker had already aggregated, not from anything users saw.

The wholesale rebuild has no such failure mode: it recomputes from source, so running it twice
cannot double-count and no flag is needed.

#### Verified against the retired pipeline's output

The rename left 4,039 `account_production_totals` documents written by the old `$inc` worker, which
is the only comparison available for the fold that replaced it. Two things were confirmed against
them rather than reasoned about:

**`jobCostTotal` is build costs plus both fees.** Across all 4,039 rows,
`buildCostTotal + brokersFeeTotal + transactionFeeTotal` equals `jobCostTotal` exactly.

**`profitLoss` is computed per job, not per row, and that distinction is load-bearing.** Summed over
the rows that sold, reported profit is 257bn while `salesTotal − jobCostTotal` is 133bn — the two
disagree by nearly a factor of two, and a fold that computed profit from row totals would be wrong
by that much.

The cause is the `if sales > 0` guard. A job that sold contributes `sales − cost`; a job that sold
nothing contributes **zero profit but still adds its cost**. Within one item type those mix, so the
guard has to be applied per job and the results summed — which is what `jobMeasures` does and what
the old worker did before it. Row-level arithmetic silently re-applies the guard once.

Checked directly: single-job rows always satisfy `profitLoss == salesTotal − jobCostTotal`; only
multi-job rows diverge. 2,955 rows have no sales at all, carrying 842bn of cost against exactly zero
profit, which is the guard behaving as intended rather than lost data.

### What queues an account

`PUT /archived-jobs` queues the account after a successful write. Queuing rather than recomputing
inline keeps the write cheap and collapses a burst of archives into one rebuild. A failure to queue
is a handler caveat, not a request failure: the jobs are saved either way and the next archive
re-queues the account.

### The drain task

`DrainAccountStatsRebuildQueue` (`task.scheduled.drainAccountStatsRebuildQueue`, Priority4, 15
minute timeout) is the worker entrypoint over `DrainAccountRebuildQueue`. It is declared in
`shared/tasks/types.go` and registered on the asynq mux in `worker/asynq/handlers.go`.

**One pass handles the whole queue** rather than fanning out one task per account, which is how the
neighbouring `ProcessArchivedBuildStats` works. The claim protocol that keeps an account re-queued
mid-rebuild from being cleared by the rebuild it raced lives inside the drain; per-account fan-out
would move that logic into a path the queue's semantics are not tested against, to buy parallelism a
queue of this size does not need. Revisit if a pass approaches the timeout — the fan-out shape is
the escape hatch, and the per-account clear would have to carry the claim with it.

**The task carries no payload.** The queue names the work, so a pass is always "everything waiting"
and there is nothing for a caller to scope. A nil task is therefore valid input; missing
dependencies are not.

**A pass with failures still succeeds.** Failed accounts keep their place in the queue and retry on
the next pass, so returning an error would retry the accounts that already succeeded to no purpose.
The count is attached as a handler caveat instead, and `Requeued` stays distinguishable from
`Failed` in the log line — they look identical in a count of "not cleared" and mean opposite things.

The asynq mux keys handlers by a bare string, so a handler key that does not match its task name
registers cleanly and is never routed to — the queue would fill with nothing draining it and no
error anywhere to say so. `TestDrainAccountStatsRebuildQueue_TaskNameIsRegistered` pins the name,
the `ByName` row and the resolved timeout together.

### The schedule

`ScheduleDrainAccountStatsRebuildQueue` publishes one drain task per tick, registered in
`core/scheduler/registry.go` alongside the build stats fan-out.

**Hourly at minute 30** (`30 * * * *`), deliberately offset from
`ScheduleProcessArchivedBuildStats` on minute 0. Both crons read archived-jobs data, so running
them in the same minute makes them contend for Mongo every hour to no purpose. A test pins that the
two schedules differ.

**It publishes unconditionally** rather than checking the queue first. Reading the queue to decide
whether to publish would duplicate the read the worker does anyway and give the scheduler a Mongo
dependency to fail on; the cost of being wrong is one message an hour, and a pass over an empty
queue returns before reaching Mongo. The task carries an empty payload for the same reason the
worker takes none: the queue names the work.

With this the account pipeline is closed end to end — `PUT /archived-jobs` queues an account, the
cron publishes, the worker drains, and the claim protocol decides what stays queued.

The Mongo-facing behaviour the drain depends on is confirmed against stack Mongo rather than only
reasoned about: the claim protocol, revoke-on-removal, bucket pruning, and write-then-remove
ordering all have passing live tests. Rows are revoked and never deleted, so a job restored from the
archive keeps its history; an empty keep-list empties the account rather than leaving it untouched.

What the cron still exercises without a live test is the worker's end-to-end composition of those
helpers over real archived jobs. See [plan.md](./plan.md) § Open questions for that gap and for how
to run a live test against the overlay.

## Stage C — corporation statistics pipeline

_Not landed._

Fill in: how member jobs roll into corporation figures, which identity a job is attributed to,
pruning rules, and how this differs from account aggregation.

### What a corporation document has to supply

The org-scoped delivery path is built and unexercised: corporation and alliance documents do
not exist yet, and the machinery was written ahead of them deliberately. Traced end to end,
the pieces below are in place and correct; what follows is the contract the eventual document
has to meet for a change on it to reach a browser.

**Already built.** `deliverOutboundDocUpdate` routes on `Route.CorporationRef` before falling
through to explicit subscribers, matching it against `Server.corpRefToClients`, which is
populated from each client's `Scopes.CorporationRefs` when it sends `upgrade_scopes`.
`wsplacement.TenantKeyCorporation` guards the tenant key, `models.MetaData` declares
`CorporationRef` / `AllianceRef`, and `outgoinglogic.ClientPayload` strips the routing
metadata and restores ids in the body.

**What the producer must add.**

| Piece | Where | Why |
|---|---|---|
| The collection itself | `shared/mongo` | Nothing stores corporation-owned documents today |
| A `CollectionGroup` entry | `core/changestream/collection_groups.go` | The four groups — account, planner, archive_and_stats, blueprints — are all account scoped, so no corporation collection is watched |
| `_meta.corporationRef` on the stored document | the write path | `extractOrgRoutingFromDocument` reads it; without it `Route.CorporationRef` is empty and dispatch never takes the corporation branch |
| `_meta.allianceRef` where alliance fan-out is wanted | the write path | Same, for the alliance lane |
| `scopes` where delivery must narrow under the org root | the write path | Optional; absent means full fan-out under the root |

An account-scoped document needs none of this — `_meta.accountID` alone routes it, which is
the path job documents take today.

**Confirm when they land.**

- The routing fields are populated as expected and stripping removes all of them. A routing
  field added later would not be in `routingOnlyFields`.
- The strip list still matches what the websocket routes on, so nothing the server needs is
  removed and nothing internal survives.
- The decode-and-re-encode cost is acceptable at real corporation fan-out volume.
  Account-scoped messages return the original slice untouched, so only org-scoped traffic
  pays it.
- Whether `sourceClientID` / `sourceSessionID` should keep being stripped. Unlike the refs
  these are populated today, and they are the receiving client's own identifiers rather than
  anything about another user, so the case for removing them is weaker.

The routing values were never raw entity ids: the changestream reads them from the document,
and documents store refs. This is defence against a stable internal identifier reaching a
client, not against id disclosure.

## Stage D — statistics API

_Landed for the account scope._ Corporation views wait for Stage C.

### The routes

Scope leads the path, filters stay in the query. The account scope carries no identifier because the
account is resolved from the session cookie and never read from the request; a corporation route
will name its ref in the path, because a caller may belong to several and the value it names decides
what it may see. A query parameter is the wrong place for that.

| Route | Returns |
|-------|---------|
| `GET /api/v1/statistics/account/timeline` | one entry per calendar month, summed across every item type |
| `GET /api/v1/statistics/account/timeline/items` | the per-item breakdown for the same window, ranked and paged |
| `GET /api/v1/statistics/account/totals` | lifetime figures, one row per item type |
| ~~`GET /api/v1/statistics/build-stats`~~ | retired in Stage E; `totals` serves the same documents |

`/api/v1/statistics` was already mounted, so no route-table or wiring change was needed, and all
four handlers share the existing `GetAPIStatistics` metrics bag rather than adding instruments.

### The window

`from` and `to` are calendar months as `YYYY-MM`, matching the timeline document `_id` so a month a
caller names is the month the rows were filed under.

**Omitting both gives the current month and the one before it** — the dashboard's month-on-month
comparison, so its query is the bare endpoint with no parameters. The response marks that window
`defaulted`, because a client cannot otherwise tell a chosen default from an account with little
history.

Each month carries `complete`, false for the month still in progress. The current month is a
month-to-date figure, so a client comparing it against a finished month is comparing unlike things
unless something says so.

**Bad ranges are refused, not repaired.** Half a range (`from` without `to`) is rejected rather than
half-defaulted, and a range beyond 60 months is rejected rather than truncated: a silently shortened
window is indistinguishable from missing data once it reaches a chart. Every rejection carries its
own error code, so `statistics_range_reversed` and `statistics_invalid_month` are separable in logs
rather than collapsing into one bad-request reason.

### Why the breakdown is a separate view

Buckets are stored per month **and** per item type, so a month's total is a sum across every type the
account touched. An account can touch thousands. Embedding the breakdown inside each month would
multiply that by the window length and make the common chart request pay for detail it does not draw.

Both aggregations run server-side. The client never sums buckets: there are too many rows to ship,
and `SalesMeasures.Plus` is the authority on how they combine — `profitLoss` accumulates as a sum of
signed parts rather than being recomputed, and `extraCategoryTotals` merges by category id, so a
client-side fold would drift from the pipeline.

Ranking is server-side for a stronger reason: ordering item types by profit needs every type in the
window before a page can be taken, which a client holding one page cannot do. `sort` is validated
against the measures the aggregation accepts rather than passed through, because the value reaches a
`$sort` key. Ties break on `_id` so a row cannot appear on two pages.

### The aggregation

`Docs` had no aggregation helper — every read there was `Find`-shaped, which cannot express a grouped
read. `Docs.Aggregate` joins the shared surface under `Retry` with an operation name, the way
`DistinctStrings` and `ListIDs` already are.

The month range is filtered on a computed `year*12+month` ordinal rather than on year and month
separately. The obvious filter is wrong across a year boundary:
`{year: {$gte: 2025, $lte: 2026}, month: {$gte: 12, $lte: 2}}` matches nothing, because no month is
both ≥ 12 and ≤ 2. That is not an edge case here — every January the default window crosses one.

`extraCategoryTotals` is deliberately absent from the `$group`: it is a map keyed by category id and
`$sum` cannot merge maps, so including it would produce a silently wrong value rather than an error.

## Stage E — frontend

Landed for the account scope.

### What reads what

| View | Endpoint | Shows |
|------|----------|-------|
| `Dashboard/Components/ArchivedStatsOverview` | `timeline` | This month against last — sales, job cost, profit, each with the change |
| `Dashboard/Components/ArchivedItemBreakdown` | `timeline/items` | Which item types drove the month, ranked server-side |
| `Dialogues/Blueprint Archive` | `totals` | One item type's lifetime figures, split into four segment blocks |
| `Edit Job/.../Archive Jobs Panel` | `totals` | Per-job rows, from the `dataSnapshots` embedded on the row |

`Functions/Endpoints/Pirivate/statisticsTimeline.js` holds the two timeline reads and
`Hooks/React Query/Backend/statisticsTimeline.js` their hooks, keyed under a statistics root shared
with the lifetime-totals hook. Archiving a job queues a rebuild that recomputes all three
collections, so `invalidateStatisticsQueries` invalidates that whole root rather than one type.

### The dashboard is a running position

The current month is month-to-date, so the comparison labels it rather than showing an unmarked
decline against a finished month. A change from zero is reported as new activity rather than an
infinite percentage.

The item table is a **glance, not an analysis tool**: two rankings — total profit and total cost —
and two fixed lengths, five rows with a toggle to ten. It asks the server for the length it wants
rather than slicing a list already fetched, so the ranking always covers every item type in the
window rather than the page. The toggle appears only when the window holds more than five items, and
collapses when the ranking changes, since an expansion made against the old order means nothing under
a new one.

### The archive dialogue shows four blocks

Combined, Market, Stock and Chain, mapped from the `breakdown` the row already carries — no extra
request. Combined **sums** the three segments rather than recomputing profit from the summed money
fields: `jobCostTotal` already contains both fee totals, so subtracting them again reports a loss
against profitable builds. `feature/archived-jobs-redesign` made exactly that error in
`combinedFromSegmentBuckets`; a test pins the correct figure against the one it produces.

Stock and Chain show the build side only and carry a line saying why — neither records a sale of its
own, so their sale and fee rows would be zeros standing beside real build costs. A segment with no
activity is omitted rather than rendered as noughts, and a row whose breakdown is empty falls through
to the flat summary so documents written before the breakdown existed still show their headline
figures.

The corporation toggle on the source branch was not ported — it is Stage C. The seams are open for
it: `statsBreakdown` is a prop rather than computed inside the body, the mapper takes a whole row so
a corporation row maps identically, and both are exported from the folder index.

### Not built yet, by choice

Extras by category reach the monthly figures and are served in every timeline response, but no view
reads them. Whatever builds that will need to resolve category **ids** to labels from
`applicationSettings.extrasCategories` in the user store, and should render **deleted** categories
for historical months — the existing category select hides them, which is right for choosing and
wrong for reporting, since a past cost still belongs to the category it was filed under.

## Missing live SoT found during this work

Drafts for documentation that should exist but does not, written here first and promoted when the
project closes.

_None recorded yet._
