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
| `BuildMeasures` | totalJobs, itemBuildCount, buildCostTotal, brokersFeeTotal, transactionFeeTotal, jobCostTotal, salesTotal, profitLoss | `ProductionTotalsRow`, `CorpProductionTotalsRow`, `ArchiveSegmentTotals` |
| `SalesMeasures` | transactionCount, quantitySold, salesTotal, jobCostTotal, extraCategoryTotals, transactionFeeTotal, brokersFeeTotal, profitLoss | `TimelineTotals`, `AccountTimelineMonthBucket`, `CorpTimelineMonthBucket`, both timeline buckets |
| `CalendarMonth` | year, month | every monthly bucket and timeline entry |
| `ArchivedJobCostTotals` | the seven per-job cost totals | `ArchivedJobStats` |
| `ArchivedJobLine` | orderID, date, year, month, amount | `ArchivedJobTransactionLine`, `ArchivedJobFeeLine` |

Summation lives with the measures as `Plus` methods rather than free functions per row type;
`SalesMeasures.Plus` merges `extraCategoryTotals` by category id without mutating either operand.
Tests assert that each embedding marshals flat in both BSON and JSON, so an omitted `inline` tag
fails the build rather than silently nesting a document.

A sale line carries no owner of its own. Ownership belongs to the job, which lives in one archive
or the other, so a line is owned by whoever owns the job that produced it.

The segment breakdown keeps three named fields — `productionChain`, `retainedStock`,
`standaloneRecordedSale`. A map keyed by segment const was considered: it would make a fourth
segment a one-const change, but segments are a closed classification that changes far less often
than measures, and named fields keep the compiler checking producers.

**Wire compatibility:** additive for the statistics shapes, which no document uses yet.
`ProductionTotalsRow` kept `dataSnapshots` at this point, because the totals read served it and the
SPA read it in two places. J1 removed it in favour of `BuildHistoryMarks`, which is what those two
readers use now. Embedding does not change the stored or served shape of any existing document.

### Also landed

Two `go fix` items in `shared/models`, both removing an `omitempty` that never applied to its type
(a `time.Time` in `group_template.go`, a struct in `ProductionTotalsRow.Breakdown`). Neither changes what
is emitted. The first is the item the plan reserved for Stage A.

### Mongo layer — account scope

Three collections join the `names.go` list and are bound as named `Docs` handles on `Mongo`, so no
collection name travels as a string:

| Collection | Handle | Holds |
|------------|--------|-------|
| `statistics_rows` | `ArchivedJobStats` | per-archived-job figures the pipelines read |
| `statistics_timeline` | `AccountTimelineMonths` | pre-aggregated calendar months per owner and item type |
| `statistics_rebuild_queue` | `AccountRebuildQueue` | owners whose statistics need recalculating |

A collection is named for what it holds. Ownership lives in the document's owner block, so a name
that also encoded it would state the same fact twice and go stale the moment another kind exists.

**Rebuild queue.** Queues are named for the work they trigger rather than the state of the data.
One entry per owner, keyed `kind:id`, carrying the work it is waiting for — `delta` or `rebuild`.
`QueueOwnerWork` keeps the original `queuedAt` across re-queues, so the wait time reflects
when work first became outstanding, and bumps a `claim` counter every time. A rebuild queued over a
waiting delta upgrades the entry, because a rebuild derives every figure the delta would have added.

`ListQueuedOwners` returns each owner with the claim current when it was read; `ClearQueuedOwner`
deletes only where that claim still matches, and `OwnerClaimIsCurrent` reads the same condition for
a task that wants to know before it writes. An owner re-queued while its work is in flight therefore
stays queued instead of being silently dropped.

**Two additions to the shared `Docs` surface**, rather than query helpers beside the call sites:

- `DistinctStrings(ctx, field, filter, opts...)` — distinct values, skipping non-string and empty
  entries, under `Retry`
- `ListIDs(ctx, filter, opts...)` — `_id` of every match, projected, under `Retry`

Both take `RetryOption`, so every read carries an operation name in its logs the way the write
helpers already do. `DistinctUnprocessedArchivedAccountIDs` now goes through `DistinctStrings`
instead of reaching for `Collection()` and hand-decoding `[]any`, and gains retry it did not have.

**Document `_id` builders** live beside `ProductionTotalsDocumentID` in `production_totals.go` — the
contract between the workers that write and the API that reads. Each takes an owner and leads the id
with its key: a statistics row is `{ownerKey}|{jobID}`, and `TimelineMonthDocumentID` zero-pads the
month (`account:1234|1234|2026-08`) so `_id` ordering matches calendar ordering.

### Indexes

Index ownership is the Deployment Tool's: `internal/dataplane/mongo/index_specs.go` is the
declarative source of truth and `eip ensure-mongo` applies it. Nine specs join the list:

| Collection | Index | Serves |
|------------|-------|--------|
| `statistics_rows` | `owner.kind, owner.id, revoked, contributedAt` | the delta fold's two reads: rows not yet counted, and revoked rows still counted |
| `statistics_rows` | `owner.kind, owner.id, typeID, revoked` | rebuilding one item type from its live rows |
| `statistics_timeline` | `owner.kind, owner.id, isProductionChain, typeID` | timeline reads excluding chain intermediates |
| `statistics_timeline` | `owner.kind, owner.id, typeID` | the same views with the chain included |
| `statistics_totals` | `owner.kind, owner.id, typeID` | lifetime totals, whole-owner and single-type, in the `typeID` order returned |
| `job_documents` | `build.costs.linkedJobs.corporation_id` | finding documents that still hold a raw entity id |
| `job_documents` | `protected.spec` | finding documents written under an older field set |
| `archived_jobs` | `build.costs.linkedJobs.corporation_id` | as above, for archives |
| `archived_jobs` | `protected.spec` | as above, for archives |

Every statistics filter leads with the owner's kind and id, so an owner kind added later needs no new
index — it is another value in the same leading fields.

The last four serve the conversion backfill. Both are selective — the raw-id index covers
1,404 documents out of ~41,500 and shrinks to nothing as the backlog drains, since writes
convert before persisting.

**`year` and `month` are deliberately absent from the timeline specs.** The month range is bound on an
ordinal computed in an `$addFields` stage, which no index can serve, so those fields were carried and
never used. `archivedAt` and `isProductionChain` are likewise off the row specs: the first is never
filtered or sorted on a row, and the second is filtered on the month buckets. `contributedAt` is on,
because it is what the fold actually selects by.

`statistics_rebuild_queue` gets no spec. Its documents are keyed by owner key alone and `ListQueuedOwners`
reads the whole collection unordered, so the automatic `_id` index covers it. A `queuedAt` index only
becomes worth adding if draining moves to oldest-first, which would also need a sort on that read.

**Retiring a spec is its own declaration.** Ensure only ever adds an index, so a reshaped one leaves
its predecessor behind — different keys under a different name conflict with nothing, and both
survive, the old one maintained on every write and chosen by no query. `RetiredIndexes` names those,
runs before the specs are created, and treats an index already gone as done. A conflict on an
identical key pattern under a different name is reconciled rather than passed over, which is what a
collection rename produces: renaming carries the indexes across under the names they had before.

No preimage entry is needed: `PreimageCollections` covers the user-document collections the
changestream syncs to clients, which is why `archived_jobs` and `statistics_totals` are absent from it
too.

**No partial indexes were added.** The branch carried them over an "active snapshot" filter, and the
deferral existed so the filter could be written against a real query rather than guessed at. With
the Stage D handlers written, none of them filters on a subset: every read is scoped by `accountID`
and optionally `typeID`, both of which every document carries. A partial filter would exclude
nothing, so it would add a constraint to keep in step across two modules and buy no selectivity.

**The single-type question resolved as yes, then the month fields came off both specs.** The pair was
originally `atm_accountID_year_month_typeID_1` and `atm_accountID_typeID_year_month_1`, on the
reasoning that a query naming one item type over a range of months needed `typeID` ahead of the month
fields. The reasoning was sound and the premise was not: the range is bound on an ordinal computed in
an `$addFields` stage, so no index reaches `year` or `month` at all and both tails were dead weight.
What the two specs actually distinguish is whether production-chain buckets are excluded, so that is
what they lead with now — `atm_owner_isProductionChain_typeID_1` for the default views and
`atm_owner_typeID_1` for the same views with the chain included.

`statistics_totals` gained `apt_owner_typeID_1`, which serves the lifetime read in both its forms and
the `typeID` order it returns in. It had no index of its own before — the collection was previously
reached only by `_id`.

### Schema maintenance

`archived_jobs` joined the schema-maintenance rotation, because it carries `schemaVersion` like the
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

The **document says who owns it**: `models.MetaData` — embedded in `JobMetaData` — declares one
`Owner`, stored at `_meta.owner`, and the changestream routes on it. A corporation-owned job is one
whose owner kind is `corporation` and whose id is a corp ref; there is no separate per-scope field to
set. See § The owner block.

