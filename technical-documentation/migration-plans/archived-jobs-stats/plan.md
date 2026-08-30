# Archived jobs statistics — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Archived jobs currently produce a single flat aggregate per account and item type. This project
replaces that with a statistics surface that answers questions over time and across a corporation:

- Per-account build statistics with monthly timelines and retained snapshots.
- Per-corporation aggregation, derived from the jobs its members archived.
- API endpoints serving monthly timelines, lifetime totals, and snapshot history.
- Dashboard and archive-dialogue views that present them.

## Starting position

An earlier branch, `feature/archived-jobs-redesign` (tip `2b0d06c31`, branched 2026-05-20 from
`1ff1f67df`), implements most of this design: 3 commits, 251 files, ~11,180 insertions.

That branch is **not merged and will not be merged**. It is kept as a design reference only.
Measured against `Development` at `23fb88e52`:

| Blocker | Detail |
|---------|--------|
| Mongo driver | Branch targets `mongo-driver v1.17.9`; Development is on `mongo-driver/v2 v2.8.0`. ~95 branch files import an API that no longer exists. |
| Conflict surface | `git merge-tree` reports **144 conflicting paths**, 57% of the branch's own footprint. |
| Duplicate refactor | Both sides independently flattened `services/shared/shared/*` → `services/shared/*`, producing 10 rename-collision conflicts in files the branch never edited. |
| Deleted trees | `services/shared/core/mongo/` moved to `services/shared/mongo/` on Development; `docs/` was replaced by `technical-documentation/`. The branch's 19 `docs/` files would resurrect a deleted tree. |
| Retired code | The branch modifies per-type market price tests that Development removed in `8daa88e09`. |

Development has landed 29 commits since the branch point, including the Swarm hard cutover, the
Mongo driver v2 rewrite, document-lock work, an auth rework, and the region market orders change.

The branch also predates the project's documentation and technical rules, which arrived with the
Swarm cutover (`557c18946`) — its tree contains no `technical-documentation/` at all. Carried-forward
code is therefore reviewed against the current bars rather than assumed to meet them.

### What the branch is worth

The design is sound and driver-agnostic: aggregation pipeline shapes, rollup bucketing, rebuild-queue
semantics, and the account/corporation split all survive the driver change. The code around them
does not. Treat the branch as a specification.

## Salvage decisions

| Disposition | Surface |
|-------------|---------|
| **Carry forward, review before use** | Frontend delta — 11 new components/modules plus 10 files still byte-identical to the merge base. Leaf packages with no Mongo dependency: `archivestats/`, `core/moneyutil/`, `core/jobid/corpinference/`, `core/jobid/linkedjobcorp/`, `core/sealedfields/` (+ `entityids/`). |
| **Reimplement against driver v2** | `worker/tasks/archivedjobs/` including its `helpers/` package, `api/v1endpoints/statistics/` endpoints, `core/scheduler/archivedjobs/publish_fanout.go`, and all Mongo query code. |
| **Relocate** | The branch's `shared/core/mongo/indexing/` package. Index ownership sits in the Deployment Tool (`internal/dataplane/mongo/index_specs.go`, applied by `eip ensure-mongo`); Development has no index-creation code in `services/`. New collections get `IndexSpec` entries there rather than a services-side indexing package called from `main.go`. |
| **Drop** | `services/shared/shared/*` renames (already landed on Development), all 19 `docs/` files (content re-targeted into this project folder), `go.mod` / `go.sum` changes, `frontend/package-lock.json` (regenerate). |
| **Separate decision** | The branch's `core/crypto/authzhmac/` package implements [entity-id-encryption/plan.md](../entity-id-encryption/plan.md), not this project. The `crypto/aesgcm_keyring.go` → `crypto/aesgcm/keyring.go` nesting is orthogonal to archived jobs and collides with recent auth work; land it separately if still wanted. |

## Phases

Phase 1 is this folder. Later stages run only after that gate.

### Stage A — Data model and Mongo layer

Models for archived job statistics, corporation statistics, and snapshot documents; the Mongo
queries, indexes, and rebuild-queue collections they need. Gates every later stage.

Wire compatibility: new persisted document shapes are additive; existing `BuildStatsRow` documents
stay readable until Stage B replaces their producer.

### Stage B — Account statistics pipeline

Worker tasks that aggregate an account's archived jobs into monthly buckets and snapshots, with the
rebuild queue that holds accounts needing recomputation. Replaces the current flat per-account
aggregate.

### Stage C — Corporation statistics pipeline

Aggregation over a corporation's own archived jobs, with its own rebuild queue and pruning.
Separable from Stage B and deferred without blocking the rest — decided at Stage B close.

#### Ownership is a property of the job, not of its lines

**A job belongs to one archive.** Personal jobs go to the personal archive and are aggregated for
the account; corporation-scoped jobs go to the corporation archive and are aggregated for the
corporation. Each archive runs the same pipeline over its own jobs, so a corporation total is not a
slice carved out of an account's jobs — it is the corporation's own archive counted the same way.

That makes `_meta.corporationRef` the discriminator, and the stage's original framing correct: the
field records which corporation a job is scoped to, and nothing writes it yet.

Everything built to attribute *individual sale lines* to corporations has been removed, because
under this rule there is nothing for it to decide. `shared/archivestats/corpinference.go`
(`InferJobCorp`, `DistinctLinkedIndustryCorpRefs`), the `corpStatus` / `resolvedCorpRef` / `isCorp`
fields on `ArchivedJobLine`, `linkedIndustryCorpRefs` on the stats document, the
`ArchivedJobCorpStatus` type, the `corpMarketOrder` / `corpIndustryJob` flags on
`BuildStatSnapshot`, and the `lane` on `CorpTimelineMonthBucket` are all gone. The lane in
particular existed to divide a corporation month between corporation-owned rows and per-account
contributions, which a single-owner job cannot produce.

#### Stage C is deferred

Decided at Stage B close, and unchanged by the simplification above.

| Already built | Where |
|---------------|-------|
| The persisted shapes | `models.CorpProductionTotalsRow`, `CorpTimelineMonthBucket` |
| The org-scoped delivery path — routing, tenant key, scope matching, payload stripping | Traced end to end in [overlay.md](./overlay.md) § Stage C |
| The scope field itself | `models.MetaData.CorporationRef` → `_meta.corporationRef` |

What is missing is a **producer**: no write path in `services/` assigns `_meta.corporationRef`, so
every stored job is personal and the corporation archive would be empty. Building the aggregation
first would produce a pipeline that reads nothing, with query and index shapes chosen against no
data — the same failure the partial indexes were held back to avoid.

Revisit when jobs are being scoped to a corporation at ingest, which in practice means corporation
documents exist. The contract such a document must satisfy is in [overlay.md](./overlay.md)
§ Stage C.

#### What may scope a job to a corporation

Only a corporation id **recorded from the ESI endpoint that owns it** — corporation industry jobs,
market orders and transactions. That is an observation made at fetch time, not something a later
pass can derive.

Nothing else on a job identifies a corporation, and the near misses are worth writing down so they
are not proposed again: a **character** hash names a character, whose corporation is a
point-in-time fact the document never recorded and which changes; a **station** is a structure many
corporations share; a **blueprint** is an item that can be sold or moved between owners; an
**account** is a user, who may belong to several corporations. A bridge built from any of them
resolves a satisfying share of the backlog — a character-hash bridge answers 1,641 of 2,309
corporate-flagged jobs on dev with no internal conflict — and is still a guess about a fact the
data never held.

Measured on dev, from 9,130 archived jobs: 5,914 carry no corporation evidence at all, 834 carry a
recorded corporation id on their linked jobs (15 corporations, none ambiguous), and 2,382 were
corporate work whose owner was never recorded. `Transaction`, `MarketOrder` and `BrokerFee` declare
`CorporationID` as `bson:"-"`, so a sale's corporation was never persisted at all, and ESI's
corporation endpoints serve only a recent window, so none of it can be fetched back.

**History therefore stays personal**, which costs nothing: account statistics count every job in
the personal archive regardless of who owned the facility, exactly as they always have.