What is missing is the second half of a **producer**. A stored job now records the corporation and
character ids ESI supplied for its lines — see § Ingest — entity ids on stored jobs — but nothing
in `services/` decides from them that the job belongs to a corporation and assigns
`MetaData.CorporationRef`, so every stored job is personal and a corporation archive would be
empty. Its query and
index shapes would be guesses no data exercises. What may legitimately scope a job to a
corporation, and what dev actually holds, is in [plan.md § What may scope a job to a
corporation](./plan.md#what-may-scope-a-job-to-a-corporation). The contract a corporation document
has to meet is in [Stage C](#stage-c--corporation-statistics-pipeline).

So `corporation_archived_jobs`, `corporation_production_totals`, `corporation_timeline_months`,
the `CorpRebuildQueue` (`corporation_stats_rebuild_queue`, with `QueueCorpRebuild` /
`ListQueuedCorpRefs`) and the corp `_id` builders land together with Stage C, when that stage is
committed to rather than deferred.

These are **new** collections, so they take the convention in
[collection-naming](../collection-naming/plan.md) from the start rather than being renamed later.
Corporation-scoped data is the case the `<scope>_` prefix exists for, and it is the first
collection set that is not account scoped. The names also follow the Stage D vocabulary — see
[§ Naming](./plan.md#naming) — so `statistics_totals` and `statistics_timeline` rather than
`statistics_totals` and `statistics_timeline`.

Index definitions do **not** land in `services/`. Development has no index-creation code there at
all; `deployment-tool/internal/dataplane/mongo/index_specs.go` is the declared source of truth,
applied by `eip ensure-mongo`, and it already carries an `archived_jobs` entry. The new collections
get `IndexSpec` entries there — an operator-surface change, not a services one.

## Stage B — account statistics pipeline

_Landed._ The transformation, the worker rebuild, the drain, its task and handler, the archived-jobs
producer and the hourly schedule are all committed, so queue → publish → drain runs end to end — see
[The schedule](#the-schedule).

### The transformation — `shared/statistics`

Pure: no Mongo, no clock, no key material, so the attribution rules are testable apart from the
worker that applies them. `now` is a parameter, which is what makes a rebuild reproducible.

`BuildAccountSnapshot` reduces one archived job to its `statistics_rows` row.
`AccumulateAccountBuckets` and `AccountBuckets` fold those rows into `statistics_timeline`.

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

**Ownership is not decided here.** A job belongs to one archive — personal or corporation — and
every line it carries is counted for that archive's owner. The transformation therefore reads no
corporation at all: it aggregates the jobs it is given. Which archive a job lands in is a scoping
decision made when the job is created, described in
[plan.md § What may scope a job to a corporation](./plan.md#what-may-scope-a-job-to-a-corporation).

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

The rename left 4,039 `statistics_totals` documents written by the old `$inc` worker, which
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

`DispatchStatisticsRebuilds` (`task.scheduled.dispatchStatisticsRebuilds`, Priority4, 15
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
error anywhere to say so. `TestDispatchStatisticsRebuilds_TaskNameIsRegistered` pins the name,
the `ByName` row and the resolved timeout together.

### The schedule

`ScheduleDispatchStatisticsRebuilds` publishes one drain task per tick, registered in
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

## What a non-account owner needs before its statistics can be served

There is no separate corporation pipeline, and none is owed: the reduction, the rebuild, the queue,
the delta and the rota all take an owner, and the storage keys on one. A corporation is a kind, not a
second implementation.

What is not open is the statistics route, which parses an owner and answers 403 for any kind but the
account's own — deliberately, until [shared-planners](../shared-planners/plan.md) makes that a grant
lookup. The rest of this section is the contract a non-account document has to meet for a change on it
to reach a browser, traced through machinery that is built and carrying account traffic today.

### What a corporation document has to supply

The org-scoped delivery path is built and unexercised: corporation and alliance documents do
not exist yet, and the machinery was written ahead of them deliberately. Traced end to end,
the pieces below are in place and correct; what follows is the contract the eventual document
has to meet for a change on it to reach a browser.

**Already built.** `deliverOutboundDocUpdate` switches on the owner's kind, and a `corporation` owner
goes to `broadcastToCorporationScope`, which matches the ref against `Server.corpRefToClients` —
populated from each client's `Scopes.CorporationRefs` when it sends `upgrade_scopes` — and then refuses
any client whose granted scopes no longer hold that ref. `Owner.Key()` is the tenant key,
`_meta.owner` states the owner on the document, and `outgoinglogic.ClientPayload` strips the routing
metadata and restores ids in the body. See § How a change reaches the right clients.

**What the producer must add.**

| Piece | Where | Why |
|---|---|---|
| The collection itself | `shared/mongo` | Nothing stores corporation-owned documents today |
| A `CollectionGroup` entry | `core/changestream/collection_groups.go` | The three groups — account, planner, blueprints — watch collections every kind shares, so a new collection needs a home |
| `_meta.owner` naming a corporation | the write path | The watcher routes on the owner a document states; without one it has nothing to route on |
| `scopes` where delivery must narrow under the org root | the write path | Optional; absent means full fan-out under the root |

An account-scoped document needs none of this — `_meta.owner` routes it whatever its kind, which is
the path job documents take today. See § The owner block.

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

`totals` takes an optional `typeID`, and a **present** one must be positive — "everything" is asked
for by omitting it, not by sending `0`. The unfiltered read returns a row per item type, each with an
unbounded per-job snapshot array, so a view wanting the archive as a whole asks for `summary=1`
instead: the server folds every row into one `total` and returns no items. Summing client-side would
ship the account's entire history to compute one figure.

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

`extraCategoryTotals` cannot be `$sum`med: it is a map keyed by category id, and `$sum` does not
merge maps. The monthly view collects the maps with `$push` instead and folds them through
`SalesMeasures.Plus`, which merges by category. `$push` skips documents where the field is missing,
so a month of buckets carrying no extras collects nothing rather than a list of empty maps.

Every other measure is summed, and the `$group` stage is **derived from `SalesMeasures` itself** by
reading its `bson` tags: a measure added to the document reaches the aggregation without anyone
remembering to list it. The failure it prevents is silent — an unlisted measure aggregates to zero
rather than erroring, which is how the extras gap presented before it was found.

### What a period cost, and what it was spent on

A month carries the components of its cost as well as the total:

| Measure | From |
|---------|------|
| `materialCostTotal` | the job's purchase cost |
| `installCostTotal` | install fees |
| `inventionCostTotal` | invention cost |
| `extrasTotal` | the job's extras, also carried per category in `extraCategoryTotals` |
| `brokersFeeTotal` | broker fees, in the month each fee fell |
| `transactionFeeTotal` | transaction tax, in the month each sale fell |

**Those six are what a job cost, and the arithmetic over them exists once.** `JobCostParts` owns it:

| Method | Is |
|--------|-----|
| `Build()` | materials + install + extras + invention — what it cost to make, and what a monthly bucket counts |
| `Total()` | `Build()` + broker fees + tax — what the job cost |

Building and producing are the same act, so there is one method for it. Invention is part of it: a job
that had to invent its blueprint cost that too. That also settles `buildCostTotal`, which is served on
the totals row and previously excluded invention while `jobCostTotal` included it.

A job and a reduced row are two representations of the same thing, so each has a **reader** that fills
`JobCostParts` from its own fields — `Job.CostParts()` and `ArchivedJobStats.CostParts()` — and
neither does any arithmetic. Every caller sums through the methods above, so a change to what a cost
is happens in one place.

`totalBuildCosts` is **gone** from both `ArchivedJobStats` and `BuildStatSnapshot`. It was a stored
sum of the three build components, written beside them and read by nothing once the components became
the truth — and holding both is what let two versions of the cost calculation exist. `JobCostParts`
answers the same question with `Build()`. Documents written before this keep the field inertly; the
driver ignores what the struct no longer declares. It sits on the
model rather than in `statistics` because it is arithmetic over one document's own fields, the same
reason the `Plus` methods live there. What belongs in `statistics` is the interpretation — which
components a bucket counts, which segment a job falls in, what dates it.

A bucket's own `jobCostTotal` is deliberately narrower — the cost of building, without the two fees. Buckets carry each fee as its own measure in the month it fell and subtract it from profit
there, so folding fees into the cost as well would both count them twice against profit and move them
into the job's cost month. `jobBuildCost` states that relationship where it is computed.

## Stage E — frontend

Landed for the account scope.

### What reads what

| View | Endpoint | Shows |
|------|----------|-------|
| `Dashboard/Components/ArchivedStatsOverview` | `timeline` | This month against last — sales, job cost, profit, each with the change |
| `Dashboard/Components/ArchivedItemBreakdown` | `timeline/items` | Which item types drove the month, ranked server-side |
| `Dialogues/Blueprint Archive` | `totals` | One item type's lifetime figures, split into four segment blocks |
| `Edit Job/.../Archive Jobs Panel` | `totals` | What the item has cost before, from the `history` marks on the row |

Three modules serve them, named for the views rather than for the retired producer:
`statisticsTimeline.js` (the two timeline reads), `statisticsTotals.js` (lifetime totals), and
`statisticsKeys.js`, which owns the shared key root and the invalidation helper both depend on —
each with a matching module under `Hooks/React Query/Backend/`.

Every view is keyed under one root: `["backend", "statistics", …]`, with `timeline`,
`timelineItems` and `totals` beneath it. Archiving a job queues a rebuild that recomputes all three
collections, so `invalidateStatisticsQueries` invalidates that whole root rather than one type —
a single call, because totals no longer sits under a root of its own.

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

## Stage F — archived jobs read API

The archive is readable. `GET /api/v1/archived-jobs` serves a paged list of summaries and
`GET /api/v1/archived-jobs/{jobID}` serves one full document, both scoped to the session's account.
`PUT` is unchanged.

### The routes

`archivedjobs.Router` dispatches on path shape and then method. A job id is one path segment; a
deeper path is a 404 rather than a job whose id contains a slash, which keeps the restore routes
free to live at `/{jobID}/restore` and `/groups/{groupID}/restore` later.

| Route | Method | Serves |
|-------|--------|--------|
| `/api/v1/archived-jobs` | GET | a page of summaries |
| `/api/v1/archived-jobs` | PUT | the batch upsert, unchanged |
| `/api/v1/archived-jobs/{jobID}` | GET | one full job document |

The account is never named in a path. It is resolved from the session by the auth middleware, so a
caller can only address its own archive — the same rule the statistics views follow, and the reason
neither carries an account segment.

A job belonging to another account is **not found**, not forbidden: the reply does not distinguish a
job that is not yours from one that does not exist, so the endpoint cannot be used to probe which
job ids exist.

### The list serves summaries assembled from two collections

A row draws a job's identity and its money, and those live in different places. The job document
holds the name, item, group and dependency links; the figures are on the statistics row the rebuild
writes. `listArchivedJobs` reads the first with a projection, and `loadArchivedJobStatsByJobIDs`
reads the second **by `_id`** — `ArchivedJobStatsDocumentID` builds `accountID|jobID`, so this is a
keyed read of the page's jobs rather than a join pipeline running per row.

### The queries live in the API, the contract stays shared

`api/v1endpoints/archivedjobs/archivelist.go` holds the list and single-document queries. They are
unexported functions taking the shared `*eipmongo.Mongo` store, reaching Mongo through
`.Collection()` and `eipmongo.Retry` — the pattern `putHandler.go` in the same package has always
used.

`services/shared/` is for code more than one service runs. Nothing outside the API will call these:
no other service serves an HTTP list. What stays shared is what more than one service depends on —
the store handles and `Docs` plumbing, `models.*`, `statistics`, and, most importantly here, the
**filter helper and the id builders**:

| Shared | Why |
|--------|-----|
| `ArchivedJobAccountFilter` | the API list and the worker rebuild must agree on what owning an archived job means |
| `ArchivedJobStatsDocumentID` | the worker writes these ids and the API reads them |
| `models.*`, `statistics` | shapes and arithmetic three services persist and compute |

That is the seam that matters: **filters and id builders are the contract, the queries built from
them are not.** Three services already query `archived_jobs` directly — the API, the worker's
migration import, and `core/commands` — each with its own query over the same shared filter.

Two pre-existing cases sit the other way and are **not** fixed here, being outside this stage:
`shared/mongo/timeline.go` has no consumer outside the API, and `production_totals.go` plus
`rebuild_queue.go` are worker-only. Worth splitting by consumer once Stage G has settled what
restore needs from that code, so each query moves once rather than twice.

The projection is the point of the endpoint: an archived job carries its whole build, every
material and every sale line, so a page of fifty unprojected documents would ship megabytes to draw
a table of names and figures.

**A job with no statistics row reports no measures at all**, rather than zeros. The row is written
by the rebuild, so its absence means the job has not been folded yet — which is a different claim
from a job that earned nothing, and a zeroed row would state the wrong one. Revoked rows are skipped
for the same reason: they describe a job the rebuild has superseded.

**The figures come from `statistics.JobMeasures` and `statistics.JobSegment`**, exported for
this endpoint rather than restated in it. The arithmetic has two rules that are easy to get wrong
and were got wrong while writing this — `jobCostTotal` already contains both fee totals, and
`profitLoss` is zero rather than negative when nothing sold — so the list reads the same reduction
the totals are folded from. The segment names moved to constants on `models` at the same time
(`BuildStatsSegmentProductionChain` and friends), so the classification has one owner rather than a
literal in each place that reports it.

### Filters narrow, they do not define a window

The list accepts `from` / `to` as `YYYY-MM` against the archive month, plus `typeID`, `groupID` and
a `search` over the job name, with `sort` / `order` / `limit` / `offset` paging.

**One bound is meaningful here**, unlike the timeline. A statistics view is *defined over* a window,
so a half-given range there is rejected — a caller asking for "since March" and silently getting
"March to March" would see missing data. A list is the whole archive narrowed, so "everything since
March" is a coherent request and one bound is accepted. A reversed range is still refused, because
it matches nothing and an empty archive reads as data loss.

`search` is quoted with `regexp.QuoteMeta` before it reaches the filter. Job names contain brackets
and full stops, so an unquoted pattern would be either an invalid regex or a wildcard matching the
wrong rows. Its length is bounded because the filter is a regex over an indexed field: an unbounded
pattern is work a caller asks for cheaply and the database cannot.

Sorting is validated against `ArchivedJobSortable` rather than passed through to the `$sort` key,
the same rule `TimelineSortable` applies to the item breakdown. The page sorts on `_meta.archivedAt`
descending by default — newest first, because the job a user wants back is usually one they archived
recently — with `jobID` breaking ties so paging is stable: two jobs archived in the same instant
would otherwise be free to swap between pages.

### Rows report both a group and a related set

A group is a container the user made; a related set is a structural fact about a build. Neither
implies the other, so a row carries `groupID` and `relatedSetID` and the client decides which block
to draw it in.

The set is computed by union-find over the page's jobs, following `parentJobs` and
`build.childJobs` in both directions — a parent naming its child and a child naming its parent
describe one edge. The id is the **lowest job id in the set**, so the same set carries the same id
across requests and pages, which a client uses to keep a block collapsed or selected.

A job that links to nothing carries **no** set id and is drawn as a standalone row: a set of one is
a container the build does not have. A job whose only link points outside the page is still marked
as linked — the link is evidence it belongs to a chain — but cannot join two rows together.

`relatedJobIDsInArchive` is the traversal Stage G restores over: the walk the SPA runs in
`getAllRelatedJobs`, moved to the archive because that is where the documents are. It returns only
what the archive holds, so a chain straddling the boundary does not invent its missing half.

### Shared query parsing moved to `api/helper`

`ParamError`, `BadParam`, `RespondParamError`, `ParseTypeID` and `ResolvePaging` now live in
`api/helper/queryparams.go`, and `statistics` was moved onto them rather than keeping a second copy.
Both endpoints accept the same vocabulary — a month range, an item type, sort/order/limit/offset —
so the parsing and the rejection codes have one owner, and a client that can drive one view can
drive the other.

`ResolvePaging` takes a `PagingRules` describing what a view accepts (its sortable fields, its
limits, and the code prefix that namespaces its failure classes), so the shared parser does not need
to know which endpoint called it. `MonthKey` gained `ParseMonthKey`, `IsZero` and `Start`, keeping
the wire format's parser beside `String`, its inverse.

### Indexes

Three specs in the Deployment Tool (`internal/dataplane/mongo/index_specs.go`), matching the
filters: the owner with `_meta.archivedAt` descending for the default ordering and the range
filter, and owner-led indexes on `itemID` and `groupID` for the other two. Index ownership sits
there rather than in `services/`, per the salvage decision.

### Tests

Covering the parsing, the grouping and the routing: that the bare list filters nothing while the
timeline defaults a window; that one bound is accepted and a reversed range is not; that regex
metacharacters in a search are literal; that every advertised sort field is actually accepted, so
the rejection message cannot name a value the endpoint refuses; that a chain reaches one set from
either direction and separate chains stay separate; that a self-reference is not a link and a cycle
does not hang the walk; and that the routes dispatch on method and depth, with the deeper restore
paths still 404 until Stage G serves them.

## Group membership while a job is archived

A job archived on its own stays a member of the group it belongs to. The archive is not a way of
leaving a group, and the group relationship is what lets a restore put the job back where it came
from.

This is reachable through the ordinary planner. Marking a group member **ready for sale**
(`Job.toggleGroupJobReadyForSale`) sets `displayOnPlanner` and leaves `groupID` and `includedInGroup`
alone, so the job appears on the global planner grid while still belonging to its group. Opened from
`/jobplanner` there is no active group, so the Edit Job archive button renders and archives that one
job. Its group is untouched and stays on the planner.

### The group records which members are archived

`models.Group` carries `archivedJobIDs` beside `includedJobIDs`, and `Group` in the SPA carries the
matching set:

| Field | Holds |
|-------|-------|
| `includedJobIDs` | Every member, archived or not |
| `archivedJobIDs` | The members currently in the archive |

The **derived** fields — `includedTypeIDs`, `materialIDs`, `outputJobCount`, and the three linked-ESI
sets — describe the members still on the planner. An archived member's contribution comes out when it
is archived and goes back when it is restored, which keeps them recomputable from the jobs the store
actually holds.

Two consequences follow from splitting membership this way:

- **A recompute cannot silently drop an archived member.** `Group.updateGroupData` and
  `Group.removeJobsFromGroup` rebuild membership from the live `jobArray`, which by definition does
  not contain archived jobs. `_setLiveIncludedJobIDs` re-adds `archivedJobIDs` after every rebuild,
  so deleting one member does not evict the archived ones.
- **The group knows why a member will not load.** `groupFrame` asks for job documents for the live
  members only, rather than requesting an archived member's document on every open and getting
  nothing back.

`Group.markJobsArchived(jobs, jobArray)` performs both halves — mark, then recompute from the
remaining live jobs — and `markJobsArchivedInGroups` applies it across the groups a batch of archived
jobs belongs to and persists them. The archive button calls it after the archive write succeeds.

Wire compatibility: `archivedJobIDs` is **additive** on the group document and on `PUT /v1/groups`.
A client that does not know the field ignores it, and an absent field means no archived members.

### Archiving a whole group still deletes it

`archiveGroupJobs` archives the group's jobs and deletes the group document, which is why a restore
has to be able to rebuild a group that no longer exists. It holds back members that are on the
planner in their own right: those are not archived, not deleted, and stay on the planner still naming
the group they came from. That name is what a later rebuild uses to find them.

## Stage G — restore

Archived jobs come back to the planner. Three routes, all POST, all account scoped by the session:

| Route | Restores |
|-------|----------|
| `POST /api/v1/archived-jobs/{jobID}/restore` | that job alone |
| `POST /api/v1/archived-jobs/groups/{groupID}/restore` | every archived job carrying that `groupID` |
| `POST /api/v1/archived-jobs/related/{jobID}/restore` | that job and every archived job reachable through parent/child links |

POST rather than GET because they create planner documents and delete archived ones — not something
a navigation or a prefetch should reach. One handler serves all three: they differ only in how they
choose jobs, and everything after that choice is a sequence that must not diverge.

All three answer the same body: `restoredJobIDs`, the `jobs` as written, any `conflicts` and
`unresolved` ids, and `groups` — the containers the restored jobs rejoined. `groups` is a list
because one restore can reach several.

### Every restored job returns to its own group

A restore does not take a group id from the request. Each archived job carries the group it belongs
to, so `groupJobsByGroupID` splits the restored set by `groupID` and each group is written
independently. One related-set restore can therefore reach jobs archived from several groups and
return each to the right one, and a job with no group is simply left on the planner.

For each group the restore takes one of two paths:

| The group is | What happens |
|--------------|--------------|
| Still on the planner | `Group.AddJobs` — membership loses the archive marks, the derived sets gain what the jobs contribute, and `groupName`, `groupStatus`, `areComplete` and `showComplete` are left as the user left them |
| Gone | `rebuildGroup` over **every job that names the group**, not only the ones coming out of the archive |

The merge exists because the group may never have been deleted: the ready-for-sale route archives one
member and leaves the group standing. Rebuilding such a group from the restored jobs alone would
overwrite the live document, evicting its remaining members and resetting the name and completion
state.

The rebuild reads live members through `liveGroupMembers`, one
`LoadJobsByFilter(accountID, {groupID})` — the account scope is merged into the filter by the query
itself. It is a single read rather than two because the restored jobs are written to the job
documents collection **before** the group is written, so by then they are live documents and the
lookup returns them alongside any member that was never archived. An empty result falls back to the
restored jobs, so a read that cannot see the writes cannot produce an empty group.

### The group's lock stands for its archived members

An archived job has no editor, so it holds no document lock of its own. Its group's lock stands for
it, and the restore is gated on that:

| The restore touches | Gated on |
|---------------------|----------|
| A job that belongs to a group | That group's lock |
| A job with no group | Its own job document |

`restoreLockRejects` runs before any write and answers 409 through
`helper.RespondLockHeldElsewhereJSON` when another session holds one of them, naming the group in
preference to a member job. The session holding the group may restore its own members.

The gate refuses; it does not acquire. Sessions that hold nothing learn about the restore from the
document fan-out: `CollectionAccountJobGroups` travels the same change stream group as job documents,
and the SPA's group handler replaces the stored instance and clears that group's pending write, so a
session holding an older copy drops the save it was about to make rather than writing it back.

### The order is the reverse of archiving, and it matters

1. Decrypt entity refs back to raw ids.
2. Resolve ESI links against the planner.
3. Write the job documents.
4. Re-link the free ESI ids on the account.
5. Rebuild and write the group, when the route asked for one.
6. Delete the archived documents.
7. Queue the statistics rebuild.

**The job document is written before the archived document is deleted**, so a failure part-way
leaves the job in both places rather than in neither. A job present twice is visible and
recoverable; one deleted from the archive before its planner copy existed is gone.

**The rebuild is queued last** because it recomputes from the archive and has to see the deletion.
That is also why deleting needs no decrement logic: `RebuildAccount` folds every archived job the
account still holds, so removing a document and queueing is sufficient and idempotent.

### The ESI re-link is written server-side

The linked sets are three arrays on the `accounts` document, and the SPA had been their only writer
— it holds them in Zustand and persists them wholesale through `PUT /api/v1/user/main`. That makes a
server write look unsafe, as though the client's next save would overwrite it.

It is safe, because the document is realtime synced end to end: `accounts` is in the `account`
change-stream group, `applyRemoteMessage` routes an upsert on it to `handleUsersDocumentUpsert`, and
that calls `applyUserDocumentFromRemote`, which patches `linkedOrders` / `linkedJobs` / `linkedTrans`
straight into the store. The client's copy is updated before it would next save from it.

Writing it here is what keeps restore atomic. Returning the ids for the SPA to apply would put the
job write and the re-link in different processes — the split that lets the archive flow strand a job
today.

Two details the write depends on:

- **`$addToSet`, not read-modify-write.** Another session may be linking at the same time, and
  re-running a restore must not duplicate an id.
- **`_meta.lastModified` is bumped.** The SPA drops a realtime event older than its cursor, so a
  write that did not move the document's clock would be ignored and the re-link never applied. The
  session and client ids are stamped for the same reason every other write does it.

### Conflicts are reported, not fatal, and the job is stripped

Archiving released the job's ESI ids, so another job may have claimed one since. The **planner's job
documents** are the authority on what is claimed now — the account's linked sets record that an id is
in use but not by which job, and a user told only that something failed cannot act on it. Each
conflict names the id, its kind, and the job holding it.

A restored job keeps only what it reclaimed. Leaving a conflicted id on the document would show a
link the account does not hold, and the next save would try to claim it back from its owner.

Two rules the resolution depends on:

- **Kinds do not cross.** Orders, jobs and transactions are separate series whose ids can collide
  numerically, so a conflict on one kind never strips that number from another.
- **The set being restored excludes itself.** A related set restored together would otherwise report
  its own members as conflicting holders once the first of them was written.

A job holds an ESI id by carrying its row, so both sides of the check read the rows: the restoring
job's own ids come from `Job.LinkedOrderIDs`, `LinkedESIJobIDs` and `LinkedTransactionIDs`, and a
holder is found by searching those same paths. A conflicted entry is dropped by removing the row
itself.

Lookup is one query per kind, not per id: a job's ids go in together with `$in`, so a job linking a
hundred transactions costs one round trip. Three indexes in the Deployment Tool serve it —
the owner with each of `build.sale.marketOrders.order_id`,
`build.costs.linkedJobs.job_id` and `build.sale.transactions.transaction_id`.

### Groups are rebuilt from their jobs

Archiving a whole group deletes the group document while every archived job keeps its `groupID`, so
the container is gone but derivable. `rebuildGroup` computes the name, output count, type and
material ids, member ids and all three linked-ESI sets from the jobs alone. Nothing in a group is a
fact its jobs do not already hold.

The SPA derives the same fields from the same jobs in `Group._buildNewGroupData`. That the two agree
is held by a shared corpus — see § Stage I.

**Only a parentless job is an output.** It is what the output count counts and what names the group,
so an intermediate feeding another member must not be mistaken for one.

Two fields are **not** derivable and reset rather than being invented: `groupStatus` returns to zero
and `areComplete` starts empty. Both describe workflow progress at the moment of archiving, which
was never recorded per job, so inventing either would tell a user the group was further along than
anything can attest. `showComplete` and `groupType` take their SPA defaults.

Ids come back sorted, so an unchanged group does not look modified — map iteration order would
rewrite the document differently on every restore. The name is capped at 75 characters, the same cap
counted the same way as in the SPA.

A rebuild gathers **every job that names the group**, not only the archived ones — see § Every
restored job returns to its own group. Restoring a single job restores its group membership with it;
which of the two paths runs depends on whether the group document survived, not on how the restore
was addressed.

### An archive is addressed by scope, not by account id

Every read and write goes through an `archiveScope`: the collection, the ownership filter, the
statistics-row id builder, the rebuild-queue call, and whether the archive reclaims ESI ids.
`accountArchiveScope` builds the only one with a producer today.

The shape exists because the corporation archive is a **separate collection** with its own rebuild
queue — `corporation_archived_jobs` and `QueueCorpRebuild`, per the plan — rather than a different
filter over the same rows. Passing a corporation ref where an account id went would have queried the
wrong collection entirely, so the coupling to fix was never the id: it was that the collection, the
filter and the queue were named at each call site.

With the scope threaded through, the parts that carry the reasoning are already scope-free:

| Reusable as-is | Why |
|----------------|-----|
| `relatedsets.go` | union-find and the archive walk read summaries and know nothing about ownership |
| `grouprebuild.go` | jobs in, group out; no collection and no owner |
| conflict handling in `esilinks.go` | `conflictIndex`, `stripConflictedLinks`, the link set algebra |
| `restoreJobs` ordering | write, re-link, group, delete, queue — the sequence a second archive must not re-derive |
| list filters, paging, response shapes | the owner is a value on the query |

**ESI re-linking is deliberately not generalised.** The linked sets live on the `accounts` document
and ESI ownership is per account, so an archive without them has nothing to reclaim rather than a set
it should reclaim differently. `relinksESI` says so on the scope, and `restoreJobs` skips both the
resolve and the write when it is false — the alternative, running the re-link against a corporation
ref, would search the wrong owner's job documents.

Two things a corporation scope will still have to decide, which no seam can settle in advance: where
a restored corporation job is written, since `BulkUpsertJobs` targets `job_documents`, and
what a corporation group means. Both are Stage C questions about behaviour, not about plumbing.

### Restored documents reach clients through the existing fan-out

No subscription step is owed. Delivery is owner-routed, not per document: the change stream reads
`_meta.owner` off the written document into the message's `ownerKey`, the websocket parses it back into
an owner, and an `account` kind goes to `broadcastToAccountClients` — every connection for that
account. Explicit per-document subscribers are only the fallback for a payload stating no readable
owner.

The JetStream filter is `doc.update.{tenant}.>`, a wildcard across the tenant, so a document that did
not exist when a client connected still arrives. All four collections a restore touches are watched:
`job_documents` and `job_groups` in the `planner` group, `accounts` in `account`, and
`archived_jobs` is no longer watched at all — J1 removed its group. `BulkUpsertJobs` and
`BulkUpsertGroups` write `_meta.owner` themselves, so the routing metadata is always present on what
restore writes.

Two things this depends on, both of which would fail quietly:

- **Every write moves `_meta.lastModified`.** The SPA drops a realtime event older than its cursor, so
  a write that did not move the document's clock would be routed, delivered, and then discarded.
- **The originating client is excluded from its own broadcast.** `broadcastToAccountClients` skips
  the source client id, so the tab that called restore is the one tab the push does not reach. The
  restore response therefore carries the restored job **documents** as well as their ids, and the
  rebuilt group, so the calling client applies the change itself rather than waiting for a push that
  is not coming. Returning them costs nothing: the handler has already decrypted and link-resolved
  them to write them.

### A chain can straddle the archive boundary

The related walk runs over the whole archive rather than one page — a chain is not guaranteed to
fall inside whatever page a client last read. It returns only what the archive holds, and ids that
resolve to nothing archived come back in `unresolved`: a job's parent may still be in the planner
while its children are archived, and a job may have been deleted. Neither is an error, so neither
fails the restore.

### Tests

The group rebuild and the link resolution carry the reasoning, so they carry the tests: that
everything is derived from the jobs; that only parentless jobs count as outputs; that workflow
progress resets rather than being invented; that a group of pure intermediates still gets a name;
that ids are sorted and stable; that a conflict on one kind does not strip the same number from
another; and that a job with no links short-circuits. The router tests pin the three shapes
dispatching, restore refusing anything but POST, and near-miss paths staying 404.

## Stage H — archived jobs page

`/archived-jobs` is a `_protected` file route lazy-loading its component through `Suspense` and
`LoadingPage`, wrapped in `DefaultPageLayout` and reached from the side menu. It carries two tabs
over the endpoints Stages D, F and G serve.

### The statistics tab

Metric cards, eight charts and the item table, all reading `totals`, `timeline` and
`timeline/items`. The period control sits in its own row above them, right aligned, with `Period` as
the select's helper text.

The charts are three layers, split so the boundary falls where the data stops being generic:

| Layer | Lives in | Knows about |
|-------|----------|-------------|
| Primitives | `Styled Components/Charts/` | recharts, the theme, and its own props |
| Adapters | beside the page's components | how to turn one statistics response into rows |
| Panels | the page | which hook, which adapter, which primitive, and the empty and loading states |

`TimeSeriesChart`, `RankedBarChart` and `PieChart` take rows and a series description, never a query
result, so the same component draws profit against months, cost by item, or extras by category. The
price-history dialogue moved onto them, which is what made them shared rather than page-local, and
the chart chrome is overridable so price history keeps its own.

Every figure a reader sees comes from `Functions/Helper/numberParser`: `formatNumberForLocale` for
hover values and card figures, `numberToShortText` for axis ticks and abbreviated cells. No component
formats a number itself.

### The jobs tab

A list of the archive with three row shapes — a group, a related set, and a standalone job —
assembled by `groupArchivedRows`. A row carries both a `groupID` and a `relatedSetID` and they answer
different questions, so the group wins when a row has both: it is the thing the user named and
archived as a unit. Restore actions sit on the block for a group or set and on the row for a single
job.

The list is not queried until its tab is opened, so the statistics tab costs one set of requests
rather than two.

The item table shows five rows or ten. Expanding and collapsing both animate: the extra rows fade in
on a stagger so the table unrolls, and leave together so it shuts in one step. Collapsing holds those
rows in state until the transition reports it is done, because the shorter page can arrive from the
cache in the same tick and would otherwise unmount them mid-fade. Changing the ranking drops them
outright instead — they belong to an ordering that no longer applies. `Fade` rather than `Collapse`,
which wraps its child in a `div` that is not valid between a table body and a row.

### The charts, and what each answers

| Panel | Reads | Shows |
|-------|-------|-------|
| Monthly totals | `timeline` | cost and sales per month, with profit as a line |
| Cumulative profit | `timeline` | running profit across the window |
| Where the work went | `totals?summary=1` | the archive split across the three segments |
| Top items | `timeline/items` | each item's share of the selected measure |
| What it cost | `timeline` | the six cost components per month, stacked |
| Costs for the period | `timeline` | the same six summed over the window |
| Extras by category | `timeline` | extras per month, by category |
| Extras for the period | `timeline` | extras summed over the window, by category |

The paired shapes answer different questions: a monthly chart says **when**, its pie says **what**,
and the pie reads the response's own `totals` rather than re-summing the months so the two cannot
disagree.

A pie slice is a share of a total, which a negative figure cannot be, so non-positive values are
dropped. On Top items ranked by profit that is a likely outcome rather than an edge case, so the
panel distinguishes "no item profited" from "nothing archived" instead of reporting an empty period.

### Colours, keys and hover

Series that mean the same thing wherever they are drawn take their colour from a role — cost, sales,
profit, loss — rather than from their position in the rotation, so cost reads as cost on every chart.

Slice colours go on the **row**, not only on the drawn sector: recharts takes a legend swatch from
the entry's own `fill`, so colouring in a shape renderer alone draws correctly and legends grey.

Hovering a legend key highlights its slice — the sector grows and the others fade. Sector and key are
matched **by name, not by index**: `Legend` sorts its own items (`itemSorter` defaults to `"value"`)
while sectors keep data order, so the index a legend event reports points at the wrong slice. The
chart's own hover state is honoured too, so a mark and its key read the same.

### Both tabs have a mobile layout

The page fills the width it is given. Below the small breakpoint the list becomes cards rather than a
table, the statistics panels and charts stack, card figures sit under their labels, and the
statistics dropdowns align with the header controls.

## Stage I — one owner for group derivation

A group holds no fact its members do not already carry, so the whole document apart from workflow
state is computed from them. That computation exists twice, because both sides genuinely need it: the
SPA builds groups with no server, and restore is one server-side sequence. Neither copy can be
deleted, so they are held together by a shared corpus instead.

### Where the derivation lives

A group is derived from its jobs, so the group knows how, on both sides:

| SPA `Group` | `models.Group` | Is |
|-------------|----------------|-----|
| `createGroup(jobs)` | `RebuildFrom(jobs)` | the whole group, rebuilt from the jobs that belong to it |
| `addJobsToGroup(jobs)` | `AddJobs(jobs)` | jobs folded into a group that already exists |

`AddJobs` also clears the added jobs' archived marks, because a job being added is a live member.

`api/v1endpoints/archivedjobs` holds no derivation of its own. It keeps what belongs to restoring —
`restoreGroups`, `groupJobsByGroupID`, `liveGroupMembers` — and asks the group for the rest.

### The corpus is the rule

`testing/fixtures/group-derivation/cases.json` holds nine cases: input jobs, and the group document
they must produce. Both suites read that file by path rather than copying it — a Go test over
`Group.RebuildFrom`, a vitest test over `Group.createGroup().toDocument()` — so a rule that changes
on one side alone turns the other red.

The cases pin what a member contributes (its `itemID` into both the type and material sets, each
build material into materials, its three ESI id lists into the linked sets), that only a parentless
job counts as an output, that ids are sorted and deduplicated, and how the name is built.

Three rules disagreed before the corpus existed, and each was fixed on the side that was wrong:

| Rule | Resolution |
|------|-----------|
| The 75 cap | Counted in characters. The backend truncated on bytes, which can cut a multi-byte character in half |
| A blank output name | Trimmed and skipped. The SPA joined it raw, producing `", Rifter"`, and a group whose outputs are all unnamed is now `Untitled Group` rather than a string of separators |
| Order of the numeric id arrays | Sorted. The SPA emitted insertion order, so the same jobs produced two different documents and an unchanged group could look modified |

Derivation is all the corpus covers. Merge, restore and the lock gate have no SPA counterpart, and
the archived-member rules are not shared logic despite touching the same field — the SPA preserves
`archivedJobIDs` through a recompute, the backend clears them on merge. Those keep their own tests.

## Stage J — incremental statistics, reconciliation and what the client is told

Archiving a job used to rebuild every statistic its account held: every archived job reduced, every
row, bucket and lifetime total rewritten. What archiving cost therefore grew with the archive it
joined, and a build from a year ago was recomputed because something was archived today.

It costs the same now whether the archive holds ten jobs or ten thousand. A job's figures are folded
in when it is archived and taken back out when it is restored, and the wholesale rebuild is what a
rota and the tasks CLI run rather than what a user's action triggers.

Everything below is shaped around an **owner** — a kind and an id — rather than an account id, so
Stage C adds a kind rather than a rewrite. The account kind resolves to exactly the key used today.

### A job's figures are a delta

The unit is the per-job row. It is derived from the job and nothing else, so it is built where the
job already is — in the archive request itself — rather than found later by a reader working out
which jobs lack one.

| Step | What happens |
|------|--------------|
| Archive | `statistics.NewAccountRow` builds the row beside the job, written **uncounted**, and the owner is queued for a fold |
| Fold | Every row for the owner with no `contributedAt` is folded into the aggregates and stamped in the same write |
| Restore | The rows are marked revoked, keeping their stamp, and the next fold subtracts exactly what they added |

`contributedAt` does two jobs at once: it is the guard against counting a row twice, and it is the
description of what is outstanding. The rows without one **are** the work — the fold carries no list
of jobs, which is what keeps it proportional to what changed. Three properties follow: archiving
twenty jobs is one task rather than twenty, a task that dies leaves its unreached rows still
unstamped for the next run, and a row cannot be applied twice because it is stamped in the call that
applies it.

Removal is the same arithmetic negated — `SalesMeasures.Negated` — rather than a second
implementation that could disagree with the addition. `statistics.ContributionOf` calls the same
folds a rebuild calls, for the same reason.

**Emptiness is decided on a count, never on money.** Subtracting `float64` leaves a residue rather
than zero, so a bucket that should be gone would never match a test for zero ISK. Every bucket
carries `contributingRows`, and every type delta carries a job count, both exact integers.

**Two figures do not invert, and are recomputed instead.** The cheapest and dearest build cost cannot
be moved by addition — removing the cheapest leaves nothing in a counter to recover the next one
from — so each touched item type's `BuildHistoryMarks` are rebuilt from its rows.

### A claim decides who may write

A fold reads rows, then writes. A rebuild finishing in between would have counted those rows already,
and the fold's increments would count them a second time.

The queue entry carries a claim, and the claim travels with the dispatched task. A fold may only
write while `OwnerClaimIsCurrent` still matches what it was dispatched with; anything else holding
the owner accounts for those rows itself. A writer that derives aggregates from rows wholesale — the
reconcile — calls `BumpOwnerClaim` for the same reason, telling a fold in flight to stand down
rather than add its rows on top of what was just written.

Work that succeeds but cannot clear its entry has been superseded by a request that arrived while it
ran; the entry stands for that request, so its recorded failures are forgotten rather than reported
against it.

### One task per owner, dispatched rather than drained

The queue is keyed by owner and names what is outstanding: a **delta**, which is seconds of work
nobody needs to be told about, or a **rebuild**, which re-derives everything and is worth reporting.
One queue carries both, because the claim protocol, the wait and the dispatcher are per owner either
way. A rebuild supersedes a delta and never the reverse — it already accounts for whatever the
deltas would have applied.

`cron.dispatchStatisticsRebuilds` runs every two minutes and **dispatches only**: one task per
owner whose wait is up, each clearing its own entry. Rebuilding inside the dispatcher put every owner
behind one serial pass inside one task timeout, so a queue larger than that window could not finish —
and because the clear ran after the loop on the same cancelled context, a pass that ran out of time
cleared nothing and the next started from the same place.

An owner waits `rebuildDebounce` (five minutes) before its rebuild is dispatched. `queuedAt` is not
moved by a re-queue, so that bounds the **longest** an owner waits rather than sliding: an owner
changing continuously is still rebuilt once per window.

Repeated failure is not allowed to become a loop. At asynq's attempt ceiling the failure is written
to the queue entry and the task stops, which is what lets a read tell the user their figures are
stale rather than showing a recalculation that never resolves. The entry stays queued, because the
work is still outstanding.

### One place names the owner block, and one names its leaves

`shared/mongo/scope.go` holds three paths: `FieldMetaOwnerKind` and `FieldMetaOwnerID` for a filter, and
`FieldMetaOwner` for the block itself. A query that groups on the owner needs the block, because a kind
and an id only mean something together and grouping on one of them alone would pair them by position.

The reason all three live in one file is that a wrong path here is invisible: it matches nothing, reports
no error, and the compiler cannot see it. The reconcile rota was written against a root `owner` field and
kept working right up until the owner moved into `_meta` — after which it returned an empty owner list
every night and reported success. Nothing distinguishes "no owners are due" from "the path is wrong".

### The rota corrects drift without being asked

`cron.dispatchStatisticsReconciles` runs every fifteen minutes and takes the owners whose last
reconcile is older than `reconcileWindow` (24 hours), oldest stamp first, up to
`reconcileDispatchCap` (50) a tick. An owner with no stamp has never been reconciled and sorts ahead
of every stamped one, so a newly seen owner is taken on the next tick rather than waiting out a
window.

`ReconcileAccountStatistics` rewrites an owner's aggregates from its stored rows. It re-derives
nothing from job documents: rows are written whole, once per job, and never incremented, so they stay
authoritative for every aggregate above them while an aggregate can drift by a `$inc` that never
landed or landed twice. That is why repair reads rows, and why it is far cheaper than a rebuild.

**The write is unconditional, and the comparison only reports.** Detecting drift and correcting it
are separate so a fault in the detection cannot stop the correction — "detect, then queue a repair"
is silent exactly when detection is the broken part. Money is compared on a relative tolerance
falling back to an absolute one near zero, because repeated `$inc` and a single summation do not
produce identical `float64`s; integer counts are compared exactly and are the signal that
distinguishes a bug from arithmetic.

The rota is also the backstop for a row that was never written: `writeRowsForNewlyArchivedJobs` turns
archived jobs with no statistics row into rows before the fold, so a job the fold could never see —
because its work list is rows — is recovered rather than being invisible forever.

A job the reduction cannot read keeps its row and its figures, because it is still archived and
dropping them would take real history out of the totals over a document that cannot be parsed. The
row is stamped `skippedAt` with a reason instead, so a stale row is distinguishable from a current
one; the archive list reports `figuresStale`, the row wears a **Stale** chip, and the stamp clears
the moment the job reads again.

### What a build has cost before

The lifetime totals row carried an unbounded per-job array. It now carries `BuildHistoryMarks` — a
build count, the first and last cost month, and the cheapest and dearest cost per unit with the month
each fell in. The per-job detail behind them is a query, not a stored duplicate.

The marks are **per unit and build cost** — materials, install, invention and extras — so they
compare against an estimate of building the item rather than against what it later sold for. They are
ordered by **cost month** rather than archive date: a job's costs are filed under the month
production started, which can fall years before it was archived, so ordering on archive dates would
make "last build" the last row written rather than the most recent build.

Monthly buckets gained `quantityProduced`, which makes cost per unit derivable from a month, and
`isProductionChain` joined the bucket key. Chain output gets buckets of its own because its costs are
also counted through the parent job that consumed them: a view summing across item types reads the
direct buckets alone, and a view scoped to one item may ask for both with `includeProductionChain`,
which is the whole history for an item only ever built as an intermediate.

The `archive_and_stats` change-stream group is gone. Nothing subscribed to archive or statistics
documents, so the fan-out ran end to end and was thrown away at the last step.

### How the client learns the figures moved

Realtime messages describe themselves with two fields. A **family** says how to route the message at
all, and a **kind** says what to do with it inside that family; before them, "this is a document
change" was implicit in the shape, so anything that was not one had nowhere to go and was dropped
without a word. An absent family reads as `document`, because producers of those predate the field.

| Family | Kinds |
|--------|-------|
| `document` | a change to a document, carrying its collection and body |
| `notification` | `archiveStatsProcessed` — an owner's figures have been written |

The SPA cannot import the Go constants, so both sides read one corpus,
`testing/fixtures/realtime-messages/kinds.json`; adding a kind on one side without the other turns
the other red.

The notification is **core NATS, not JetStream**, published without acknowledgement or retry. One
replayed three hours later is worse than silence, and nothing is lost by dropping one: every state it
announces is readable on the next request. It saves a client from waiting for that request, which is
all it should be trusted to do. It carries no figures — a client not showing them has nothing to do,
and one that is refetches what it has on screen.

Outstanding work is reported the other way, on the reads themselves. Every statistics response
embeds a recalculation envelope when there is something to say, and omits it when there is not, so a
client learns the figures are being rebuilt from the same request that returned them and there is no
window where it has drawn one and not yet asked about the other.

| State | Means |
|-------|-------|
| absent | nothing outstanding |
| `recalculating` | a rebuild is queued or running |
| `failed` | a rebuild gave up; the figures on screen are stale |

**Only a rebuild is reported.** Once a fold became the routine path, an owner is in the queue briefly
every time a job is archived, so reporting mere membership would announce a recalculation for
ordinary new jobs — the opposite of what this is for. The state is one lookup by `_id` on the queue
at read time rather than a flag stored on a statistics document, so nothing has to remember to keep
it in step.

The SPA shows it above the page's tabs, so it describes the page rather than any one panel.

## What "kept as stock" means

A job is credited to exactly one segment: a production-chain step, a recorded sale, or retained
stock. Market is decided on **evidence** — a transaction line carrying money or goods, whoever wrote
it, or a broker fee paid to list the output — and everything left over is stock. Falling the other
way put every unsold build under Market with nothing but zeros for sales and fees, which reads as a
market sale that had somehow earned nothing.

That segment answers "how many builds never sold at all". It cannot answer "how much is still held",
because a job that sold most of a run counts entirely as a sale.

**Nothing tracks kept output, and nothing should.** ESI reports what a character holds, but nothing
attributes a stack in a hangar to the job that built it, so a stored "this was kept" flag would
present a guess as a record. The archive therefore derives the quantity instead:

```
kept = quantityProduced − quantitySold
```

Both are already on every bucket, so it needs no stored field and no backfill. The **Kept as stock**
panel plots it per month, floored at zero — a month can settle a sale against an earlier month's
build, and a negative there would read as owing stock rather than holding none. Chain output is
excluded, because the timeline sums direct buckets unless an item view asks for the chain.

## Ingest — entity ids on stored jobs

`shared/jobidentity` declares a corporation **and** a character target on all four identity-bearing
line types — transactions, market orders, broker fees and linked industry jobs. Every one of those
eight fields was declared; only one of them ever received a value, because the SPA discarded the
ids before the job was written.

Each builder rebuilds its line field by field, so a field it does not list is lost. They now list
both:

| Builder | Records |
|---------|---------|
| `Functions/MarketOrders/createMarketOrder.js` | `corporation_id` and `character_id` from the order ESI returned |
| `Functions/MarketOrders/createTransaction.js` | `corporation_id` and `character_id` from the transaction ESI returned |
| `Functions/MarketOrders/findBrokersFeeEntry.js` | the **order's** `corporation_id`, and the **journal entry's** `character_id` |
| `Classes/linkedESIJob.js` | `character_id` beside the `corporation_id` it already carried |

Where the values come from: the ESI corporation fetchers already stamped `corporation_id` on
everything they return. `character_id` was stamped only by the character transaction and journal
fetchers, so the character market-order, historic-order and industry-job fetchers now stamp it too,
from the character whose token made the call. A corporation wallet names no character, so a
corporation order or transaction records `null` there, and a personal sale records `null` for the
corporation.

A broker fee inherits its order's corporation and its journal entry's character, because the fee
itself names neither.

Nothing on the backend changed — the conversion was already built and already tested. `Encrypt`
runs on the archived-jobs PUT (`putHandler.go`) and on job documents, walks the declaration, and
converts every populated id to a ref while clearing the id. What was missing was an input. The
`jobidentity` fixture now populates a character on all four line types rather than on transactions
alone, so the conversion is pinned for every field the SPA can now fill.

This is a **producer** change only. It records which corporation a line's money moved through; it
does not decide that a job belongs to a corporation. That decision is the owner written when the job
is created, which [shared-planners](../shared-planners/plan.md) owns — so every stored job is owned by
an account today and the account's archive counts them all.

Historical jobs are unaffected. On dev no stored job carries a character on any line and none
carries a corporation on a sale line, so there is nothing to convert; ESI's wallet endpoints serve
only a recent window, so none of it can be fetched back either.

## Generated archive data for development

Working on the statistics views needs an account with a populated archive. That is seeded straight
into Mongo with a standalone `mongosh` script — `.tmp/seed-archived-jobs.js`, gitignored, the same
shape of one-off data work as the archived-date backfill. It is throwaway, so it stays out of the
`tasks` CLI rather than becoming an operator surface that has to be kept working.

```
mongosh "mongodb://localhost:27017/eve_industry_planner" \
  --eval 'const ACCOUNT_ID="<accountID>", COUNT=400, MONTHS=18' \
  --file .tmp/seed-archived-jobs.js

tasks encodeJobIdentity
tasks queueArchivedJobStatsRebuild -account <accountID>
```

`eip dev` publishes the data ports on the host, so this runs from a host shell.

It writes **job documents only**. Everything the statistics views read is derived from them by the
rebuild, which is why the two commands after it are not optional: the script leaves raw character and
corporation ids on sale lines, and `encodeJobIdentity` converts them to refs exactly as the archive
PUT route would.

**A seeded job carries the fields the reduction reads, not the ones that look like totals.** Three of
them are easy to get wrong, and getting them wrong produces jobs that are accepted and worthless:
quantity comes from `itemsProducedPerRun` times each setup's runs and jobs, so a job with no
`build.setup` produces nothing and the rebuild skips it entirely; materials are summed from
`build.materials[].purchasedCost`, not `costs.totalPurchaseCost`; and installs from
`costs.linkedJobs[].cost`, not `costs.installCosts`. A job written to the second field of each pair
costs nothing but its invention and extras, and reads as almost pure profit. The generator writes
both members of each pair, as a real job does.

The shapes are mixed so every branch the statistics take is represented: jobs with parents land in
the production-chain segment, jobs with sales or a broker fee in the market segment, and jobs whose
output was kept in retained stock. Costs, install fees, invention and sale prices vary per item, and
a batch usually clears over more than one transaction.

**Extras cover live and retired categories.** Costs are filed under the account's own
`extrasCategories`, and if the account holds no deleted category the script adds one before
generating, so the views that must keep naming a retired category have something to name. A past cost
belongs to the category it was filed under, whether or not that category still exists.

Re-running is safe: the generator is seeded, so it produces the same set each time, and every job id
starts with `seed-`, which is both how the script clears its previous run and how the jobs can be
dropped without touching real ones.

## Corrections to figures already served

Changes that make a stored figure different from what it was, so a rebuild is not optional.

### A job's cost now includes invention

`computeBuildStatSnapshot` summed materials, install, extras, broker fees and tax into `totalJobCost`
and left **invention out**, while still recording `totalInventionCost` on the row beside it. Every
job with an invention cost therefore reported a cost that was too low, and a profit that was too
high, by that amount — in `profitLoss`, in `totalCostPerItem`, and in the per-transaction profit
prorated from it.

A job's cost is all six components. The definition now lives once, on `models.Job.CostParts()`.

Two assertions encoded the old arithmetic and were changed with it: `TotalJobCost` 110.25 → 112.25
and `TotalCostPerItem` 11.03 → 11.23, on a fixture carrying 2 ISK of invention over 10 units.

The monthly bucket's `jobCostTotal` already included invention, so the timeline and the per-job views
disagreed until this landed.

The same omission was in a **second** reduction: `jobMeasures` summed `TotalBuildCosts` plus the two
fees, which feeds the lifetime totals, every segment of the breakdown, and the cost and profit shown
on each row of the archived jobs list. Those understated cost by a job's invention too. Both now read one
definition through `JobCostParts`.

### Extras reach the monthly view

`TimelineMonths` collapsed its per-item buckets with a `$group` that could not carry
`extraCategoryTotals`, so `months[].extraCategoryTotals` and `totals.extraCategoryTotals` were always
absent and the extras charts could never draw. The maps are now collected and folded — see § The
aggregation.

### `totalPurchaseCost` meant two things, so nothing reads it any more

`Job.addInventionCost` added the cost to `inventionCosts` **and** to `totalPurchaseCost`, while
`addMaterialCostsToJob` recomputed `totalPurchaseCost` from the material purchases alone and so
discarded it. Whether a job's `totalPurchaseCost` included its invention therefore depended on the
order the user did things, and nothing on the document records which.

The field is no longer an input to any cost. **Materials are summed from the purchases** —
`material.purchasedCost` — on both sides: `models.Job.CostParts()` and `Job.materialCost()`. The
purchases are what was actually spent, so this is right whichever way the cached field was last
written, and it corrects historic jobs on rebuild rather than only new ones. `addInventionCost` and
`removeInventionCost` no longer touch it, so it stops diverging going forward.

The SPA's `Job.buildCost()` answers what it cost to make, invention included, and
`totalCostPerItem()` divides it — it also returns 0 rather than `Infinity` for a job that produced
nothing, a figure `passBuildCosts` passes up into parent builds. The Job Cost panel had two inline
copies of the arithmetic; both call the methods now, and the panel gained the invention row it was
missing so its itemised components sum to the total it prints.

Exposure when this landed: 178 real archived jobs carried an invention cost, and **no** live job
document did — so there was nothing on anyone's planner to migrate.

### The SPA asks the job, rather than adding it up again

`Job` answers what it cost, mirroring the backend's `JobCostParts`:

| Method | Is |
|--------|-----|
| `materialCost()` | summed from the purchases |
| `buildCost()` | materials + install + extras + invention |
| `totalCost()` | `buildCost()` + broker fees + tax |
| `brokersFeeTotal()`, `transactionFeeTotal()`, `salesTotal()` | summed from the job's own sale lines |

Nine call sites had been adding those components up by hand — five in the Sales Stats panel alone,
which is why the invention question surfaced in one place and not the others. Every reader now calls a
method; `build.costs.totalPurchaseCost` is written by the material paths and read by none of them.

### Two costs per item, named apart

A job has two per-item figures and they were both called "cost per item":

| Method | Is | Shown as |
|--------|-----|----------|
| `buildCostPerItem()` | `buildCost()` ÷ produced | **Build Cost Per Item** — the Complete panel, the group cards, and what `passBuildCosts` charges a parent for a child's output |
| `totalCostPerItem()` | `totalCost()` ÷ produced | **Total Cost Per Item** — the Selling panel and the archive views |

A parent build pays for a child's output but not for the child's broker fees, which is why these
cannot be one method. `totalCostPerItem()` now means what `totalCostPerItem` means on an archived
job, so the planner and the archive no longer use one name for two figures.

The labels follow the figure rather than the panel:

| Label | Is |
|-------|-----|
| Material Cost Per Item | material spend ÷ produced — the Purchasing tab |
| Estimated Cost Per Item | materials + the **planning** install estimate ÷ produced — the Building tab |
| Build Cost Per Item | what one unit cost to make |
| Total Cost Per Item | what one unit cost to make and sell |

The Building tab's figure keeps its own formula: it uses `getJobInstallCostForPlanning` rather than
`Job.totalInstallCost()`, so it answers a planning question rather than a cost one — setup estimates
stand in until ESI jobs are linked. Its label now says so rather than claiming to be the total.

Wording was made consistent across the panels that show the same figures — "Total Items Built",
"Total Broker Fees", "Total Transaction Fees", "Total Job Cost", "Total Sales" — so the Selling
stage, the Complete stage and the archive dialogue no longer each have their own name for one
number.

**The fee taken on a sale is a transaction fee**, in our own naming everywhere: the label, the chart
component, `Job.transactionFeeTotal()`, `JobCostParts.TransactionFee`, and the existing
`transactionFeeTotal` measures. What keeps the word "tax" is ESI's: `Transaction.Tax` is the field
the figure is read from, and `ref_type === "transaction_tax"` is the journal entry it is matched by,
so both stay as ESI names them. The structure tax percentage in Settings is a different thing again
and is untouched.

### One corpus holds the two implementations together

`testing/fixtures/job-cost/cases.json` is seven cases of a job and what it cost, read by a Go test
over `Job.CostParts()` and a vitest test over `Job.buildCost()`. It is the same arrangement as the
group-derivation corpus and exists for the same reason: the SPA and the backend both work out what a
job cost, neither can be deleted, and the question had already drifted in four places.

One case sets `totalPurchaseCost` to a figure that disagrees with the purchases, so a reader that
trusts the cached field fails. Removing invention from either side's build cost fails three cases.

### The segment split could not read its own data

`ArchiveSegmentPanel` asked for `?typeID=0`, which the endpoint rejects: a present `typeID` must be
positive. Every measure showed blank. It reads `summary=1` now.

**A statistics rebuild applies all three.** `tasks queueArchivedJobStatsRebuild -account <id>` then
`tasks dispatchStatisticsRebuilds`, or wait for the hourly drain.

## The owner block

**What changed.** Ownership used to be stated two ways: `_meta.accountID` (with
`_meta.corporationRef` and `_meta.allianceRef` beside it) on stored documents, and a root `Owner` on
the three statistics documents. It is now stated one way, in one place, on both.

### How a document says who owns it

Every scoped document carries `_meta.owner`, an `{kind, id}` pair:

```
_meta: {
  lastModified: ISODate(...),
  owner: { kind: "account", id: "<account id>" },
  clientID: "...",   // optional
  sessionID: "..."   // optional
}
```

`kind` is one of `account`, `planner`, `corporation` or `alliance`. For the organisation kinds the `id`
is an entity ref (`corp_…`, `alliance_…`), never a raw EVE id — `CorporationOwner` and `AllianceOwner`
refuse one, so a caller that has not converted fails at construction rather than routing on something
that addresses nothing.

The statistics documents embed `MetaData` like everything else, so a derived row and a job document are
read and filtered identically. The document id still leads with the owner key (`kind:id|typeID|…`); the
field exists beside it so a rebuild can prune an owner's rows with an indexed match rather than a prefix
scan over every owner's documents.

### How code filters on it

Two constants, and nothing else:

```go
mongo.FieldMetaOwnerKind  // "_meta.owner.kind"
mongo.FieldMetaOwnerID    // "_meta.owner.id"
```

```go
filter := bson.M{
    mongo.FieldMetaOwnerKind: models.OwnerAccount,
    mongo.FieldMetaOwnerID:   accountID,
}
```

These are string keys in a `bson.M`, so the compiler cannot check them: a filter naming a path no
document carries matches nothing and reports no error. That is why the constants exist and why a test
scans the module for the retired paths — during the conversion the build stayed green with around
twenty-five sites still filtering the removed field, the websocket subscribe authorisation among them.

`models.Owner` is also the only tenant vocabulary. `Owner.Key()` produces `kind:id`, which is what NATS
subjects and websocket placement route on; `ParseOwnerKey` reads one back.

### How `_meta` is written

Named fields, always. No writer replaces the subdocument, because `$set` on `_meta` replaces it entire —
which is how a stamped owner could be erased by an ordinary save.

Two upsert contracts, deliberately opposite:

| Form | `_meta` handling | Used by |
|------|------------------|---------|
| Preserving | excluded from `$set`, patched by dotted path | documents a client and the server both write — jobs, groups, archived jobs |
| With-meta | written in `$set` on every upsert | derived documents, whose writer owns `_meta` outright |

The with-meta form must write on every upsert, not on insert: a rebuild would otherwise write an owner
once and never correct it, and a row whose owner is wrong is invisible to every query and reports no
error.

**The deprecated watchlist is a third case, and it is a replace.** `UpsertWatchlistDeprecated` writes the
whole document with `ReplaceOne`, so its `_meta` is built by the writer on every save rather than patched.
It builds the owner from the account id it is given, which is what makes the stamp durable: a migration
alone would have been undone by the next save. The document is a singleton whose `_id` **is** the account
id, so the owner it writes always matches the id it is stored under.

Deprecated meant "takes no new features", not "is not read". The API serves it, the changestream carries
it, and the websocket resync filters it on `_meta.owner` — so before this it was fetched by a filter no
document could satisfy, silently. A collection stops needing an owner when nothing reads it, which is a
different test from whether anything still writes it.

Two choices in this, both taken mid-implementation:

**The writer converts, rather than the writer being converted to the preserving form.** Reshaping
`UpsertWatchlistDeprecated` into an `UpsertStructPreservingMeta` caller would have matched the other
job-shaped writers and removed the third case entirely. It was not done: the document has no Go model —
the handler passes `groups` and `items` through as `any` and the reader returns a raw `bson.M` — so the
preserving form would have meant inventing a model for a collection that takes no new features, to
delete a `ReplaceOne` that is correct once it writes the owner. The cheaper change is the one that makes
the shape right; modelling it is work the deprecation does not justify.

**`LoadWatchlistDeprecated` gained the owner filter although `_id` alone was already sufficient.** The
`_id` **is** the account id, so the filter adds no selectivity. It was added anyway, to match `accounts`
and `account_settings`, which are the same singleton shape and already filter on both: a reader that is
the sole exception is the one that gets missed when the rule changes. The cost is that the read depends
on the stamp, which is safe only because both land in one window with nothing serving.

### What a client sees

Nothing. `Owner` carries `json:"-"`, so no owner — and therefore no corporation or alliance ref — reaches
a client through `_meta`. The SPA does not read ownership off a document at all: it takes the account
from its own store, and the server takes real identity from the `X-Session-ID` and `X-WS-Client-ID`
headers, overwriting whatever a client uploads.

### The indexes

Every owner-scoped index leads with `_meta.owner.kind` then `_meta.owner.id`, in that order, and keeps
whatever trailing keys its query needs. The two fields are one key: a filter names both together, so an
index carrying only one, or carrying them below another field, does not serve it.

Superseded index names are listed in `RetiredIndexes` and dropped before the specs are created. Ensure
only ever creates, so a reshaped index under a new name conflicts with nothing and both would otherwise
survive — the old one maintained on every write and chosen by no query.

**A retired entry names the index, not the collection it now sits in.** Retirement matches by exact
name, and an index carries its own name through a `renameCollection`. So the predecessors on the three
collections renamed from `user_*` arrived spelled `ujg_`, `uwd_` and `ujd_`, while their retired entries
had been written with the post-rename `a` prefix: four entries that matched nothing, leaving
`job_groups`, `watchlist_deprecated` and `job_documents` each carrying an index on a field no document
holds. Both spellings are now listed. When a collection rename and an index reshape land together, the
retired name is the one the index was created under.

**An index a query hints must exist, and the name is spelled in two modules.** `SetHint` names an index
rather than describing one, and Mongo answers a hint it cannot resolve with `BadValue` — the query fails
outright rather than falling back to a scan. The `accounts` maintenance queries hint
`accounts_meta_lastLoginAt_1`, which `IndexSpecs` creates; services cannot import the Deployment Tool, so
the name is repeated in `core/scheduler/maintenance/mongo_hints.go` and pinned from both sides by
`TestHintNamesMatchTheIndexSpecs` and `TestIndexHintNamesAreSpelledAsSpecced`. Renaming or retiring a
hinted index means changing both files together.

### What the publish log reports

`change stream event published to NATS` logs the `account_id` the message carries, which is derived from
the document's owner by `routeField`. The watcher also keeps a locally recovered account id, read from a
root `accountID` or the retired `_meta` field: that is a **fallback** for a delete with no preimage, where
there is no document left to state an owner. Only the skip warning logs it, beside the owner, because
there the question is why no tenant could be built.

Logging the fallback on the success line would report empty for every document that carries an owner —
which is now all of them — while the message published beside it carried the right value.

### How a change reaches the right clients

`ChangeStreamMessage` carries one `ownerKey` — the document's owner as `kind:id`, the same string the
NATS subject already uses as its tenant. The watcher reads `_meta.owner`, and the key travels intact to
`websocket/server`, which parses it back into an owner and switches on its **kind** to pick a delivery
branch: account, corporation, alliance, or explicit subscribers when there is no readable owner.

The key is parsed rather than split. `ParseOwnerKey` refuses an unknown kind, an empty id, and — for the
org kinds — an id that is not an entity ref, so a raw EVE id arriving here yields the zero owner and
routes to explicit subscribers instead of fanning out to a scope it should not reach. An unroutable
message therefore under-delivers rather than over-delivers.

The switch separates the two reasons a message reaches no scope. An **empty** kind is ordinary: a delete
without a preimage states no owner. A kind the owner model accepts but this service has no branch for is
**logged**, because it would otherwise report a near-empty fan-out as a normal one. `planner` is that
case today — a valid kind with no delivery branch until shared planners add one — and it is the reason
the branch exists rather than a `default` that silently swallows it.

The owner key is routing metadata for every kind, so it is stripped from the client payload alongside
the scopes and the source ids. Nothing in the SPA reads it: the server decides who a message reaches,
and a client that has been handed one has already been chosen. `applyDocumentMessage` dispatches on
`collection`, `operationType` and `docID` only.

One consequence worth knowing: an account-scoped payload now re-encodes on its way to a client, where
previously it passed through untouched because its routing field was the one that was not stripped.

**Core and websocket are not a synchronous pair.** `doc-update-stream` keeps messages for an hour, so a
message published by one shape can be consumed by the other long after the deploy that changed it. Both
services therefore ship together, inside the window where nothing is serving — which is also why the
short retention is safe: a replica absent that long has no clients waiting on its backlog. Rolling one
service ahead of the other would leave the stream holding messages the consumer routes to nobody.

**What covers it.** Both ends of the key are tested, on the property that matters rather than on the
field: what a document's owner resolves to, and what a message's key routes to.

| Test | Holds |
|------|-------|
| `TestAccountBroadcastReachesOnlyTheOwningAccount` | Every connection of the owning account receives it and no connection of any other does — the property the owner exists for |
| `TestAccountBroadcastKeysOnTheOwnerNotTheDocument` | Two accounts holding the same document id stay apart |
| `TestUnreadableOwnerDoesNotBroadcast` | An unroutable key delivers to explicit subscribers only, never a broadcast |
| `TestAccountBroadcastRefusesAClientIndexedUnderAnotherAccount` | A stale index entry does not hand one account's document to another's socket |
| `TestMixedOwnerKindsEachReachOnlyTheirOwn` | Account, corporation and alliance messages on one server: each reaches its own holders and no other kind's |
| `TestOneClientHoldingSeveralKindsReceivesEach` | One connection holding an account, a corporation and an alliance receives all three and none it does not hold |
| `TestCorporationScopeNarrowedToAccounts` | A corporation message narrowed to named accounts skips corporation members outside the list |
| `TestCorporationScopeRefusesAClientLeftInThePool` | A client still pooled under a corporation it no longer holds is refused |
| `TestOwnerFromDocument` | The producer's owner, including that an org kind carrying a raw EVE id is refused rather than routed |
| `TestOwnerKeyMatchesTheSubjectTenant` | The message key and the subject tenant are the same string for every kind |
| `TestGroupsRouteFromTheRootAccountID` | A group, which names its account at the root rather than in `_meta`, still routes |
| `TestDecodeOutboundMessage_refusesAnOwnerKeyItCannotTrust` | The consumer refuses an unknown kind, an empty id, a key with no separator, and a raw id for an org kind |
| `TestClientPayloadStripsTheOwnerKeyOnAccountScope` | The key does not reach a browser on any kind, not only the org ones |
| `TestOutboundDocPartitionKey*` | One owner's messages share a shard and two owners do not, which is what preserves per-owner ordering |

Each was confirmed to fail against the defect it describes before being kept: removing the owner
validation, and partitioning by document instead of owner.

**Every kind is delivered by an index and a second gate, and it takes both to leak.**

| Kind | Recipients from | Second gate |
|------|-----------------|-------------|
| account | `userConnections[accountID]` | the client's own `AccountID` must match |
| corporation | `corpRefToClients[ref]` | the ref must be in the client's granted `Scopes.CorporationRefs` |
| alliance | `allianceRefToClients[ref]` | the same, against `Scopes.AllianceRefs` |

The pairing is deliberate: an index is built when a client connects or its scopes change, so it can be
stale by the time a message arrives, and the gate is what makes the stale entry harmless. Breaking
either alone changes nothing a user sees — fanning the account branch out to every connected client
still delivers nothing wrong, because the account match refuses the strangers. Only removing both
leaks, which is worth knowing before treating either as redundant: deleting one leaves a system that
still passes its tests while resting on a single check.

The org gates need a test that makes the two disagree, because a client normally only lands in a ref's
pool by holding that ref — `TestCorporationScopeRefusesAClientLeftInThePool` is that case, and the only
one covering the granted-scope ceiling.

**How far the live coverage reaches.** The path is covered in two halves, with a seam between them:

| Segment | Covered by |
|---------|-----------|
| Mongo → change stream cursor | `core/changestream/live_*_test.go` — real inserts, a real `Watch`, resume tokens and idle survival |
| Mongo → published message | `TestLive_Publish_ownerReachesTheSubscriberFromTheDocument` — a real insert, the running core's watcher, a real NATS subscriber |
| NATS → browser | `websocket/server/integration_*_test.go` — real JetStream consumers, real sockets, real clients |

The middle row closes a seam that was open until it was written. The websocket integration tests build
their own payloads, so they assert against a shape they invent rather than one the watcher produced —
which is why three of them still carried the pre-collapse field names and kept passing. The live publish
test reads the message the watcher actually emitted and checks both the owner key and the subject
against the owner the inserted document stated, so the two sides can no longer drift apart unnoticed.

**It asserts on the stack's core, not a watcher it starts.** A test that starts its own watcher while
core is running proves nothing: both watch the same collections, so the test passes on core's message
whatever the second watcher produced. That was the first shape of this test, and it passed with the
owner key blanked — which is the failure mode the test exists to catch.

Live tests run through `scripts/testing/live-mongo.sh`, which builds for linux and runs the binary in a
container on the stack network — `config.MongoURL` carries `replicaSet=`, so the driver connects to the
name the replica set advertises and no host-side run can reach it.

### The dry run tells an unstamped database from an idle one

`tasks prepareRelease -dry-run` is the operator's pre-flight, and it is run at the *start* of the
cutover window — before the owner stamp. Any step that filters on `_meta.owner` therefore matches
nothing at that moment, and a report of zero means "the stamp has not run yet", not "there is nothing
to do". The two read identically, and the second is the one an operator acts on.

Every owner-filtered step now either reports real work or names the stamp as the reason it found none:

| Step | Pre-stamp dry run |
|------|-------------------|
| complete outstanding schema maintenance | counts by `schemaVersion`; no owner filter, unaffected |
| stamp the owner onto every scoped document | selects on the owner's *absence*, so it reports the true figure |
| drop retired change stream resume tokens | Redis keys; no owner filter |
| drop unaddressable rebuild queue entries | parses queue ids; no owner filter |
| stamp extras category labels onto jobs | refuses: `N job(s) name no owner: the owner stamp has not run` |
| copy the statistics documents before the rebuild | counts every document; "is empty" is true either way |
| drop retired statistics fields | selects on field existence; no owner filter |
| queue every account for rebuild | refuses: `N archived job(s) name no owner: the owner stamp has not run` |

The two refusals share their wording deliberately. Both are the same fault — a step reading documents
the stamp has not reached — and an operator who has seen one recognises the other.

The check costs nothing on a healthy database. It runs only when a dry run has already found zero work,
and asks whether any document the step reads carries an account id and no owner; on a stamped database
that count is zero and the step reports as before. A real run is untouched: it happens after the stamp,
where the filter matches.

Reporting zero here is worse than failing, which is why these two stop rather than warn. The steps that
follow do not fail when a step they depend on has silently done nothing — they succeed against
documents it never prepared, report zero themselves, and end the release on a green line having
migrated nothing.

## Missing live SoT found during this work

Drafts for documentation that should exist but does not, written here first and promoted when the
project closes.

### Live Mongo tests — draft for `testing/harness.md`

`testing/mongolive` is absent from that topic's coverage map, and how to run a gated test is written
down nowhere. Promote this into [testing/harness.md](../../testing/harness.md) — a row in the
**Entrypoints** table, a row in the **Coverage map**, and the section below.

**Coverage map row.** `testing/mongolive` — **ops** (live stack) — the gate
(`EIP_MONGO_PARITY_LIVE`), the two connections a live test can want, and `ScratchAccount`, which clears
an account's archive, statistics and planner documents at both ends of a test.

**Entrypoints row.** Live Mongo tests — `./scripts/testing/live-mongo.sh [package] [pattern]` — needs a
live stack.

**Section.** Tests gated on `EIP_MONGO_PARITY_LIVE=1` run against the stack's own database. They connect
through `testing/mongolive`, which owns the gate and both client shapes so no test spells either itself:

| Helper | Use |
|--------|-----|
| `Require(t)` | The ordinary client. Skips when the gate is closed, pings before returning, disconnects on cleanup |
| `RequireWatch(t, streams)` | The change stream client, built without a client-wide operation timeout — a long-lived awaitable cursor would otherwise be ended by it. `streams` sizes the pool |
| `Enabled()` | For a test with something to do either way: live documents when reachable, fixtures when not |
| `Skip(t)` | The gate alone, for a test that reaches live data by its own path |
| `ScratchAccount(t, m, id)` | Clears an account's documents now and at test end, so a run that died before cleanup cannot poison the next |
| `OwnerMeta(owner)` / `OwnerDoc(owner)` | The `_meta` block, and the owner block inside it, for a fixture writing BSON directly. They take an `models.Owner` so a caller cannot supply an id without a kind, and do not validate — a test asserting what an unreadable owner does has to be able to write one |

**They run in a container, not on the host.** The Mongo URL carries `replicaSet=`, so the driver treats
the host it is given as a seed, asks the replica set for its members, and connects to the name they
advertise — `mongo:27017`. That name resolves on the stack network and nowhere else, whatever
`MONGO_HOST` says. `scripts/testing/live-mongo.sh` builds a linux test binary and runs it on `eip-core`,
taking credentials from the running stack's secrets:

```bash
./scripts/testing/live-mongo.sh                              # shared/mongo
./scripts/testing/live-mongo.sh ./core/commands              # another package
./scripts/testing/live-mongo.sh ./shared/mongo Watchlist     # one test
```

Running inside the network rather than mapping `mongo` to loopback in a developer's hosts file is
deliberate: it needs no per-machine setup and works the same way in CI.