**Sale lines now record the corporation and the character. Landed.** The ESI corporation fetchers stamp
`corporation_id` on every industry job, order, transaction and journal entry they return, and
`LinkedESIJob` already carried it through to the stored job — so the industry-job side was never
lost. The three sale-line builders dropped it: `createESIMarketOrder`, `createTransaction` and
`ESIBrokerFee` inside `findBrokersFeeEntry` each rebuilt the line field by field without it. All
three now carry `corporation_id`, `null` for a personal sale, and a broker fee inherits its order's
because a journal entry names no owner of its own. `character_id` had the same defect and was fixed
with it — see [overlay.md § Ingest](./overlay.md#ingest--entity-ids-on-stored-jobs).
`shared/jobidentity` already declares both ref targets on all four line types, so an arriving id is
converted to a ref and persisted with no backend change.

**Still open: nothing scopes the job itself.** A stored job now carries the corporation ids its
lines were fetched under, but no write path decides from them that the job belongs to a corporation
and stamps `_meta.corporationRef`. That decision is Stage C's, and it is the last thing between here
and a corporation archive with data in it.

Still to land with the stage when it starts: the corporation collections, `QueueCorpRebuild` /
`ListQueuedCorpRefs`, the corp `_id` builders, a `CollectionGroup` entry (all four existing groups
are account scoped, so no corporation collection is watched), and index specs in the Deployment
Tool.

These are **new** collections, so they are named to the convention in
[collection-naming](../collection-naming/plan.md) from the start rather than renamed later:
`corporation_archived_jobs`, `corporation_production_totals`, `corporation_timeline_months`,
`corporation_stats_rebuild_queue`. Corporation-scoped data is the case the `<scope>_` prefix exists
for, and it is the first collection set that will not be account scoped.

### Stage D — Statistics API

Endpoints for monthly timelines and lifetime totals, per account and per corporation. Additive to
the existing statistics router. The build-stats endpoint kept its contract until the frontend moved
off it in Stage E, and was then deleted.

`/api/v1/statistics` and `/api/v1/statistics/` are already mounted to the package `Router` in
`apiServer.go`'s private route table, so new sub-paths need no route-table or wiring change. The
`GetAPIStatistics` metrics bag is shared by every handler in the package — new endpoints reuse it
and distinguish themselves by the `reason` label rather than adding instruments.

#### Scope in the path, filters in the query

The account is resolved by auth middleware from the session cookie and is never read from the
request, so it does not appear in a route. Corporation reads cannot follow that rule — a user may
belong to several — so the scope has to be nameable:

```
/api/v1/statistics/account/{view}          scope implicit (the session's account)
/api/v1/statistics/corporation/{corpRef}/{view}
```

with the range and `typeID` as query parameters. Adding corporation views then adds a segment rather
than reshaping account routes, and the account and corporation forms of a view stay visibly the same
shape.

Three views:

| View | Returns |
|------|---------|
| `timeline` | one entry per calendar month, summed across every item type. `from` / `to` as `YYYY-MM` |
| `timeline/items` | the per-item breakdown within the same window, ranked and paged |
| `totals` | one all-time aggregate per item type — what `build-stats` served before it was retired |

#### Why the breakdown is its own view

Buckets are stored per month **and** per item type (`_id` is `accountID|typeID|YYYY-MM`), so a
month's total is a sum across every type the account touched that month. An account can touch
thousands of types, so the two questions have very different response sizes:

- *What did July make?* — one row
- *What drove it?* — potentially thousands of rows

Embedding the breakdown inside each month multiplies the second by the number of months in the
window, which makes the common chart request pay for detail it does not draw. Splitting them keeps
`timeline` a fixed, small response — one row per month, whatever the account's size — and makes the
expensive question explicit, paged, and separately cacheable.

**Both aggregations happen server-side.** The client never sums buckets: there are too many rows to
ship, and `SalesMeasures.Plus` is the authority on how they combine. `ProfitLoss` in particular is
accumulated as a sum of signed contributions rather than recomputed from the other fields, and
`extraCategoryTotals` merges by category id, so a client-side fold would drift from the pipeline.

**`timeline` sums with a Mongo aggregation**, grouping the bucket rows in range by `{year, month}`.
Every measure is additive, which is what makes the group valid.

**`timeline/items` groups by `typeID`** over the same window and sorts server-side, because ranking
by profit or revenue cannot be done on a page of arbitrary rows. Default ordering is descending
`profitLoss`; `sort` selects another measure, `limit` / `offset` page it. `typeID` on either view
narrows to one item, which is a covered filter on the existing
`accountID, year, month, typeID` index.

This needs an aggregation helper on `Docs`, which has none today — reads there are `Find`-shaped.
Add it to the shared surface with a `RetryOption` and an operation name, the way `DistinctStrings`
and `ListIDs` already are, rather than reaching for `Collection()` beside the handler.

**`timeline` is the only range query.** An earlier sketch had `rollups` for the buckets and
`timeline` for a chart series; they read the same documents over the same filter and differ only in
serialisation, so a second endpoint would have bought a second index and a second cache key for one
response shape. The consumer reshapes.

**The range defaults to the trailing 2 months** — the current month and the one before it — when
`from` / `to` are absent. That is the dashboard's month-on-month comparison, so its query is the
bare endpoint with no parameters, and a caller that omits the range cannot accidentally request an
account's whole history.

Two months means two rows, and the earlier of them is the complete one. The current month is
partial by definition, so a client comparing them is comparing a month-to-date against a full month
unless it says otherwise — the response marks which months are complete rather than leaving the
consumer to work it out from the calendar.

Bound the maximum span too, and reject rather than silently truncate — a truncated range looks like
missing data to a chart.

The alternative — `?scope=corp&corpRef=…` on flat routes — was rejected because it makes the
authorization boundary a query parameter, which is exactly the input a caller controls.

`GET /api/v1/statistics/build-stats` kept its flat path while the SPA still called it, and was
deleted in Stage E rather than moved under the scoped prefix — `totals` already served the same
documents.

#### Corporation authorization has an answer

Sessions already carry the corporation refs they may see:
`auth.ExtractSessionGrants` returns `Grants.CorporationRefs`, and the websocket dispatch path
already authorizes org-scoped delivery by matching against exactly that list.

So a corporation endpoint compares `{corpRef}` against the session's granted refs and returns 403
when absent. Refs are compared as refs; an id is converted to a ref first, never the reverse. This
removes what would otherwise be an open question for Stage C.

#### Naming

**`rollup` goes.** It is the internal aggregation verb and reads as jargon on a URL and in a
response body. The wire name is `timeline`; internal names follow it rather than keeping a second
vocabulary, so the same thing is not called a bucket in Mongo, a rollup in the worker and a timeline
on the wire.

**Done.** The word no longer appears in `services/`:

| Surface | Was | Now |
|---------|-----|-----|
| Collection | `user_rollup_buckets` | `account_timeline_months` (renamed by [collection-naming](../collection-naming/plan.md)) |
| Model | `UserRollupMonthlyBucket` | `AccountTimelineMonthBucket` |
| Model | `CorpRollupMonthlyBucket` | `CorpTimelineMonthBucket` |
| Model | `BuildStatsRollupTotals` | `TimelineTotals` |
| `_id` builder | `UserRollupMonthlyDocumentID` | `AccountTimelineMonthDocumentID` |
| Transformation | `archivestats/rollup_buckets.go` | `archivestats/timeline_months.go` |
| Models file | `models/build_stats_rollup.go` | `models/build_stats_timeline.go` |
| Mongo handle | `UserRollupBuckets` | `AccountTimelineMonths` |
| Mongo helper | `PruneAccountRollupBuckets` | `PruneAccountTimelineMonths` |
| Worker result field | `AccountRebuildResult.RollupBuckets` | `.TimelineMonths` |

`AccumulateAccountBuckets` and `AccountBuckets` keep their names: they fold rows into buckets, which
is what they do, and `bucket` is not the jargon being retired — `rollup` was.

**Three response types were deleted rather than renamed.** `BuildStatsRollupResponse`,
`BuildStatsRollupByType` and `BuildStatsRollupPeriodMeta` came from
`feature/archived-jobs-redesign` and had no references. They encoded a different API than the one
this stage builds — a single response bundling period totals with a per-type breakdown, and a
four-mode `Kind` of `month|year|range|years` — which the three-view split replaces. Keeping them
renamed would have left a second, contradictory API design in the models package.

#### `build-stats` became `totals`

`build-stats` said almost nothing — every view here is a build statistic. What the endpoint served
is **one all-time aggregate per item type**: `BuildStatsRow`, running totals with a `dataSnapshots`
history, keyed by account and `typeID`. The distinction that matters is lifetime totals against a
range of months, so the view is `totals` and internal names say **production totals** — clearer
about what is being totalled than "build stats", which reads as a category rather than a measure.

Not a free rename at the time: `GET /api/v1/statistics/build-stats` was the one statistics endpoint
with live SPA callers, and `dataSnapshots` is read directly. So it kept its contract until Stage E
moved the frontend, and was then deleted rather than renamed — by that point `totals` existed and a
rename would have left two paths to one set of documents.

#### Collection renames are the expensive part

Renaming a Go symbol is a refactor. Renaming a **collection** moves live documents and crosses a
module boundary, so the two cases differ sharply:

| Collection | Holds | Rename cost |
|------------|-------|-------------|
| `account_timeline_months` | Buckets this project created | **Low.** No other subsystem references it. The wholesale rebuild repopulates it from archived jobs, so a rename can drop the old collection rather than migrate it |
| `account_production_totals` (was `build_stats`) | The aggregate the SPA reads today | **Was High — the collection has since moved anyway** |

`build_stats` was held back because it is not contained: beyond `names.go` and `store.go` it appears
in the changestream `archive_and_stats` collection group and the websocket subscribe-auth allow-list,
so the name is part of a **live client-facing subscription surface**, not just storage.
[collection-naming](../collection-naming/plan.md) renamed it to `account_production_totals` anyway,
moving the SPA's subscription strings in the same change.

**This did not shorten Stage E.** What made the rename expensive was never the collection — it was
the endpoint, and moving the frontend off it was unchanged by the collection having already moved.

Both names are also duplicated across a module boundary: `services/shared/mongo/names.go` holds the
constant, while `deployment-tool/internal/dataplane/mongo/index_specs.go` repeats the collection as
a **bare string**, because `deployment-tool` cannot import `services`. A rename that misses the
Deployment Tool leaves `eip ensure-mongo` building indexes on a collection nothing reads — silently,
since creating an index on an absent collection is not an error. The same two-module pinning the
partial filters use applies here, and index specs must move in the same change as the constant.

### Stage E — Frontend

Move the SPA onto the Stage D endpoints, add the views that need the new data, and retire the
build-stats read once nothing calls it.

#### What reads statistics today

| Site | Reads | Becomes |
|------|-------|---------|
| ~~`Functions/Endpoints/Private/buildStats.js`~~ | ~~`GET /statistics/build-stats?typeID=`~~ | **done** — now `statisticsTotals.js`, reading `totals`, unwrapping `items[0]` and supplying the zeroed row the endpoint no longer returns |
| ~~`Hooks/React Query/Backend/buildStats.js`~~ | ~~query key `["backend","buildStats",id]`, invalidation helpers~~ | **done** — `invalidateStatisticsQueries` replaced the per-type and build-stats-only helpers; `statisticsTimeline.js` adds the timeline hooks; the module and key were then renamed to `totals`, see § The SPA's statistics modules are named for their views |
| `Components/Dialogues/Blueprint Archive/hasMeaningfulBuildStats.js` | `dataSnapshots.length > 0` | unchanged in meaning; the field still ships |
| `.../Archive Jobs Panel/archiveJobsPanel.jsx` | `archiveData?.dataSnapshots` | unchanged — still renders the per-job rows from the embedded snapshots |
| ~~`.../Button Panel/archiveJobButton.jsx`, `Groups/Side Menu/Buttons/buttonFunctions.jsx`~~ | ~~invalidate after archiving~~ | **done** — both call `invalidateStatisticsQueries` |

#### Order

1. ~~**Repoint the existing read.**~~ **Done.** `totals` serves the same documents, so this was a
   path change in one module; `dataSnapshots` still arrives and no panel changed.
2. ~~**Add the timeline reads**~~ **Done.** `Functions/Endpoints/Private/statisticsTimeline.js` and
   `Hooks/React Query/Backend/statisticsTimeline.js` cover `timeline` and `timeline/items`, keyed
   under a shared statistics root.
3. ~~**Build the views**~~ **Done.** The dashboard carries `ArchivedStatsOverview` (this month
   against last) and `ArchivedItemBreakdown` (which items drove it). The archive dialogue was split
   into its four segment blocks — see § The archive dialogue below.
4. ~~**Retire `build-stats`**~~ **Done.** With no caller left, `getBuildStats.go`, its router case
   and `models.EmptyBuildStatsRow` were deleted rather than renamed — `totals` already served the
   same documents. The router test pins the path as a 404 so it is not revived by accident.

All four steps have landed for the account scope.

#### The archive dialogue

The dialogue showed one flat set of lifetime totals, which could not distinguish a build sold on the
market from one consumed by a parent job or kept as stock. It now renders four blocks — Combined,
Market, Stock, Chain — from the `breakdown` the API has served all along.

`mapApiStatsToArchiveBreakdown` reshapes the row already in hand, so no extra request is made.
Combined **sums** the three segments rather than recomputing profit from the summed money fields:
`jobCostTotal` already contains both fee totals, so subtracting them again reports a loss against
profitable builds. The branch this was ported from made exactly that error; a test pins the correct
figure against the one double subtraction produces.

Stock and Chain show the build side only and say why — neither records a sale of its own, so their
sale and fee rows would be zeros beside real build costs. Segments with no activity are omitted, and
a row whose breakdown is empty falls through to the flat summary so older documents still render.

The corporation toggle carried on the source branch was **not** ported — it belongs to Stage C. The
seams are left open for it: `statsBreakdown` is a prop rather than computed inside the body, the
mapper takes a whole row so a corp row maps identically, and both are exported from the folder index.

#### Segment classification is decided on evidence

Discovered while reading the dialogue against real data. A job with 200 items built and no sale
appeared under Market showing zeros for sales, fees and profit beside a six-figure job cost.

The cause was a `default:` catch-all: a job was Market whenever it was neither a chain step nor
flagged `retainedStockBuild`. **Nothing sets that flag** — the only assignment in the repo is a test
fixture — so the Stock segment was permanently empty and every non-chain job was reported as Market.

Market now asks whether market activity was recorded, and anything left over is stock:

- A **sale** is a transaction line whoever wrote it. ESI supplies market transactions; a contract or
  other off-market sale is entered by hand through the SPA's custom-transaction dialogue, carrying
  the same quantity, amount and tax and distinguished only by a negative transaction id. Both arrive
  as `TransactionLines`, so both count.
- A **broker fee** counts too. Listing output is market activity before anything sells, and a
  fee-only job sent to stock would report a broker fee in a block that suppresses the row explaining
  it.
- Lines are weighed by their **figures**, not their presence: one carrying neither an amount nor a
  quantity records no money and no goods, so it decides nothing.
- `retainedStockBuild` still routes a job to stock ahead of the sale check, so an explicit mark is
  honoured whether or not a line was recorded. (The source branch resolved this the other way, with
  market winning. Moot while nothing writes the flag; noted so the divergence is deliberate.)

Existing rows keep their old classification until a statistics rebuild runs.

#### Extras by category reach the monthly figures

Already produced end to end, and now covered by tests. `extraCategoryTotals` is folded per job by
category id (blank → `"0"`, Unassigned), stored on the row, merged into monthly buckets against the
**cost month** — the same attribution `jobCostTotal` uses — and served in each `months[]` entry and
in `totals`.

Three tests pin the monthly path, which previously had none: extras follow the cost month rather
than the month the output sold, several jobs in a month sum their categories rather than the last
written winning, and a month with no extras leaves the field absent rather than `{}`.

No frontend view reads it yet — deliberately. The data is ready for a later breakdown. Two things
that work will need: the API returns bare category **ids**, whose labels live in
`applicationSettings.extrasCategories` in the user store; and that list includes **deleted**
categories, which historical months can still reference. The existing category select hides deleted
entries, which is right for choosing and wrong for reporting — a past cost still belongs to the
category it was filed under.

#### Things the endpoints require of the client

**The default window is two months and the response says so.** `period.defaulted` distinguishes a
server-chosen window from a narrow explicit one, and each month carries `complete`. The current
month is a month-to-date figure, so the comparison view must label it rather than showing an
unmarked decline against a finished month.

**Ranges are rejected, not repaired.** A half-given or over-long range returns 400 with a specific
code (`statistics_incomplete_range`, `statistics_range_too_long`, …). The client should not retry
these — the existing retry policy already covers only 408/429/5xx, so this needs no change, but a
view that builds ranges must send both bounds or neither.

**The item breakdown is paged and ranked server-side.** `paging.totalItems` is every item type in
the window, not the page length. Sorting is a request parameter, not a client-side array sort, and
`sort` must be one of the measures the API advertises.

#### The SPA's statistics modules are named for their views

The API serves three views — `timeline`, `timeline/items` and `totals` — and the SPA modules now
match, so a reader moving between the two sees one vocabulary rather than the endpoint's and the
retired producer's.

| Was | Now |
|-----|-----|
| `Functions/Endpoints/Private/buildStats.js` → `getBuildStatsByTypeID` | `statisticsTotals.js` → `getAccountTotalsByTypeID` |
| `Hooks/React Query/Backend/buildStats.js` → `useBuildStatsQuery`, `prefetchBuildStatsQuery`, `buildStatsQueryKey`, `normalizeBuildStatsTypeID` | `statisticsTotals.js` → `useAccountTotalsQuery`, `prefetchAccountTotalsQuery`, `totalsQueryKey`, `normalizeTotalsTypeID` |
| `STATISTICS_QUERY_KEY_ROOT` and `invalidateStatisticsQueries` inside the totals module | `Hooks/React Query/Backend/statisticsKeys.js` |

**Totals moved under the shared statistics key root.** It was keyed
`["backend", "buildStats", id]` beside the timeline's `["backend", "statistics", …]`, which forced
`invalidateStatisticsQueries` to invalidate two roots and made forgetting one a live hazard. Totals
is now `["backend", "statistics", "totals", id]`, alongside `"timeline"` and `"timelineItems"`, so
one invalidation reaches every view. The React Query cache is not persisted, so changing the key
value costs nothing — a reload starts empty either way.

The shared root moved out with it. `statisticsTimeline.js` had been importing
`STATISTICS_QUERY_KEY_ROOT` from the totals module, so one view's file owned a fact both views
depend on; `statisticsKeys.js` now holds the root and the invalidation helper that goes with it.

**The Go types and the last SPA names followed.** "Build stats" named a retired endpoint, so every
identifier carrying it was renamed for what it actually is. No BSON or JSON tag contained the term,
so nothing persisted or on the wire changed — these were Go and JavaScript identifiers only.

| Was | Now | Named for |
|-----|-----|-----------|
| `models.BuildStatsRow` | `models.ProductionTotalsRow` | `account_production_totals`, the collection it decodes |
| `models.BuildStatsBreakdown` | `models.ProductionTotalsBreakdown` | the row it splits |
| `models.BuildStatsSegmentTotals` | `models.ArchiveSegmentTotals` | the archive segment it totals |
| `models.BuildStatsSegment*` constants | `models.ArchiveSegment*` | same |
| `models.CorpBuildStatsRow` | `models.CorpProductionTotalsRow` | the corporation collection |
| `hasMeaningfulBuildStats` | `hasMeaningfulTotals` | the `totals` view it tests |
| `BuildStatsPanel` | `JobCostSummaryPanel` | what it draws |

The panel rename is the one that changes a user-facing decision rather than a name. It was kept
earlier on the grounds that "build stats" was what it showed a user; reading it again, that was
wrong on its own terms. The panel renders **the cost breakdown of the job being edited** — material
cost, install cost, extras, cost per item — and has nothing to do with the archive or with
`account_production_totals`. Its former name pointed at a surface it does not read. `componentName`
is an error-boundary label rather than visible copy, so no text a user sees changed.

`BuildMeasures` keeps its name throughout: a build's measures is what it holds, and the term was
never the endpoint's.

#### Invalidation

Archiving a job queues a rebuild that recomputes all three collections, so a write invalidates every
statistics view rather than one type's build stats. The existing `invalidateAllBuildStatsQueries`
becomes an invalidate across the statistics key root; missing this leaves a stale dashboard after an
archive, which is the failure most likely to be read as a backend bug.

#### Carried from the branch

`feature/archived-jobs-redesign` holds the dashboard and archive-dialogue components this stage
needs. They are a design reference, not a merge: they were written against the branch's own response
shapes, which Stage D did not adopt — it split the single rollup response into `timeline`,
`timeline/items` and `totals`. Read them for layout and wiring, and expect the data access to be
rewritten.

### Stage F — Archived jobs read API

The SPA cannot read an archived job. `archivedjobs.Router` accepts **PUT only** — GET, POST and
DELETE all answer 405 — so the only read surface over the archive is the aggregated statistics from
Stage D. A page that lists archived jobs, or restores one, needs the documents themselves.

Two endpoints, both account scoped by the session the same way the statistics views are:

| Route | Serves |
|-------|--------|
| `GET /api/v1/archived-jobs` | a paged, sorted, filterable list of **summaries** |
| `GET /api/v1/archived-jobs/{jobID}` | one full job document |

**The list serves summaries, not documents.** An archived job carries its whole build — materials,
cost rows, every sale line — and a page of fifty would ship megabytes to render a table of names and
figures. The summary projects what the table draws: `jobID`, `name`, `itemID`, `jobType`,
`archivedAt`, `groupID`, output quantity, `jobCostTotal`, `profitLoss`, the segment the job
classified as, and the related-set key described under Stage G — so the client can render groups,
related sets and standalone jobs without walking links it cannot resolve. The full document is fetched only when a row is expanded or restored.

**Filters follow the statistics vocabulary** rather than inventing a second one: `from` / `to` as
`YYYY-MM` against the archive month, `typeID`, `groupID`, and a `search` over the job name. Sorting
and paging reuse the `sort` / `order` / `limit` / `offset` shape `timeline/items` already
established, including `paging.totalItems` meaning every match rather than the page length. A client
that can drive one view can drive this one.

Wire compatibility: **additive**. New methods on an existing path; the PUT contract is untouched.

Index specs for the list's filters go in the Deployment Tool
(`internal/dataplane/mongo/index_specs.go`), per the salvage decision that index ownership sits
there rather than in a services-side indexing package.

The queries themselves live in the API service (`api/v1endpoints/archivedjobs/`), not in
`shared/mongo`: no other service serves an HTTP list, and `shared/` is for code more than one
service runs. The shared half is the filter helper and the id builders both the API and the worker
depend on — see [overlay.md](./overlay.md) § The queries live in the API.

### Stage G — Restore

Restore returns an archived job to the planner. The archive kept the **whole** document —
`saveArchivedJobs` sends `job.toDocument()` and the handler adds only `_meta` and entity refs — so
nothing about the job was discarded and a faithful restore is possible.

Three things the archive did are not reversed by simply copying the document back.

**Entity ids became refs.** `jobidentity.Encrypt` ran on the way in. Restore decrypts back to raw
ids, or the planner receives a job whose identities it cannot read. The conversion is owned by
[entity-id-encryption](../entity-id-encryption/plan.md); this stage only calls it.

**ESI links were released.** Archiving removes the job's `apiOrders`, `apiJobs` and
`apiTransactions` from the account's linked-ESI set, so those entries became available to other jobs
and may since have been claimed. Restore **re-links what is still free and reports what is not**:
the response names each entry another job now holds, along with the job holding it, and the restored
job comes back without it. Blocking the whole restore on a single claimed order would strand a user
behind an unrelated job they would have to edit first; silently double-linking would attribute one
sale to two jobs and corrupt both their figures. Reporting is the only option that leaves the user
with a usable job and an accurate account of what did not reconnect.

**The re-link is written server-side, and reaches the SPA over the websocket.** The linked sets are
three arrays on the `accounts` document (`linkedJobs`, `linkedTrans`, `linkedOrders`), which the SPA
had been the only writer of — it holds them in Zustand and persists them wholesale through
`PUT /api/v1/user/main`. That made a server-side write look unsafe, as if the SPA's next save would
overwrite it.

It is safe, because the document is realtime-synced end to end: `accounts` sits in the `account`
change-stream group, `applyRemoteMessage` routes an upsert on it to `handleUsersDocumentUpsert`, and
that calls `applyUserDocumentFromRemote`, which patches `linkedOrders` / `linkedJobs` / `linkedTrans`
straight into the store from the incoming document. A restore that writes the arrays therefore
reaches the client's in-memory copy before the client would next save from it.

Writing them server-side is what makes restore atomic. The alternative — returning the free ids and
having the SPA apply them — puts the job document write and the ESI re-link in different processes,
which is the split that lets the archive flow strand a job today.

**The job document was deleted.** Restore writes it back to `account_job_documents`.

#### Restore is one server-side operation

`POST /api/v1/archived-jobs/{jobID}/restore`, doing the whole sequence server-side: read the
archived document, decrypt identities, resolve ESI links, write the job document, delete the
archived document, queue a statistics rebuild.

The alternative — the SPA choreographing four calls, as the archive flow does today — reproduces a
failure the archive path already has. `archiveJobButton` can leave a job archived **and** still in
the planner, and says so in its own error copy: "Job was archived but removing it from the server
failed." The mirror of that bug is worse, because a half-restore can leave the job in the planner
and in the archive at once, where the statistics rebuild counts a job the user is actively editing.
Restore therefore owns the ordering rather than the client.

**Deleting the archived document is what makes the statistics correct**, and it needs no decrement
logic: `RebuildAccount` recomputes from scratch over `LoadAccountArchivedJobs`, so removing the
document and queuing a rebuild is sufficient and idempotent.

Wire compatibility: **additive**.

#### Groups are rebuilt from their jobs, not stored

Archiving a group deletes the group document (`deleteJobGroupsFromApi`) while every archived job
keeps its `groupID`. The group object is therefore gone, but it is **derivable**:
`Group.createGroup` computes `groupName` (from the output jobs), `outputJobCount`, `materialIDs`,
`includedTypeIDs`, `includedJobIDs` and all three linked-ESI sets entirely from the jobs handed to
it. Nothing in a group is a fact the jobs do not already hold.

Two fields are not derivable and reset rather than being invented: `groupStatus` returns to 0, and
`areComplete` starts empty — both describe workflow progress at the moment of archiving, which was
never recorded per job. `showComplete` and `groupType` take their constructor defaults.

So restoring a group is restoring its jobs and putting the container back:
`POST /api/v1/archived-jobs/groups/{groupID}/restore` restores every archived job carrying that
`groupID` and returns the group alongside them, with one merged ESI-conflict report across the whole
set.

Which is rebuilt and which is merged is decided by the group, not by the route. A group that was
deleted when it was archived is rebuilt from every job that names it — the archived ones and any left
on the planner. A group still on the planner, because only some of its members were archived, is
merged into: its membership, name and completion state are the user's, and only the restored jobs'
contributions are folded back. Restoring a **single** job follows the same rule, so a job always
returns to the group it was archived from. Behaviour → [overlay.md](./overlay.md) § Every restored
job returns to its own group.

#### Jobs come back individually, by group, or by related set

A restore takes one of three shapes, and the API offers all three rather than making the client
assemble a set from single-job calls. A client-side loop over N restores is N chances to half-finish,
and it cannot see the relationships in the first place — they live in documents the SPA no longer
holds.

| Route | Restores |
|-------|----------|
| `POST /api/v1/archived-jobs/{jobID}/restore` | that job alone |
| `POST /api/v1/archived-jobs/groups/{groupID}/restore` | every archived job carrying that `groupID` |
| `POST /api/v1/archived-jobs/related/{jobID}/restore` | that job and every archived job reachable from it through parent/child links |

Each returns the restored jobs and one merged ESI-conflict report across the set, so a set restore
reports conflicts the same way a single one does.

#### Relationships survive archiving, so the set is computable

A job that belongs to no group can still be part of a build chain. Both link fields are ordinary
persisted job fields — `ParentJobs []string` and `Build.ChildJobs map[string][]string` (keyed by
material type id) — so archiving preserves the whole dependency graph. Nothing has to be inferred.

The traversal is the one the SPA already does in `getAllRelatedJobs`: a stack-based walk over
`parentJobs` plus every value in `childJobs`, collecting each job once. The difference is where it
looks. The SPA version resolves ids through `findJobInJobArray`, the planner's in-memory array, which
by definition does not contain archived jobs — so the walk **must run server-side over the archive**.
The rule stays the same; only the lookup changes.

**A chain can straddle the archive boundary.** Jobs are archived individually, so a job's parent may
still be sitting in the planner while its children are archived. The traversal therefore walks only
what the archive holds, and the response reports ids it could not resolve, split by cause: still in
the planner (nothing to restore — it is already there), or absent entirely (deleted at some point).
Neither is an error, and neither blocks the restore; a user restoring the archived half of a chain
gets it back and is told the rest is already live.

#### Groups and related sets are different questions

A group is a container the user made; a related set is a structural fact about a build. They can
overlap — a group usually holds a chain — but neither implies the other, and the list has to answer
both. So the read API reports both for every row:

- `groupID` — the container it was archived from, if any.
- A **related-set key** shared by every job in one dependency graph, so rows that belong together can
  be recognised without the client walking links it cannot resolve.

Computing the related-set key is the same traversal as the restore, run at list time over the page's
jobs. Rows carrying a `groupID` take the group as their grouping; ungrouped rows fall back to the
related-set key; a job with neither stands alone.

#### The page shows the three cases as three things

The list is grouped visually, not flat:

- **Groups** render as a named block with their jobs inside and a restore action for the whole group.
- **Related sets** render as a block too, but labelled by their output job rather than a group name
  — there is no user-given name to show — with a restore action for the set.
- **Standalone jobs** render as ordinary rows.

Every job inside a block still carries its own restore action, so the choice between restoring one
job and restoring the set it belongs to stays the user's. Restoring one job out of a related set does
not drag its relatives back; the remaining jobs keep pointing at it, and a later set restore picks up
whatever is still archived.

### Stage H — Archived jobs page

A page at `/archived-jobs`, following the SPA's existing conventions: a `_protected` file route
(`frontend/src/routes/_protected/archived-jobs.jsx`) lazy-loading its component through `Suspense`
and `LoadingPage`, wrapped in `DefaultPageLayout`, reached from the side menu. Charts use
**recharts**, already a dependency and already the SPA's charting library in `priceHistory.jsx` — no
new package.

The page carries both halves in one slice: the charts and the list.

#### Charts

| Chart | Source | Notes |
|-------|--------|-------|
| Monthly timeline | `timeline` | profit and cost per calendar month. The current month is month-to-date and must be labelled as such — `months[].complete` says which |
| Item breakdown | `timeline/items` | top items by the selected measure, ranked and paged **server-side**; the chart draws the page it was given and never re-sorts locally |
| Segment split | `totals` | Combined / Market / Stock / Chain share of the window, the same four segments the archive dialogue renders, reusing `mapApiStatsToArchiveBreakdown` |
| Extras by category | `timeline` | `extraCategoryTotals` per month, already served on every `months[]` entry and on `totals` |

#### Chart primitives are data-agnostic and live outside the page

The four charts differ only in what they are handed. Written directly against the statistics hooks
they would each fuse fetching, shaping and drawing into one component, and the next view wanting a
month-over-month bar chart would copy one and edit it — the parallel-copies failure the master rules
call out.

The SPA already has one instance of exactly that. `Styled Components/LineGraph/priceHistory.jsx`
fuses its own market selector, range slider, item-name resolution and theming into the chart, so
none of it can be reused here despite being the repo's only recharts code. It moves onto the
primitives as part of this stage — see § Price history moves onto the primitives.

Three layers instead, split so the boundary is where the data stops being generic:

| Layer | Lives in | Knows about |
|-------|----------|-------------|
| **Primitives** | `Styled Components/Charts/` | recharts, the theme, and the shape of its own props. Nothing about statistics |
| **Adapters** | beside the page's components | how to turn one statistics response into the rows a primitive takes |
| **Panels** | the page | which hook to call, which adapter to run, which primitive to draw, and the empty and loading states |

**A primitive takes rows and a series description, never a query result.** Its props are the data
array, the key naming the category axis, and a list of series (`{ key, label, colour, type }`) —
so the same component draws profit against months, cost by item, or extras by category with no
knowledge of which it is doing. The concrete primitives this page needs: a time-series chart
(bars or lines, several series, one shared axis), a ranked horizontal bar chart, and a pie chart for
the segment split. A fourth view — extras by category over months — is the time-series primitive
with a different series list, not a new component.

Consequences that make the split worth keeping:

- **Theming and formatting are decided once.** Axis and tooltip number formatting comes from
  `Functions/Helper/numberParser.js` (`formatNumberForLocale`, `numberToShortText`), and colours from
  the MUI theme, so every chart on the page agrees without each one re-deriving it.
- **Primitives are testable without a server.** They are pure given rows, so their tests are rows in
  and marks out — no query client, no fetch mocking.
- **Corporation scope costs nothing.** A corporation row adapts to the same rows, so the Stage C
  views reuse the primitives unchanged; this is the seam § Seams left open for Stage C describes,
  made concrete.
- **Empty and loading states belong to the panel, not the primitive.** A primitive handed no rows
  draws nothing; deciding whether that means "still loading", "no jobs in this window" or "this
  account has never archived" needs the query state, which only the panel has.

The adapters stay separate from the primitives because response shapes are the API's business and
will move with it — `months[]`, `paging`, `period.defaulted` and the segment breakdown are Stage D's
vocabulary, and a primitive that knew them would break when they changed. Where an adapter already
exists it is reused rather than rewritten: the segment split maps through
`mapApiStatsToArchiveBreakdown`, the same function the archive dialogue uses, so the page and the
dialogue cannot disagree about what Market or Chain means.

**The extras chart needs no backend work** — `SalesMeasures.ExtraCategoryTotals` is produced, merged
by `Plus`, and serialised already. What it needs is **labels**: the API returns bare category ids,
whose names live in `applicationSettings.extrasCategories` on the account document. Two rules apply,
both recorded when the field was built:

- A blank category id folds to `"0"`, shown as **Unassigned**.
- **Deleted categories must still resolve.** The existing category select hides them, which is right
  when choosing a category and wrong when reporting one — a past cost belongs to the category it was
  filed under. The chart resolves names from the full list, deleted included, and falls back to the
  raw id if a category is missing entirely.

The range control is shared by all four charts, so one window selection drives the page. The default
window is the server's (`period.defaulted` distinguishes it from a narrow explicit one), and ranges
are sent as both bounds or neither — the API rejects a half-given range with 400 rather than
repairing it, and those codes are not retried.

#### List and restore

**The page is two tabs — Statistics and Archived Jobs.** Charts sit on the default tab; the list
gets the second, and the full page width its three row shapes need.

**The list does not load with the page.** Charts are the reason most visitors open it, so eagerly
paging the archive would spend a database read per visit on a table almost nobody scrolls, and the
list is the expensive half: a page of rows means a count, a find, and a second read for the
statistics rows behind it. The query is gated on the user opening the list, using the `enabled`
option every statistics hook already takes and the archive dialogue already gates on: the query is
enabled when the Jobs tab is first opened, and React Query caches it for the session afterwards, so
switching back costs nothing. Charts still load immediately — they are what the page is for.

A table over `GET /api/v1/archived-jobs` with the filters the endpoint offers and rows expandable to
the full document. Restore reports its ESI conflicts in the confirmation that follows rather than
failing silently, and invalidates the statistics queries on success — the rebuild it queued changes
every view on the page.

Rows are presented in the three shapes Stage G restores: named group blocks, related-set blocks
labelled by their output job, and standalone rows. Each block restores as a unit, and every job
inside one keeps its own restore action.

#### Price history moves onto the primitives

`Styled Components/LineGraph/priceHistory.jsx` is rewritten to draw through the time-series
primitive rather than its own recharts tree. It is the SPA's only other chart, and leaving it fused
would leave two chart implementations in the repo the moment this page lands — the parallel-copies
outcome the primitives exist to avoid. It has **one caller**
(`Components/Dialogues/Price History/dialogueFrame.jsx`), so the blast radius is one dialogue.

It is also the better test of whether the primitive is actually general. The statistics charts are
four variations on "months against money"; price history is a different shape in every axis that
matters, and a primitive that survives it will survive the next view without another rewrite:

| It needs | Which forces the primitive to support |
|----------|---------------------------------------|
| Two `Area`s, a `Line` and a `Bar` on one chart | mixed mark types in one series list — already the `type` on a series |
| Volume on a right-hand axis against ISK on the left | a second value axis, series naming which they belong to |
| A brushable window over the data | range selection as a prop, not a built-in |
| Dates on the category axis, not month labels | category values formatted by the caller |

**What stays behind in the dialogue**, because none of it is charting: the region select and
`updateRegionID`, the region-name lookup through `worldData.actions.findUniverseData`, and the
`graphData` prop itself. The range slider moves out with the primitive only if it generalises
cleanly — it currently carries price-specific thumb labels (`formatThumbDate`) and an index-based
window over `graphData` — so it moves as a **separate** range-control component the primitive
accepts, rather than being absorbed into it. The statistics page's own range control is a month
picker over the API's window, which is a different control entirely; the two share the primitive,
not the picker.

Two behaviours in the current component are **kept, not simplified away**, because they are real
fixes rather than incidental code, and a primitive that drops them regresses the dialogue:

- **Axis margins are computed from the formatted tick widths** (`longestYAxisTickISK`,
  `longestXAxisTick`, `dynamicMargins`). ISK values are long enough to clip against a fixed margin.
  The primitive derives margins the same way from whatever its formatter produces, which the
  statistics charts need too — ISK totals are the same order of magnitude.
- **The visible range resets when the series changes** (`rangeResetKey`, keyed on length and end
  dates), so switching item or region does not leave a window pointing into the old data. Any
  primitive taking a range prop needs the same rule, expressed as the caller re-deriving the range
  when its data identity changes.

The `ResizeObserver` and `containerDimensions` bookkeeping is **not** carried over unless it earns
its place — `ResponsiveContainer` already handles resize, and measured dimensions are read but not
used by the recharts tree.

**Done.** The primitives were built first and price history converted onto them, 483 lines down to
269. No prop was added that only price history would use, which was the test the split had to pass.

Two things the conversion settled for every later chart:

**Charts size through CSS, not pixels.** `width: 100%` with an aspect ratio and the `responsive`
prop, which is recharts' documented approach from 3.3 and uses standard CSS sizing rather than the
container's own resolution logic. A chart therefore follows the width of the page it is on. Callers
needing something else pass a `style`; price history overrides with `height: 100%` because it fills
a fixed-height dialogue. Fixed pixel heights are not used.

**The `ResponsiveContainer` wrapper is gone**, and its absence matters: an element between a sized
parent and the chart with no height of its own collapses the chart to nothing. That is what the
`responsive` prop avoids by needing no wrapper at all.

Carried over unchanged: the axis domains scaled to the visible window, full-number tick formatting,
rotated category labels, per-series fill opacities, and the window resetting when the series
changes. The `ResizeObserver` and container measurement went, since the `responsive` prop handles
resizing.

The dependency moved 3.2.1 → 3.10.1 and off two deprecated APIs on the way: `Cell`, removed in
recharts 4, became the `shape` render prop, and `Legend`'s `verticalAlign` became `position`.

#### Seams left open for Stage C

The page is account scoped. As with the archive dialogue, the corporation scope gets seams rather
than stubs: the range and scope selection is a prop rather than page-internal state, and the chart
components take their rows as data so a corporation row renders identically once Stage C exists.

### Stage I — One owner for group derivation

Two implementations derive a group from the jobs it holds, and they have to agree because they write
the same document. As the stage found them:

| Where | What it did |
|-------|--------------|
| `frontend/src/Classes/group.js` | `_buildNewGroupData`, and the callers that use it: `createGroup`, `updateGroupData`, `addJobsToGroup`, `removeJobsFromGroup`, `markJobsArchived` |
| `services/api/v1endpoints/archivedjobs/grouprebuild.go` | `contributionOf`, `rebuildGroup`, `mergeRestoredJobs` |

Both encode the same four facts: what a member contributes (its `itemID` into the type and material
sets, each `build.materials[].typeID` into materials, and the three ESI link sets), that a job with
no parents is an output, that the name is the output names joined and capped at 75, and the defaults
`groupType 1` / `groupStatus 0` / `showComplete true`.

#### Neither implementation can be deleted

The obvious fix — one side owns it — does not survive contact with either constraint:

- **Server-only derivation** cannot work: the SPA builds groups with no server. `addNewJobsToPlanner`
  creates one locally, and `archiveGroupJobs` has a logged-out branch that maintains group state
  client-side.
- **Client-only derivation** cannot work either: restore is deliberately one server-side sequence,
  for the same reason the ESI re-link is. Handing the group rebuild back to the SPA splits the job
  write and the group write across two processes.

So the goal is not to remove the duplication. It is to stop the two copies disagreeing without
anyone noticing.

#### They had already drifted

Three differences existed, each producing a different group document from the same jobs. Two were
found by reading the two implementations against each other; the third only appeared when the corpus
ran:

| Rule | Was | Now |
|------|-----|-----|
| Truncation at 75 | SPA counted UTF-16 code units, the backend counted bytes and could split a rune into invalid UTF-8 | Both count characters; the backend truncates on runes |
| A job with a blank name | The SPA joined it raw, leaving an empty segment (`", Rifter"`); the backend trimmed and skipped it | Both trim and skip, and a group whose outputs are all unnamed is `Untitled Group` |
| Order of the numeric id arrays | The backend sorted them; the SPA emitted insertion order | Both sorted, so an unchanged group is not rewritten as modified |

#### What landed

1. **`models.Group` derives itself** — `RebuildFrom(jobs)` and `AddJobs(jobs)`, mirroring the SPA's
   `createGroup` and `addJobsToGroup`. A group is derived from its jobs, so the group knows how, and
   `archivedjobs` keeps only its restore concerns.
2. **A corpus** at `testing/fixtures/group-derivation/cases.json`: nine cases of input jobs and the
   group document they must produce, covering the contribution rules, the output count, id ordering
   and deduplication, and naming.
3. **A harness on each side** reading it — a Go test over `Group.RebuildFrom`, a vitest test over
   `Group.createGroup`.
   Both read the file by path rather than copying it, so a rule change on one side turns the other
   red.
4. **The three divergences resolved**, each fixed on the side that was wrong.

Wire compatibility: **none affected**. The package move is internal, and the corpus is test-only. No
document shape, endpoint, or operator surface changes.

#### What the corpus does not cover

Derivation only — jobs in, derived fields and name out. Merge, restore and the lock gate are backend
concerns with no SPA counterpart, and the archived-member rules are not shared logic despite touching
the same field: the SPA preserves `archivedJobIDs` through a recompute, the backend clears them on
merge. Those stay as tests in their own packages.

## Go modernization in scope

Per the planning gate, `go fix -diff` was run against the packages this project will touch
(`worker/tasks/archivedjobs/…`, `core/scheduler/archivedjobs/…`, `api/v1endpoints/statistics/…`,
`shared/models/…`, `shared/mongo/…`). One suggestion was reported, in
`shared/models/group_template.go`. Land it with Stage A rather than as a separate sweep. No other
in-scope package needs modernization before the work starts.

Re-run for Stages F and G, against the packages they add to the touch surface
(`api/v1endpoints/archivedjobs/…`, `shared/jobidentity/…`, `shared/mongo/…`). One suggestion is
reported, in `shared/mongo/docs.go`: `errors.As` with a declared variable becomes
`errors.AsType[mongo.BulkWriteException]`. That file is the archive read/write layer both stages
extend, so land it with Stage F rather than as a separate sweep. No other package in their scope
needs modernization first.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — data model and Mongo layer | Complete for the account scope — entity refs on job documents, statistics models, Mongo layer and index specs landed. Corp scope held for C; partial indexes land with D |
| B — account statistics pipeline | **Complete** — transformation, worker rebuild, queue drain, its task and asynq handler, the hourly schedule, and the archived-jobs producer are all landed. Queue → publish → drain runs end to end, and the claim protocol, revoke, prune and write-then-remove ordering are pinned by passing live tests. The worker's end-to-end composition of those helpers has no live test yet (see Open questions) |
| C — corporation statistics pipeline | **Deferred** — a job belongs to one archive, so this pipeline aggregates corporation-scoped jobs rather than slicing account ones; per-line attribution was removed. The producer is half built: the SPA now records the corporation and character ids ESI supplies, but nothing yet decides from them that a job is corporation scoped and stamps `_meta.corporationRef`. See § Ownership is a property of the job |
| D — statistics API | **Complete for the account scope** — timeline, timeline/items and totals land under `/api/v1/statistics/account/`, with the indexes their filters need. Months carry the six components of a period's cost and its extras by category; `totals?summary=1` folds the archive into one row. The old build-stats producer is retired and its documents are rebuilt by the statistics pipeline. Corporation views wait for Stage C |
| E — frontend | **Complete for the account scope** — the SPA reads `totals`, `timeline` and `timeline/items`; build-stats is deleted; the dashboard carries the month-on-month comparison and the item breakdown; the archive dialogue is split into its four segment blocks. Corporation scope waits for Stage C |
| F — archived jobs read API | **Complete** — `GET /api/v1/archived-jobs` serves a paged, filtered list of summaries and `GET /api/v1/archived-jobs/{jobID}` one full document. Rows report group and related-set membership, figures come from the shared `archivestats` reduction, and the query parsing both this and the statistics views use moved to `api/helper`. Indexes landed in the Deployment Tool |
| G — restore | **Complete** — three POST routes restore a job, a group rebuilt from its jobs, or a related set walked over the archive. The write is one server-side sequence: decrypt, resolve links, write job documents, re-link free ESI ids on the account, return the jobs to their groups, delete the archived documents, queue the rebuild. Each job rejoins the group it was archived from, merging into it when it is still on the planner. Conflicts are reported and stripped rather than blocking, and a group another session holds refuses the restore |
| H — archived jobs page | **Complete for the account scope** — `/archived-jobs` carries the statistics tab (metric cards, eight charts, item table) and the jobs tab (list, three row shapes, restore). Chart primitives are shared and the price-history dialogue moved onto them. The list is not queried until its tab is opened, and both tabs carry a mobile layout |
| I — one owner for group derivation | **Complete** — `models.Group` derives itself through `RebuildFrom` and `AddJobs`, mirroring the SPA's `createGroup` and `addJobsToGroup`; a nine-case corpus at `testing/fixtures/group-derivation` defines the rules and a harness on each side reads it. The three divergences it found are fixed |

## Done when

- Account and corporation statistics are produced by the new pipeline, with timelines and snapshots
  persisted and served.
- The frontend reads the new endpoints and the previous flat aggregate has no remaining callers.
- Tests ship with each stage, not as a later wave.
- Archived jobs can be listed, read, and restored — a job on its own, a group rebuilt from the jobs
  it still holds, or a set of jobs related through parent/child links — with ESI re-link conflicts
  reported to the user rather than silently dropped or blocking the restore.
- The archived-jobs page presents the charts and the restore table over those endpoints.
- A job restored on its own, or with its group, returns to the group it was archived from, and a
  group is rebuilt from every job that names it.
- Group derivation has one owner per side, with a shared corpus proving the two agree.
- Overlays in this folder describe the landed behaviour, ready to promote into live SoT.

## Handoff status

**Stage B is committed on `feature/archived-jobs-stats`.** The transformation, the worker rebuild,
the drain, its task and asynq handler, the archived-jobs producer and the hourly schedule are all
reachable from a clone.

`services` builds, vets and tests clean, and `go fix -diff` reports nothing on any package this
stage touched. The one outstanding `go fix` suggestion in scope is `shared/tasks/queue_scale.go`
(a `maps` import), which predates this work and sits outside its touch surface — it was left rather
than swept in.

**Stage B is closed.** The account pipeline runs end to end: `PUT /archived-jobs` queues an account,
`ScheduleDrainAccountStatsRebuildQueue` publishes hourly at minute 30, the worker drains, and the
claim protocol decides what stays queued. Behaviour → [overlay.md](./overlay.md) § Stage B.

**Stage E is closed for the account scope.** The SPA reads `totals`, `timeline` and
`timeline/items`; the dashboard carries the month-on-month comparison and the item breakdown; the
archive dialogue renders its four segment blocks. Every remaining stage item belongs to Stage C.

**The ingest half of Stage C's producer has landed.** The SPA's sale-line builders were dropping
the corporation and character ids ESI already supplies; all four now record them, and
`shared/jobidentity` converts them to refs on write with no backend change. Behaviour →
[overlay.md](./overlay.md) § Ingest — entity ids on stored jobs.

**Stage F is complete and committed.** The archive is readable: a paged list of summaries and a
single-document read, both account scoped by the session. `services` builds, vets and tests clean,
and `go fix -diff` reports nothing on any package the stage touched — the one suggestion the
planning gate found, `errors.AsType` in `shared/mongo/docs.go`, landed with it. Behaviour →
[overlay.md](./overlay.md) § Stage F.

**Stage G is complete.** The three restore routes are served and the write sequence is one
server-side operation. `services` builds, vets and tests clean, and `go fix -diff` reports nothing on
the packages it touched. Behaviour → [overlay.md](./overlay.md) § Stage G.

One design point changed during the work and is recorded above: the ESI re-link is written
**server-side**, not handed to the SPA to apply. The `accounts` document is realtime synced, so a
server write reaches the client's store before it would next save — which is what lets restore stay
atomic instead of splitting the job write and the re-link across two processes.

**Stage H is complete for the account scope.** The page carries both tabs, the chart primitives are
shared, the price-history dialogue moved onto them, and the list and statistics panels each have a
mobile layout. Behaviour → [overlay.md](./overlay.md) § Stage H.

**Group membership survives archiving, and restore honours it.** A job archived on its own stays a
member of its group; the group marks it in `archivedJobIDs` and drops its contribution from the
derived sets until it comes back. Restore returns each job to the group it was archived from, merging
into that group when it is still on the planner and rebuilding it from every job that names it when
it is not. A group another session holds refuses the restore. Behaviour →
[overlay.md](./overlay.md) § Group membership while a job is archived and § Stage G.

**Stage I is complete.** Group derivation has one backend owner and a corpus both sides read, and the
three rules that had drifted — name truncation, blank output names, and id ordering — now agree.
Behaviour → [overlay.md](./overlay.md) § Stage I.

**Start here: Stage C**, the only stage still open. Everything else is complete for the account
scope.

**Stages H and I are independent of Stage C** and proceed while the corporation scope stays deferred;
the page leaves the same corporation seams the archive dialogue does.

**Start here for Stage C: decide what scopes a job to a corporation.** That decision — and the
`_meta.corporationRef` it stamps — is the only thing between here and a corporation archive with
data in it. Everything downstream of it is either built or deliberately deferred. The frontend seams
for the corporation scope are already open, see § The archive dialogue.

Before designing the aggregation against real shapes, run the two data steps below; a pipeline
designed against a database where every corporation ref is empty would be guessing.

### Operational steps owed

Neither is development work. Both are commands run against a database, and both are needed on dev
before Stage C can be designed against representative data.

**Order matters: identity conversion first, then the rebuild.** The rebuild derives statistics from
job documents, so converting identities first means it sees refs where they exist. The other order
just means the corporation data arrives a rebuild late.

| Step | Command | Why |
|------|---------|-----|
| 1. Convert stored entity ids | `tasks encodeJobIdentity` (`-dry-run` first) | On dev, `protected.spec` is null on all 9,130 archived jobs and 834 still hold a raw `corporation_id` on their linked jobs. Those are the only corporation ids in the database, and `archivestats` reads refs, so until they are converted the aggregation sees nothing. It is also the first thing that would give `character_ref` any value at all. Owned by [entity-id-encryption](../entity-id-encryption/plan.md); this project only depends on it |
| 2. Rebuild statistics | `tasks queueArchivedJobStatsRebuild -all` (`-dry-run` first) | Recomputes every account's three collections. Idempotent, and safe to re-run |

Both must also run against **live** when this work ships — with the caveat that live carries no
statistics collections yet, so step 2 there is a first population rather than a catch-up. Whether
step 1 has already run against live was not checked; do not assume live matches dev.

### Left open, none blocking

1. **A statistics rebuild is owed** — see § Operational steps owed. Changes have landed since the last
   one: the Market segment decides on evidence, broker fees count as market activity, the stored row
   lost its per-line corporation fields, and a job's cost now includes invention. Existing rows keep
   the old figures until a rebuild rewrites them. Behaviour →
   [overlay.md](./overlay.md) § Corrections to figures already served.
2. **`retainedStockBuild` is dead in the UI.** Nothing in `frontend/src` writes it, so Stock means
   "no recorded sale" rather than "deliberately kept". Wiring it would separate the two.
3. ~~**The lifetime-totals module still says `buildStats`.**~~ **Done** — see § The SPA's statistics
   modules are named for their views.
4. **`extrasTotal` is recomputed only on add and remove.** Editing a row's value in place, or
   loading a document with a stale total, leaves it unreconciled — and the archive would inherit the
   drift permanently. Not investigated further; outside this plan's surface.
5. **The dev database holds 110 `testfixture-` jobs** from month-duplication testing. Harmless,
   removable whenever.
6. **The worker's end-to-end composition still has no live test** — see Open question 1. The Mongo
   helpers are covered individually; what the cron exercises untested is the rebuild that calls them
   in order. The obstacle the question recorded is gone: `eip dev` now publishes the data ports on
   the host, so a live test runs from a host shell rather than needing a one-off container.

**`dataSnapshots` is the one shape still carried for compatibility.** The totals row holds an
unbounded per-job array that duplicates `account_archived_job_stats`, kept so the two panels reading
it did not have to change with the endpoint. Replacing it with a per-job view is a Stage E decision
once those panels are being touched anyway.

### Archive dates: what the sources actually hold

Cost attribution needs a date per job, and most archived jobs did not carry one. Establishing where
one could come from took an investigation across three sources; the conclusions are recorded here so
it is not repeated.

**`_meta.archivedAt` is missing on nearly every imported job** — 9,129 of 10,094 on live, a
comparable share on dev. The live write path always stamps it (`putHandler.go`), so every such job
came from the Firestore import.

**The import did not lose it. Firestore never had it.** `hoistLifecycleToMeta` maps
`archiveTimeStamp` → `archivedAt`, and a read-only sweep of all 9,129 Firestore `ArchivedJobs`
documents found **zero** carrying that field. The mapping is correct and had nothing to map.

**The old build stats did record a date.** Firestore `BuildStats` documents hold a `dataSnapshots`
array with a `jobID` and `processDate` per job — 9,108 entries, all populated. That is when the
retired worker processed a job rather than when a user archived it, but it is real evidence: see the
overlay's validation of the 5,057-job overlap.

**`jobID` is not a usable source.** 2,580 legacy ids encode a millisecond epoch, but it is a
*creation* time, covers only 224 of the undatable jobs, and shrinks toward zero as UUID ids replace
it. Rejected.

**Resolution.** Dates are taken from the job's own linked jobs or sales where present, then from the
recovered `processDate` map, and otherwise left unset for the read-time fallback to handle:

| Source | Live jobs |
|--------|-----------|
| The job's own linked industry jobs or sales | 7,358 |
| Recovered Firestore `processDate` | 1,537 |
| Nothing dates them | 234 |

Applied to live on 2026-08-23, taking coverage to 9,860 of 10,094 (97.7%), spread across 2022–2026.
Live carries no statistics collections yet, so this changed no figure any user sees — it is
preparation, done while the Firestore keyfile and the export were both to hand and the source is
being retired.

The backfill ran from a standalone `mongosh` script with the recovered dates inlined, not from a
repo command: it is a one-time historical correction against a system being decommissioned, and
embedding 1,537 dates in the service would outlive its usefulness.

**The 234 are genuinely unknowable.** No archive date, no linked jobs, no sales, no Firestore
record. They resolve a month at read time through `archiveDateFor`, which is honest about not
knowing rather than manufacturing a date.

### Open questions

1. **Live coverage.** Narrowed to one gap; the Mongo helpers themselves are covered.

   **Confirmed against stack Mongo**, all passing:

   | Test | Pins |
   |------|------|
   | `live_rebuild_queue_test.go` | The claim protocol — `queuedAt` survives a re-queue while `claim` increments, a stale claim clears nothing, the current claim clears the account |
   | `live_account_rebuild_test.go` § revokeAndPrune | Keep-list rows survive, absent ones are revoked not deleted, produced months stay and empty ones are pruned |
   | `live_account_rebuild_test.go` § emptyKeepListClearsTheAccount | An empty keep-list drops the `$nin` and empties the account, rather than leaving it untouched |
   | `live_account_rebuild_test.go` § writesBeforeRemoving | Both outgoing and incoming rows are readable between the write and removal halves, so a mid-rebuild reader sees no gap |

   **Still open:** no live test drives `RebuildAccountStatistics` end to end over seeded archived
   jobs. The helpers are pinned individually, but the worker's own composition of them — load,
   build rows, upsert, revoke, prune — is exercised only by the hourly cron against real data.
   Closing this needs full `models.Job` fixtures, which is why it was not done with the rest.

   **The revoke idempotency assertion is deliberately awkward.** It passes a *later* timestamp on
   the second pass, because `$set` writes `revokedAt` as well as `revoked`: with the same
   timestamp, re-matching an already-revoked row changes nothing, Mongo reports no modification,
   and the assertion holds even with the `revoked: {$ne: true}` guard deleted. That weaker version
   was written first and confirmed worthless by deleting the guard and watching the test still
   pass. Do not simplify it back.

   **Reaching Mongo is no longer the obstacle.** `eip dev` publishes the data ports on the host, so
   a live test runs from a host shell with `MONGO_HOST=localhost`, `MONGO_PORT=27017` and
   `EIP_MONGO_PARITY_LIVE=1`, taking the app credentials from the stack secrets. The earlier
   workaround — cross-compiling the package into a scratch image and running it as a one-off service
   on `eip-core` — is no longer needed. What remains is the fixture work: the test needs full
   `models.Job` documents to seed.
2. **Unarchiving.** `feature/archived-jobs-redesign` had a separate `removal.go` path rather than
   relying on a wholesale rebuild to notice a job had gone. Revoke-on-rebuild covers it, but only
   when something queues the account — decide whether unarchive needs its own producer.
3. **Keep-list size.** Revoke and prune pass every surviving id in a `$nin`. Fine at hundreds; an
   account with tens of thousands of archived jobs would want a generation counter on the rows
   instead.
4. ~~**Producer without consumer.**~~ Closed: the hourly drain schedule landed, so the queue has a
   consumer and the first pass picks up whatever accumulated.

5. **`shared/archivestats` is not shared.** Its only importer is
   `worker/tasks/archivedjobs/rebuild_account.go`, and nothing in `api/`, `core/` or `websocket/`
   touches it. The package sits in `shared/` on the expectation of a second consumer, but Stage C's
   corporation pipeline is another worker task, so even then both callers are the same service.

   What would justify `shared/` is a consumer in a different service, and the API is the only
   candidate — which Stage D deliberately ruled out by having it read pre-aggregated documents
   rather than recompute anything.

   Moving it to `worker/tasks/archivedjobs/archivestats/` is a mechanical change: the package imports
   only `models` and `mongo`, so nothing structural blocks it. Left where it is for now because Stage
   C will add code to it, and moving a package while a stage is still writing into it is churn for no
   benefit. Revisit when Stage C closes, or sooner if it is cancelled.

   One of its four exported symbols has no caller outside the package: `AccumulateAccountBuckets`,
   an exported internal whose only caller is `AccountBuckets`.

### Decisions already made, so they are not re-litigated

- Rebuilds are **wholesale per account**, not incremental. The queue stores `{accountID, claim}`
  and cannot express which jobs changed, and wholesale is idempotent, which the claim protocol
  depends on.
- Entity ids reach `archivestats` as **refs**, never raw, because raw ids do not survive a write.
- **A job belongs to one archive**: personal jobs to the personal archive, corporation-scoped jobs
  to the corporation archive, each aggregated by the same pipeline over its own documents. Sale
  lines are never split between owners, so per-line corporation attribution was removed.
- A job is scoped to a corporation only from an **id recorded against it**, never inferred from a
  character, station, blueprint or account — see § What may scope a job to a corporation. Work whose
  corporation was never recorded stays personal.
- The drain cron runs **hourly at minute 30**, offset from the build stats fan-out on minute 0
  because both read archived-jobs data and contending every hour buys nothing. It publishes
  **unconditionally** rather than reading the queue first: that read would duplicate the worker's
  own and give the scheduler a Mongo dependency to fail on, to save one message an hour.
- The drain is **one task over the whole queue**, not one task per account, even though the
  neighbouring `ProcessArchivedBuildStats` fans out per account. The claim protocol that keeps a
  mid-rebuild re-queue from being cleared lives in the drain; per-account fan-out would move that
  logic into a path the queue's semantics are not tested against, to buy parallelism a queue of this
  size does not need. Revisit if a pass approaches its 15 minute timeout.
- The B1 / B2 / B3 split is conversational shorthand, not a documented structure: B1 pure
  transformation, B2 worker tasks, B3 scheduling and producers. This plan defines Stage B as one
  stage.

**Recommended pickup order:** A → B → D → E. A and B are done; C is deferred until a producer for
`_meta.corporationRef` exists. D depends on the Stage A models; E depends on D's response shapes.

**Reference material:** `feature/archived-jobs-redesign` on origin. Read it for pipeline shapes and
bucketing logic; do not merge or cherry-pick its Mongo-touching commits.
