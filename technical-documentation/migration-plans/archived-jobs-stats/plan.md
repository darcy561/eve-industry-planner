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
narrows to one item, which is a covered filter on the owner-and-type index the timeline reads use.

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
| ~~`Components/Dialogues/Blueprint Archive/hasMeaningfulBuildStats.js`~~ | ~~`dataSnapshots.length > 0`~~ | **done** — now `hasMeaningfulTotals.js`, reading the totals row's own measures |
| ~~`.../Archive Jobs Panel/archiveJobsPanel.jsx`~~ | ~~`archiveData?.dataSnapshots`~~ | **done** — reads `totals.history`, the build history marks J1 put on the row |
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

**ESI links were released.** Archiving removes the job's linked runs, orders and transactions
(`Job.LinkedESIJobIDs`, `LinkedOrderIDs`, `LinkedTransactionIDs`) from the account's linked-ESI set,
so those entries became available to other jobs
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

#### Item statistics is its own tab

The breakdown table answers which items earned the most. It cannot answer what one item has done
over time, which is a different question with a different shape — one item, every month — so it gets
its own tab rather than a mode on the table. The Blueprint Archive dialogue is left alone: it is a
per-item summary opened from a blueprint and is not trying to be this.

The item is chosen from the **blueprint list the SPA already searches**, not from a ranked list of
the items the archive holds. An item with no archived jobs is a legitimate thing to ask about — the
answer is "nothing yet" — and the ranking endpoint caps its page, so a list built from it would omit
items silently rather than admit it had.

**The window asked for is the window read.** A period is sent to the server, which filters on an
index it already has; the client never trims a wider read down. Reading all of an account's history
to show two months of it is work at both ends for months nothing displays, and the page opens on two
months precisely because that is the useful default.

Both tabs go through `useArchiveTimeline`, which takes an optional item — the item tab is the same
read with a `typeID` on it, not a second mechanism. `timelineWindow` beside it is the one place that
decides how a window is expressed to the API, because the two `timeline/items` readers have to say
it the same way.

Each window is its own cache entry, so a period visited twice is served from the first visit and the
control still feels immediate after the first read of it. The default preset sends **no bounds**,
which is how the API is asked for its own comparison window — the same request the overview makes,
so the page opens on one entry rather than two holding the same two months.
The rule that comes with it: a figure shown under a period control is summed from the sliced months,
never read from a lifetime total that arrived in the same response.

#### List and restore

**The page is three tabs — Statistics, Item Statistics and Archived Jobs.** Charts sit on the
default tab, per-item history on the second, and the list on the third with the full page width its
three row shapes need. Neither of the later two is queried until it is opened.

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

**A row whose figures are not in the aggregates yet says so.** The list reports `awaitingTotals`
from the statistics row's missing `contributedAt`, and the row carries a chip. Archiving returns
before the fold that counts it runs, so a job is briefly in the list and not in the charts; unmarked,
that reads as a figure that is wrong rather than one that is a few seconds away.

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

### Stage J — Incremental statistics and the build history panel

Archiving one job rebuilds every statistic the account holds. `RebuildAccountStatistics` loads every
archived job for the account, reduces all of them, and rewrites every row, bucket and lifetime total.
The cost of archiving a job therefore grows with the size of the archive it joins: a build from a
year ago is recomputed because something was archived today.

Five slices. J1 first, then **J3 before J2**: the drain's timeout clears nothing, so a queue too
large for one pass makes no progress at all rather than draining over several. J3 replaces that path
with one task per owner, each clearing its own, so the fault goes with the code rather than being
patched in a path about to be deleted. The rest follow in order, each making the next smaller.

Dev measurements do not speak to this. 227 accounts and 9,530 archived jobs drain serially in six
seconds there, which says nothing about a live archive: the failure is a cliff at the fifteen-minute
task timeout, not a slope, so a comfortable dev margin is not evidence of a live one.

#### The aggregates already decompose

The stage is affordable because the maths is already additive, and that is worth stating before the
slices lean on it:

| Layer | Shape | Consequence |
|-------|-------|-------------|
| `ArchivedJobStats` row | `buildSnapshot(job, snap, now)` reads one job and nothing else | Already per-job; the rebuild only redoes them because it redoes everything |
| `AccountTimelineMonths` bucket | every step is `buckets[key] = buckets[key].Plus(measures)` | A bucket is exactly the sum of its rows' contributions |
| `ProductionTotalsRow` | `BuildMeasures.Plus` and `addSegment(...).Plus` | Same, per item type |

There is no average, minimum, maximum or distinct count anywhere in either fold, and `JobSegment`
classifies a row from its own fields — `IsProductionChain` comes from the job's `ParentJobs`, so
archiving a child never reclassifies anything already stored. A job's contribution can therefore be
added to, or subtracted from, the documents it touches without reading its neighbours.

Two exceptions are named in J2 rather than glossed: the snapshot array, which is not a measure at
all, and the cheapest/dearest figures J1 introduces, which do not invert.

#### Owners, not accounts

Stage C scopes statistics to corporations, and corporations are **peers of accounts** rather than a
slice of one: a corporation holds its own jobs and its own archive, and an alliance is expected to
follow as a third kind. Everything Stage J builds is therefore shaped around an **owner** — a kind
plus an id — rather than an account id:

| Kind | Id |
|------|-----|
| `account` | the account id |
| `corporation` | the corporation ref |
| `alliance` | the alliance ref |

Corporation and alliance ids are refs, never raw ids, per
[entity-id-encryption](../entity-id-encryption/plan.md); an owner therefore carries whatever
identifies its kind internally, and nothing here converts it back.

This lands **now** rather than in Stage C because Stage J creates the surfaces that would otherwise
have to be redone: the delta derivation, the rebuild queue key, and two new task payloads. New code
takes an owner from the start, and the account kind resolves to exactly the key used today.

The **rebuild queue's `_id` is the exception, and it changes now**: from a bare account id to an owner
key, `{kind}:{id}`. It is one of the surfaces Stage J rewrites anyway, and the queue is empty in
normal operation — so the change costs a drain before deploy, where doing it in Stage C would mean
migrating live entries with corporations already in them.

Other storage keys and collection names are **not** renamed here. `ArchivedJobStatsDocumentID`,
`AccountTimelineMonthDocumentID` and the `account_*` collections keep their present shape, with the
owner mapping onto them for the account kind. This plan already records that collection renames are
the expensive part of a scope change; that cost belongs to Stage C. What Stage J owes Stage C is that
adding a kind is **additive** — a new owner value and its storage mapping — not a rewrite of the
delta, the queue and the tasks.

#### J1 — The build history panel, and the end of stored snapshots

`ProductionTotalsRow.DataSnapshots` holds one `BuildStatSnapshot` per job of that type, inside a
single document. It grows without bound toward Mongo's document limit, and it is the reason a
rebuild's output scales with the archive rather than with what changed.

It is also duplicated. Every field is derivable from the `ArchivedJobStats` row that is already
stored:

| Snapshot field | Row source |
|----------------|------------|
| `TypeID`, `JobID`, `JobType` | same fields |
| `ProcessDate` | `ArchivedAt` |
| `TotalProduced`, `TotalMaterialCost`, `TotalInstallCost`, `TotalExtras`, `TotalInventionCost`, `TotalCostPerItem` | same fields |
| `BrokersFeeTotal`, `TransactionFeeTotal`, `TotalJobCost` | `CostParts()` |
| `TotalSales`, `ProfitLoss` | `SalesTotal()` / `JobMeasures()` |
| `MaterialCostPerItem`, `AverageSalePrice` | ratios of the above |

Both are produced side by side in the same pass, from the same job, so this is one fact stored twice.

The array cannot simply be deleted: `ArchiveJobsPanel` renders it. So the panel is rebuilt in the
same slice, around what the panel is actually for — comparing an item's past build costs against the
estimate currently on screen, and seeing whether that cost is drifting.

**What the panel reads.** Both existing endpoints already take the filter it needs:

| Block | Source | New work |
|-------|--------|----------|
| Comparison strip, destination split, lifetime figures | `GET /statistics/account/totals?typeID=` — already fetched by the panel today | Scalars added in this slice |
| Cost make-up over time, cost/extras share | `GET /statistics/account/timeline?typeID=&from=&to=` — **already accepts `typeID`** | None |
| Builds within a month, recent builds | `GET /api/v1/archived-jobs?typeID=&from=&to=&limit=` — **already paged, filtered by type and month, and sorted `archivedAt` newest-first** | None |

**What the panel draws.** Nothing new: the chart primitives take `rows` + `series` and know nothing
about months, so they render both granularities unchanged.

| Block | Primitive | Adapter |
|-------|-----------|---------|
| Cost make-up per unit, by month | `TimeSeriesChart` | `toCostComponentRows`, plus a per-unit variant |
| Average sale price over it | same chart, `{type: "line", role: "sales"}` | `salesTotal / quantitySold` |
| Where output went | `PieChart` | `toSegmentRows` |
| Cost make-up for the window | `PieChart` | `toCostComponentTotalRows` |
| Extras by category | `PieChart` | `toExtrasTotalRows` |
| Period | `ChartRangeSlider` + `trailingRange` | — |
| Builds within a month | `TimeSeriesChart`, **the same series config** | new `toBuildCostRows` |

`COST_COMPONENTS` is a list of field keys, so a per-build adapter emitting those keys renders through
the identical series definition. The drill-down is a different adapter, not a different chart.

**The comparison uses build cost, not total cost.** `COST_COMPONENTS` carries six entries including
broker and transaction fees, which are sale-side. What the panel compares against an estimate is
`JobCostParts.Build()` — materials, install, invention, extras. That four-key subset is defined
beside `COST_COMPONENTS` rather than inlined at the call site, for the reason the cost model itself
was consolidated.

**What lands:**

1. `quantityProduced` on the timeline bucket, so cost per unit is derivable. Additive, and it folds
   like every other measure in `SalesMeasures.Plus`.
2. **Production chain moves into the bucket key** rather than being dropped during the fold.
   `AccumulateAccountBuckets` skipped chain intermediates because their costs are already counted
   through the parent job that consumed them — true for account-wide spend, and wrong for a per-item
   history. Measured against the development archive, dropping them would have left **172 of 1,141
   item types with a completely empty panel** and hidden 6,099 of 9,530 builds; those are exactly the
   items built only as intermediates, where "what did this cost me last time" is a routine question.

   A month therefore holds one bucket per kind. `TimelineQuery.IncludeProductionChain` is off by
   default, so account-wide views read the direct buckets and their figures are unchanged; a per-item
   view sets it and reads the whole history. The chain bucket's `_id` carries a `|chain` segment, so
   direct-build ids are untouched. Doing it in this slice costs nothing extra: `quantityProduced`
   already forces a full rebuild.
3. Fixed scalars on `ProductionTotalsRow`: last build cost per unit and its date, cheapest and
   dearest with dates, first build date. All O(1), and drawn from every non-revoked build including
   chain, so the marks and the timeline agree.
4. The rebuilt panel, on the primitives above.
5. `BuildStatSnapshot`, `DataSnapshots`, and the `foldTotals` line that empties it — deleted, along
   with the `statisticsTotals.js` default and the `hasMeaningfulTotals` check that reads the array.

The date-range filter this slice expected to add **already exists**: `resolveListQuery` reads `from`
and `to` as `YYYY-MM` month keys and bounds `_meta.archivedAt` between them, each bound optional. A
month's builds are `?typeID=34&from=2026-03&to=2026-03`.

**Wire compatibility: breaking on the response, migrate-required on storage.**

`dataSnapshots` leaves the totals response, and archive and statistics documents stop being fanned
out at all. Consumers of the field are `archiveJobsPanel.jsx`, `hasMeaningfulTotals.js` and the
`statisticsTotals.js` default shape. Sequenced additively — scalars first, the panel moved onto
them, then the field removed and no longer written.

Stored documents change shape, so a full rebuild is owed before the panel reads them:

| Document | Change |
|----------|--------|
| `account_timeline_months` | gains `quantityProduced` and `isProductionChain`; a chain month is a new document whose id carries a `chain` segment, and direct-build ids are the ones already stored |
| `account_production_totals` | gains `history`; loses `dataSnapshots` at the end of the slice |

Nothing reads the new fields until the panel does, so the rebuild can run either side of the deploy.
Documents are not migrated in place: the rebuild rewrites every bucket and total it produces and
prunes what it does not, so an account's shape converges in one pass.

##### The archive and statistics change streams are removed

Investigating what `dataSnapshots` reached found a realtime path that runs end to end and is thrown
away at the last step. The `archive_and_stats` group watches `account_archived_jobs` and
`account_production_totals`, and both are delivered to connected clients.

Delivery does not require a subscription. Account-scoped realtime has no per-document fan-in —
`enqueue.go` states it, and `dispatch.go` resolves recipients by precedence
`accountID → corporationRef → allianceRef → explicit doc subscribers`. A client authenticated for an
account therefore receives **every** change event for that account, whether or not it asked for one.
The per-document allowlist in `subscribe_auth.go` governs only the explicit subscriber path, which is
the last resort in that precedence, not the way these documents arrive.

What receives them is `Realtime/applyRemoteMessage.js`, and it handles five collections: `accounts`,
`account_settings`, `account_job_groups`, `account_watchlist_deprecated` and
`account_job_documents`. Anything else falls through its checks and is discarded. Archive and
statistics documents are in that second category.

So the cost is paid the whole way along, and the last step is a browser dropping the message:

1. the oplog entry is read and decoded,
2. the **full document** is embedded in a `ChangeStreamMessage` (with the previous document, where
   the collection keeps one) and marshalled to JSON,
3. the message is published to **JetStream**, which persists it for offline replay,
4. ws-router routes it to every connected session for the account,
5. `applyRemoteMessage` finds no handler and discards it.

The writes this project makes are the expensive ones. Archived job documents average 6.4 KB, so
archiving a job pushes one to each of that user's open sessions for nothing, and seeding the
development archive wrote 9,530 of them. A rebuild that genuinely changes figures — a cost-model
correction, for instance — rewrites up to 4,073 production-totals documents and sends every one.

**J5's notification does not depend on any of this.** It is an explicit push published when
processing finishes, not a document event, which is also why it is cheaper: one small message per
completed rebuild instead of thousands of document copies carrying the same news.

What lands:

- The `archive_and_stats` group is removed from `CollectionGroups()`, taking one parallel watcher with
  it. Its stored resume token is deleted as an operational step rather than by code — see
  § Operational steps owed.
- **Both collections leave the `subscribe_auth.go` allowlist too.** Authorising an explicit
  subscription that can never receive an event is worse than not offering one: a future subscriber
  would connect successfully and silently receive nothing.

Nothing breaks, because nothing handles these messages today. It is reversible in one line each, and
would need an `applyRemoteMessage` handler to be worth anything — which is the check to make before
adding a collection to a group, since delivery is automatic and only the handling is opt-in.

**Tests:** the per-unit and per-build adapters against fixed rows; a Go test that the new scalars
match a full reduction of the same jobs.

##### Open — what the panel compares history against

The panel shows what an item has cost before. What it compares that against is not
settled, and it ships without a comparison rather than with a wrong one.

`Job.buildCostPerItem()` is not it, though the name reads that way. `materialCost()` sums
`material.purchasedCost`, which accumulates only as purchases are recorded, so on the planning stage
the figure is **money already spent on the open job**, not a projection of what it will cost. Used as
an estimate it produced differences in the tens of thousands of percent, because a large share of archived
builds recorded no material spend at all — 1,165 of 4,073 totals rows carry `lastCostPerItem` 0, and
1,900 of 9,530 statistics rows carry `totalMaterialCost` 0.

The figure that does mean "estimate" is the one the Material Prices panel already computes.
`useMaterialPricingModel` depends only on `state.activeJob` and `actions`, so it is callable from
anywhere in the stage — but it returns **two** totals and the panel renders both side by side:

| Total | Sourced from |
|-------|--------------|
| `totalPriceChildMode` | child job costs — build cost, install and extras |
| `totalPriceMarketMode` | market prices for the materials |

Neither is "the" estimate; the user reads them against each other. So the choice is a product
decision about what a build-history comparison means, not a wiring detail, and it belongs with the
planning stage's own design rather than being guessed here.

Two things also have to be true before any comparison is trustworthy:

- **The archived side must have recorded costs.** A build with no material spend did not cost
  nothing — it was not tracked. Comparing against one is noise, and roughly a fifth of rows are in
  that state, so the comparison needs suppressing rather than showing a confident wrong number.
- **The estimate should be computed once for the stage.** Calling the pricing model from a second
  panel recomputes it; the figure belongs to the stage, and lifting it is the small piece of the
  larger planning-stage rework this waits on.

#### J2 — Statistics are applied as a delta

With the array gone, every document the pipeline writes is fixed-size, and a job's contribution can
be applied on its own rather than recomputed with every other job's:

- **Adding** — `$inc` the row's measures into the one to three buckets it names and its type total,
  and stamp `contributedAt` on the row in the same operation. O(1) in the size of the archive.
- **Removing** — `$inc` the negation and mark the row revoked. The row records what it contributed,
  so the delta is read rather than inferred.
- **Idempotence** — `contributedAt` is the guard: a row already folded in cannot be folded twice.

Both directions are applied by a task rather than by the request that caused them, for the reasons
below.

Computation stays pure and application stays in Mongo, matching how `AccountBuckets` and
`UpsertStructsPreservingMetaBulk` are already split: `archivestats` gains the delta derivation, and
`shared/mongo` gains the write that applies it.

The shape they pass between them lives in `shared/models`, because `archivestats` already imports
`shared/mongo` for document ids and the import cannot go both ways. `StatsDelta`, `StatsBucketKey`
and `StatsTypeDelta` therefore sit with the measures they carry: one side derives, the other writes,
and models names the thing in between.

**Cheapest and dearest do not invert**, so they are not incremented at all. Sums move by addition;
minima and maxima do not, and removing the cheapest build leaves nothing in a counter to recover the
next one from.

Rather than incrementing one way and repairing the other, the marks for a touched item type are
**recomputed from that type's rows in both directions**. The measurement that decides it: an
owner+type holds **2.3 rows on average and 46 at most**, so recomputing is a handful of small
documents — cheaper than any scheme for maintaining a minimum in place, and it removes the asymmetry
rather than handling it.

**This re-opens something Stage B deliberately closed.** `AccountProductionTotals` records that these
totals were once produced by a separate worker applying `$inc` per job behind a processed flag, and
that deriving them wholesale removed both. Stage J gives that guarantee up, so it has to be replaced
rather than assumed:

- `contributedAt` is a stronger guard than the flag it replaces, because it lives on the row whose
  contribution it describes rather than on a separate marker.
- **Reconciliation** folds an owner's stored rows and writes the result over the aggregates the
  deltas produced, so drift is corrected on a schedule instead of presumed absent. It compares only
  in order to report.
- The full rebuild remains as an explicit operation for definition changes — a correction to the cost
  model invalidates every stored row, and only re-deriving them fixes it.

Reconciliation does not re-derive anything, and the distinction is what keeps it affordable. A
rebuild carries two costs, and only the second can drift:

| Step | Reads | Account measured 31 Aug |
|------|-------|--------------------------|
| Re-derive rows from jobs | full archived job documents | 9,530 docs @ 6,386B = **58.0 MB** |
| Fold rows into buckets and totals | the rows, already computed | 9,931 docs @ 1,352B = **12.8 MB** |

Rows are written whole, once per job, and never incremented; a `$inc` that goes missing or lands
twice corrupts a bucket or a total, never a row. So correcting the deltas means folding the rows that
already exist — 4.7× less data and no re-derivation — and re-deriving is only necessary when the
derivation rules themselves change.

Archiving therefore never queues a **rebuild**. Rebuild work comes only from a command or from a
definition change, which is what makes it rare enough to treat as an event worth telling the user
about.

##### A delta must never race a rebuild

Until now the rebuild is the only writer of buckets and totals. The delta is a second one, and a
delta landing while a rebuild is in flight would be lost: the rebuild folded its aggregates from rows
read before the delta, then upserts them wholesale over the `$inc`. The claim protocol protects the
queue entry, not the documents.

No new lock is introduced for this. **If a rebuild is in flight, the delta path bumps the claim
instead of applying.** Bumping the claim is already what invalidates that rebuild's clear, so the
owner stays queued, is rebuilt again, and the new job is picked up by the rebuild that follows.

The mechanism that already exists for "a change arrived mid-rebuild" is exactly the mechanism this
needs. The delta path only has to recognise the case and fall back to it.

Recognising it needs no new field. This section first proposed a `rebuildStartedAt` marker written by
the rebuild, but the single-queue decision below makes that marker unreachable: a fold is only ever
dispatched from an entry whose work is `delta`, and the only way that entry becomes a rebuild is
`QueueOwnerWork`, which bumps the claim in the same call. So a rebuild can never be in flight for an
owner while a fold still holds the current claim, and a marker would only ever restate what the claim
already says. The condition the fold checks is therefore the **claim itself** —
`OwnerClaimIsCurrent`, sharing `clearQueuedOwnerFilter` with `ClearQueuedOwner` so a fold may write
exactly when it would still be allowed to finish.

##### Subtracting to nothing must remove the document, and counts decide that

The rebuild ends by pruning what it did not produce — `RevokeAccountArchivedJobStats`,
`PruneAccountTimelineMonths`, `PruneAccountProductionTotals`. The delta path has no equivalent, so a
bucket whose last job is restored would remain as a zero-valued document. That is not cosmetic:
`AccumulateAccountBuckets` only ever creates a bucket that had activity, so an absent bucket and an
all-zero bucket mean different things, and the timeline would start reporting months that should not
appear.

The delta path therefore deletes a document once nothing contributes to it, **decided on an integer
count, never on the money fields**. Subtracting float64 leaves a residue rather than zero, so an
"all measures are zero" filter would silently never match and the documents would accumulate anyway.
Buckets gain a contributing-row count, totals use the job count they already carry, and
`TransactionCount` is already `int64`. A count reaching zero is exact; a sum reaching zero is not.

A periodic sweep stays as a backstop for anything a failed delete leaves behind.

##### The delta is a task, and its work list is the rows themselves

Applying the delta is not part of the archive request. The request writes the archived jobs and their
rows and queues the owner; a **per-owner delta task** applies them. Archiving returns as fast as it
does today, and the figures follow within seconds rather than within an hour.

The task carries no job list. Its work is *every row for this owner with no `contributedAt`*, so the
stamp that makes the delta idempotent is also what describes the outstanding work. Three properties
follow without any extra machinery:

- **It coalesces by itself.** `PutArchivedJobsHandler` already takes a batch of up to 100 jobs, so
  archiving twenty is one request, one queued owner and one task. Even if it were twenty requests,
  the queue is keyed by owner and the task picks up whatever is uncontributed — the count of requests
  does not change the count of tasks.
- **A crashed task loses nothing.** Rows it did not reach are still unstamped, so the next run takes
  them.
- **It cannot double-apply.** A row is stamped in the same operation that applies it.

Failure is handled by the task rather than by the request, which is what keeps a broken statistics
write from failing an archive that actually succeeded. A failed delta fails its task and is retried
under asynq's existing backoff and jitter.

Repeated failure must not become a loop. Once the retries are exhausted the failure is recorded on
the queue entry — `failures`, `lastError`, `lastFailedAt` — and the task stops. That entry is what J5
reads to tell the user their figures are stale, so a permanently failing owner surfaces as a failed
recalculation rather than a spinner that never resolves.

##### One queue, carrying a work kind

The delta task means archiving queues the owner again — not for a rebuild, but for delta application.
The queue therefore carries two kinds of work, and a single entry has to say which.

It stays **one queue**. The claim protocol, `queuedAt` and the dispatcher are all per-owner already,
so a second queue would duplicate every one of them for no gain. The entry gains a `work` field
instead, and the kind decides three things that would otherwise conflict:

| | `delta` | `rebuild` |
|---|---|---|
| Dispatched | as soon as the next tick sees it | after the debounce window |
| Priority | `priority_3` | `priority_5` |
| Reported to the user (J5) | no | yes |

**A rebuild supersedes a delta.** Queueing a rebuild for an owner that has deltas outstanding
upgrades the entry rather than adding to it: a rebuild re-derives every row from its jobs and
rewrites the aggregates wholesale, so it already accounts for whatever the deltas would have applied,
and it stamps `contributedAt` on the rows it writes. Upgrading is therefore lossless, and the reverse
never happens — a delta arriving against a queued rebuild leaves the rebuild in place.

That upgrade is also what makes the guard in *A delta must never race a rebuild* complete: the delta
path's fallback when a rebuild is in flight is the same operation, so there is one rule rather than
two.

##### Restoring many jobs at once

Restoring a group or a related set returns many jobs in one operation. Their deltas are accumulated
in memory and applied as one batched write per affected document, rather than one round trip per job.
The subtraction is the same; only the number of writes changes.

**Wire compatibility: additive.** `ArchivedJobStats` gains `contributedAt`. Bucket and totals
document shapes are unchanged.

**Tests:** the corpus pattern already used for group derivation and job cost — a fixture of jobs, the
documents a full rebuild produces, and the assertion that applying the same jobs as deltas produces
the same documents. Plus the inverse: applying and then reverting a job returns the documents to
their prior state.

##### What landed

1. **`ContributionOf` calls the folds rather than repeating them.** A row's contribution is derived by
   folding a slice of one, through the same `AccumulateAccountBuckets`, `JobMeasures` and
   `JobSegment` a rebuild uses. A test pins the property the whole approach rests on: summing every
   row's contribution reaches what folding all of them reaches. Removal is that contribution negated,
   so the figures a row put in are exactly what comes back out.
2. **Totals are keyed by item type *and segment*.** Rows of one type can sit in different segments — a
   build sold on the market, another consumed by a parent job — so merging on type alone credits only
   whichever was folded last.
3. **Emptiness is decided on a count.** Buckets carry `contributingRows`; a bucket is deleted when it
   reaches zero. Subtracting float64 leaves a residue, so a test for zero money would never match and
   the documents would accumulate — and an absent bucket means something a zeroed one does not.
4. **The queue carries a work kind**, `delta` or `rebuild`. A rebuild supersedes a delta and upgrades
   the entry; the reverse never happens. An entry written before the field existed reads as a
   rebuild. Only rebuilds wait out the debounce — a fold is what a user is waiting on.
5. **The fold task carries no job list.** Its work is the rows with no contribution stamp, and the
   rows that still carry one although their job is no longer archived. The stamp that prevents
   double-counting is therefore also the description of what is outstanding, in both directions.
6. **Restoring revokes the rows it removed from the archive**, leaving the stamp in place. Revoked
   says the figures should not be counted, the stamp says they still are, and the difference is the
   work.
7. **A rebuilt row is stamped as counted.** This was not anticipated and is the bug that would have
   done the most damage: a rebuild writes the aggregates and the rows in one pass, so leaving a row
   unstamped offers finished work to the next fold, which adds it on top of totals that are already
   whole. Every test covered a single path; nothing saw the seam until a rebuild and a fold ran in
   order. There is now a test for that seam.

Verified against the development archive: a full rebuild of 227 owners reproduced the baseline
figures exactly and stamped 9,530 rows, and a fold immediately afterwards reported `added:0
removed:0` and left every figure identical.

##### The guard, as built

`applyOwnerDelta` reads the owner's outstanding rows before it writes anything, so between the read
and the `$inc` a rebuild could have counted those same rows itself. The fold therefore calls
`OwnerClaimIsCurrent` after loading and before the first write, and where the claim has moved it
writes nothing: it re-queues the owner as delta work and returns `Deferred`. The rows stay unstamped
and outstanding, and the bumped claim invalidates the clear of whatever superseded the fold, so the
owner is worked again rather than left half applied.

Three states fail the check and all three are correct to back off from: the entry was re-queued, it
was upgraded to a rebuild, or it is gone because a rebuild already swept it. In each case something
that derives every figure from the rows themselves is accounting for them.

The check is skipped when the fold found nothing to do — with no rows there is nothing to
double-count, and the clear that follows already carries the claim.

`TestLive_rebuildQueue_claimCurrencyGuardsAFold` drives the three states against stack Mongo: current
on the dispatched claim, not current once a rebuild upgrades the entry, and not current once the
entry is swept.

##### Known and not built — two folds on one claim

Nothing marks a queue entry as dispatched, so two dispatcher passes overlapping on one owner can
publish the same fold twice on the same claim. Both would pass the guard, both would read the same
outstanding rows, and the figures would be added twice. It has not been observed, and J4 rewrites
aggregates from rows every cycle, so drift of this shape self-heals. Recorded rather than fixed.

#### J3 — One task per owner, dispatched rather than drained

The drain is a single task that rebuilds every waiting account in one serial pass, time-boxed at 15
minutes. Three properties of that shape do not survive a queue longer than the box:

- **It is serial** while the worker pool is 50, so one account is rebuilt at a time.
- **It clears once, after the loop.** For the whole pass the queue still lists accounts already
  rebuilt, so an overlapping pass redoes them from the top — and nothing prevents overlap: the cron
  publishes unconditionally every tick, there is no message id, no unique-task option and no lock.
- **A timeout clears nothing.** The loop breaks on `ctx.Err()` intending to keep its progress, but
  `ClearQueuedAccounts` is called with that same cancelled context, so the write fails. A queue that
  cannot be drained inside 15 minutes therefore makes *no* forward progress: every pass rebuilds the
  same leading accounts, times out, clears nothing, and the next pass starts from the same place.

None of it is a correctness fault — rebuilds are wholesale recompute-and-upsert, so duplicate and
concurrent passes write the same values, and the claim protocol still protects a mid-rebuild
re-queue. It is throughput and liveness.

##### The single task is not protecting what it was said to protect

The shape was chosen to keep the claim protocol in one place rather than spread across per-account
tasks. But a claim is already per-account data — read as `{accountID, claim}`, cleared on
`{_id, claim}` — so a task carrying its own claim holds the protocol *closer* than a pass that reads
five hundred claims and clears them fifteen minutes later. `ImportUserJobDocumentsForAccount` is
already documented as one account per task, so the shape is not new here either.

##### Three tiers of work

| Work | Shape | Priority | Reads |
|------|-------|----------|-------|
| Delta apply (J2) | per-owner task | `priority_3` | that owner's uncontributed rows |
| Reconcile — fold stored rows, rewrite aggregates (J4) | per-owner task | `priority_4` | that owner's rows |
| Full rebuild — re-derive rows from jobs | per-owner task, dispatched in bulk | `priority_5` | that owner's jobs |

`priority_5` is already described as reserved for bulk work, so a mass rebuild cannot crowd out ESI
or user-facing tasks.

All three per-owner tasks carry an **owner** in their payload, not an account id, so Stage C adds a
kind rather than a task. The dispatcher reads eligible owners from the queue and publishes one task each,
keyed by owner and claim — `{kind}:{id}:{claim}` is a natural deduplication key, and the claim makes
it correct rather than merely deduplicating, because a re-queued owner is a genuinely different piece
of work.

`dispatchStatisticsRebuilds` stops rebuilding and becomes a **dispatcher**: read the eligible
owners, publish one task each, return. It carries no per-owner work, so it cannot meaningfully time
out, and each task clears its own owner on completion — which makes progress incremental by
construction and removes the stall above without a separate fix.

##### Priority is fairness, not a memory cap

Asynq's `Queues` map weights how often each queue is dequeued; it is not a concurrency limit.
`Concurrency: 50` is one global pool and `setupServer` has a single caller, so if rebuilds are the
only work available, fifty run at once whatever their priority. `LoadAccountArchivedJobs` calls
`cursor.All`, materialising every job — fifty of those at the size measured above is roughly 2.9 GB.

So the memory answer is to stop holding the archive, not to schedule around it: walk the cursor and
reduce each job to its row rather than collecting jobs first. Peak falls from jobs *and* rows to rows
alone, the same 4.7×, and it benefits every caller rather than one task type. Folding as rows are
produced would reduce it again to the accumulators plus the kept-row ids; that is the end state, not
the first move.

A concurrency cap — a semaphore in the handler, or a second server with a small pool — stays in
reserve as a tuning knob once streaming is in place, rather than a load-bearing part of the design.

##### The debounce

`queueAccountRebuildUpdate` writes `queuedAt` with `$setOnInsert`, so it records when an owner first
became outstanding and is never pushed forward by later changes. That makes it a maximum wait rather
than a sliding one, which is exactly the gate a frequent tick needs.

- The cron moves from `30 * * * *` to a short interval. Delta entries are eligible on the next tick;
  **rebuild entries wait** until `now - queuedAt` exceeds the debounce window, so the window governs
  the expensive kind and never the one a user is waiting on.
- Because `queuedAt` does not move, an owner changing continuously is still rebuilt at most once per
  window. The window is a single tunable meaning both *the longest a rebuild waits* and *the shortest
  gap between two of them*.
- A tick that fails to publish costs one interval instead of an hour. That failure is observed: a
  publish returned `NATS connection is not connected after retries` during a core restart, and
  nothing retried it, because gocron does not re-run a failed job and the task carried no payload to
  redeliver.

`*/10` and `*/15` crons already exist in this scheduler, so a sub-hourly tick is not a new shape.

##### The operator surface moves with the tasks

Task names are spread across six files plus this project's overlay, so adding three of them is a
documentation change as much as a code one. All of these change together:

| File | What it carries |
|------|------------------|
| `shared/nats/tasks.go` | the `defineTask` definitions — name, subject, priority, timeout — the request payload types, and a named `Publish…` per task |
| `worker/asynq/handlers.go` | `mux.HandleFunc` per task name |
| `core/scheduler/archivedjobs/drain_rebuild_queue.go` | the cron, now publishing a dispatch |
| `core/commands/tasks.go` | usage text, the `enabledTasks` allowlist, `enabledTasksLowerLookup`, `commandTaskName`, the dispatch switch, and the summary list |
| `core/commands/archived_jobs_mongo.go` | `queueArchivedJobStatsRebuild`, and the hint it prints on success |
| `core/commands/prepare_archived_job_statistics.go` | the release steps, which gain a drain once one is safe to fire and forget |
| `core/commands/backfill_archived_at.go` | the hint it prints on success |
| `overlay.md` § Stage B | the task the overlay documents |

Two of those hints state the old cadence — `archived_jobs_mongo.go` tells the operator to "wait for
the hourly drain" — and become wrong the moment the interval changes. They are behaviour statements
in operator-facing output, so they move with the change rather than being left to drift.

A task is defined once in `shared/nats/tasks.go` and published through a named function, so the
subject and priority have a single owner. `core/commands/tasks.go` is the exception: it lists the
same tasks three times — in `enabledTasks`, as lowercase keys in `enabledTasksLowerLookup`, and in
`commandTaskName`. Adding three tasks would mean nine new hand-maintained entries that can disagree. The lookup and the display name are both
derivable from the allowlist, so they are derived from it in this slice rather than extended — the
one-source-of-truth rule applies to a command table as much as to a data model.

**Wire compatibility: additive.** Three new task names and subjects — delta, reconcile and rebuild;
`dispatchStatisticsRebuilds` keeps its name and subject and changes what it does, so nothing that
publishes it needs to know.

**Tests:** the eligibility filter against a fixed clock — a rebuild entry inside the window is not
selected, one outside it is, a delta entry is selected immediately, and a re-queue mid-window does not
extend the wait. Dispatch publishes one task per eligible owner and none for an empty queue. A
per-owner task clears only its own owner, and only on its own claim. Queueing a rebuild over
outstanding deltas upgrades the entry; queueing a delta against a queued rebuild leaves it alone. The CLI allowlist, lookup and display name all agree, which the
derivation makes a property rather than a list to check.

##### What landed

1. **`models.StatsOwner`** — a kind (`account` / `corporation` / `alliance`) and an id, with a
   `kind:id` key and a parser that keeps colons in the id, since a ref carries its own. `Validate`
   refuses a kind nothing can read back, so an entry nothing can address cannot reach storage.
2. **The queue is keyed by owner.** `QueueOwnerWork`, `ListQueuedOwners` and `ClearQueuedOwner`
   replace the account-shaped API, and every producer names the owner and the work it wants. The
   `kind:id` key is the only copy of the owner: a stored duplicate of it was written for a while and
   never read, so it is gone.
3. **`dispatchStatisticsRebuilds` dispatches and no longer rebuilds.** It publishes one
   `rebuildOwnerStatistics` task (`priority_5`) per eligible owner, each carrying the claim its entry
   held. Each task rebuilds its owner and clears its own entry on its own claim, so there is no
   batch clear left to fail on a cancelled context and progress is per owner rather than per pass.
4. **The cron moved to `*/2 * * * *`.** The tick only dispatches, so it is cheap and a failed publish
   costs one interval; how long an owner waits is the five-minute debounce the worker applies to
   `queuedAt`.
5. **The rebuild streams its input.** `EachAccountArchivedJob` walks a cursor and an `accountRows`
   accumulator reduces one job at a time, so memory is proportional to what a rebuild writes rather
   than to the archive it reads — which is what makes many rebuilds safe to run at once. The
   collecting `LoadAccountArchivedJobs` had no callers left and is gone.
6. **The CLI lookups are derived.** `enabledTasksLowerLookup` and `commandTaskName` are built from
   `enabledTasks` rather than being three lists that can disagree, with a test that every enabled task
   is findable under its command name and that none collide.
7. **`prepareRelease`** carries the release steps a deploy owes: dropping retired statistics fields,
   retired change-stream resume tokens, and queue entries whose id names no owner, then queueing every
   account. Steps are grouped by the app version that introduced them and accumulate there rather than
   becoming sibling commands. These four are release **0.9.0**.

##### Carried to J2

The queue entry has no `work` kind yet. Every entry means a rebuild until the delta task exists, so
the field would have one value and the debounce, priority and reporting it decides have nothing to
choose between. It lands with the delta that gives it a second value.

#### J4 — Reconciliation, and how drift is corrected

Deltas can drift: an `$inc` that never lands, or lands twice, leaves a bucket or a total disagreeing
with the rows beneath it. Rows cannot drift — they are written whole, once per job, and never
incremented — so the rows remain authoritative for every aggregate above them.

That makes repair and detection the same operation, and the ordering matters:

**Reconciliation folds an owner's stored rows and writes the result, unconditionally.** It does not
compare first and repair on mismatch. Comparing is done only to *report* — log the field and the
magnitude, emit a metric — so that a delta bug becomes visible. The correction happens whether or not
the comparison notices anything.

That ordering is deliberate. "Detect, then queue a repair" fails silently when detection is the thing
that is broken; writing the fold every cycle means the system self-heals on a fixed schedule and
detection is observability rather than a repair trigger.

Reconciliation is therefore the second half of `RebuildAccountStatistics` — `AccountBuckets` and
`AccountProductionTotals` over stored rows — with no re-derivation. It reads 12.8 MB where a full
rebuild reads 58.0 MB, and never opens a job document.

##### Comparing figures that are floats

Exact equality is the wrong test. Repeated `$inc` and repeated summation do not produce identical
float64s from the same inputs, so a strict comparison would report drift on every owner and mean
nothing.

- **Counts compare exactly.** They are integers, cannot drift by rounding, and a count mismatch is
  therefore unambiguously a bug rather than arithmetic. Counts are the primary drift signal.
- **Money compares with a relative tolerance**, falling back to an absolute one near zero.

J2's emptiness test is not one of these: it counts rows, so it needs no tolerance at all. The
tolerance is defined once in `archivestats` and used only where floats are compared to each other,
which is reporting.

##### Scheduling

A rota, not a sweep: each owner is reconciled once per window. **Due time decides whose turn it is** —
each reconcile stamps its owner in `account_stats_reconcile_rota`, and a tick takes the owners whose
stamp is older than the window, oldest first, capped per tick. It runs at `priority_5` alongside bulk
rebuilds, since nothing waits on it.

Hashing the owner's id into a slot was the first design here, and it was dropped: the slot count is
`window / interval`, so the constant and the cron expression in `core/scheduler/jobs.go` would have
to agree, and disagreeing silently halves coverage or doubles the work. That is the shape the jobs
table was introduced to remove. Due time needs no such agreement — the tick interval sets throughput
and the window sets coverage, and either can change alone. It also takes on an owner seen for the
first time immediately, where a slot would make it wait for its turn to come round.

It is dispatched as **one task per owner**, reusing J3's task shape rather than the shape the existing
maintenance tasks use. Its owners come from the rota, not from the rebuild queue — reconciliation is
something every owner receives in turn, not work that anything requested. `schemaVersionMaintenanceBatch`, `inactiveAccountPlannerCleanup` and
`pruneExpiredAccountSessions` are *batch* tasks — one task walks a slice of work — which suits work
that is small per entity. Reconciliation is not: it folds an owner's whole row set, so it carries the
same per-owner weight as a rebuild and wants the same treatment. Using J3's dispatcher also means
statistics work has one task shape rather than a third one.

**Wire compatibility: additive.** Reconciliation writes the documents that already exist, and adds
one field to the monthly bucket — see below. A new collection, `account_stats_reconcile_rota`, holds
one small document per owner.

##### The bucket's contributing-row count was never written by a rebuild

Found while building this slice, and it is a defect in J2 rather than a gap in J4.

`contributingRows` is what decides whether a bucket still has contributors — J2 chose an integer
count precisely because subtracting float money leaves a residue rather than zero. But the count was
only ever written by the delta path's `$inc`. It was not a field on
`models.AccountTimelineMonthBucket`, so the rebuild, which writes buckets whole, never produced it.
Measured on development: **0 of 7,584 buckets carried the field.**

The consequence is not a missing figure, it is a wrong one. A bucket rebuilt from five rows carries
no count; a delta that later adds one job `$inc`s it from absent to 1; removing two jobs takes it to
-1, and the prune deletes a bucket that still has four rows behind it.

The count is now a field on the bucket, folded by `AccumulateAccountBuckets` alongside the measures,
so every absolute write — rebuild and reconcile alike — sets the true value. A row reaches several
buckets but counts once in each, which is why the fold tracks the keys a row touched rather than
counting the measures it added. Existing buckets gain the field the first time their owner is
reconciled, so the rota repairs this on its own.

**Tests:** a fixture where the aggregates are deliberately wrong and reconciliation restores them; a
fixture where they are correct and reconciliation reports no drift and writes the same values; and
tolerance cases — a float residue is not drift, a count mismatch is.

##### What landed

1. **The absolute write is shared with the rebuild.** `foldAccountAggregates` derives both
   collections from rows and `writeAccountAggregates` writes them whole; the rebuild and the
   reconcile call the same pair, so they cannot disagree about what an owner's aggregates should be.
   The reconcile adds only the read of the rows and the comparison.
2. **A reconcile bumps the owner's claim before it writes.** It accounts for every row a fold might
   be holding, so that fold must not also apply them. `BumpOwnerClaim` reuses the mechanism the fold
   already reads as "something else took this owner on"; it does not upsert, because with no queue
   entry there is no work in flight to invalidate.
3. **A reconcile restamps the rows.** Every live row is in the aggregates afterwards and every
   revoked one is not, so the stamps have to say the same — leaving a live row unstamped would offer
   it to the next fold as though it were new.
4. **Drift is reported, never acted on.** `Drift` separates documents missing, extra, counts off and
   money off, and records the widest money gap and the measure it was on. The write happens either
   way.

Verified against stack Mongo: a seeded owner's aggregates broken in all four ways at once —
money off, count off, one bucket deleted, one orphan inserted — were reported as exactly those four
and restored to the values the first reconcile produced, and a third reconcile over correct
aggregates reported no drift.

#### J5 — How the client learns the figures moved

The SPA queries statistics when it needs them and does not watch the documents. That stays: the
statistics collections are not added to any subscription the SPA opens, and
`account_production_totals` is not subscribed to despite the fan-out admitting it.

What is added is a small **account-scoped notification** — the figures for your owner have been
processed — carrying no statistics payload. The SPA shows a brief confirmation and refreshes what it
is actually displaying. It is a signal, not a feed: the client already knows whether the user is
looking at statistics, and the server does not need to.

**One notification per completed task**, which is what makes it quiet without a coalescing rule.
Archiving twenty jobs is one batched request, one queued owner and one delta task, so it is one
message — the task granularity does the coalescing that would otherwise need a debounce window on
either end. Delivery rides the existing account-scoped routing, so it needs a message kind and a
handler in `applyRemoteMessage`; without the handler the SPA discards it, exactly as it discards the
document events J1 removes.

##### How the notification reaches a browser

The worker publishes to NATS and the websocket service delivers it, mirroring how document changes
already travel — the worker holds no client connections, and the websocket service holds no knowledge
of statistics.

The document path is `doc.update.{tenant}.{collection}.{docID}`, consumed by the websocket service as
a JetStream consumer filtered per hosted tenant (`DocUpdateFilterForTenant`) and routed by
`deliverOutboundDocUpdate`. A notification has neither a collection nor a document id, and
`DocUpdateSubject` returns an empty subject when either is missing, so it cannot ride that scheme
without pretending to be a document.

It gets its own subject family instead — `notify.{tenant}.{subtype}` — with a delivery function
beside the existing one. Tenant construction, the hosted-tenant set and placement are reused
unchanged; only the subject and the handler are new.

**On core NATS, not JetStream.** The document stream persists for offline replay, which is right for
a document change: a client that reconnects still needs it. A notification is the opposite — "your
figures were updated" is worthless replayed three hours later, and delivering a queue of stale ones
on reconnect would be worse than delivering none. Core NATS is already used this way in-tree for
placement state and the health census, so this is the existing answer to "a message that only matters
now" rather than a new mechanism.

It is published and forgotten: no acknowledgement, no retry, and no delivery if nothing is listening.
Nothing is lost by dropping one — the pending and failed states in the next section are derived at
read time, so a client that missed a notification still learns the truth from its next request. The
message only saves it from waiting for one, which is exactly as much as it should be trusted to do.

##### Messages gain a family and a kind

Every message the SPA receives today is `ChangeStreamMessage`-shaped, and `applyRemoteMessage`
dispatches on `collection` and `operationType`. There is no message type: "this is a document change"
is implicit in the shape. A notification has no collection and no document id, and
`applyRemoteMessage` returns early without both — so a notification sent into the current envelope
would be discarded in silence, which is precisely how the archive events J1 removes have been
disappearing.

So the envelope gains two fields, and the notification is the first user of them:

| Field | Meaning | Values now |
|-------|---------|------------|
| `type` | the family of message | `document` (implicit today), `notification` |
| `subtype` | what within that family | for `notification`: `archiveStatsProcessed` |

The archive notification is therefore `type: "notification"`,
`subtype: "archiveStatsProcessed"`, carrying the owner and a timestamp and no figures.

**The same pair names the message internally.** `nats.Message` already carries a `Type` alongside its
`Data` payload — the vocabulary is flat rather than absent, with `task`, `schedule`, `health`,
`ws_placement` and `ws_command` sitting at one level. It gains an optional `Subtype`, so a message is
described the same way on the wire between services as it is on the wire to a browser, and a new kind
is one definition rather than an internal name and an outbound name that have to be kept aligned.

For the notification the two are the same message. The websocket service forwards its payload rather
than rebuilding it, because there is nothing to strip: the tenant is in the subject and the body
carries no routing.

That is *not* true of the document family and must not become true of it. `ChangeStreamMessage`
carries `CorporationRef`, `AllianceRef`, `SourceClientID` and the scope payload — the values delivery
routes on — and refs stay internal until the last hop before a browser. The shared part is the
`type`/`subtype` vocabulary; what a family carries beside it, and what survives the outbound
boundary, remains that family's own business.

**Existing messages are not migrated in this slice**, inside or out. A client message with no `type`
is the document family, which is what every current producer sends; an internal message with no
`subtype` keeps the meaning its `Type` already has. Both can be filled in whenever a later change
touches that path. What lands now is the structure and one producer using it end to end.

`applyRemoteMessage` becomes a router over the family rather than a single flat chain:

- no `type`, or `document` — the existing collection dispatch, moved into its own module beside the
  handlers it already calls
- `notification` — a notification router dispatching on `subtype`

**An unrecognised message is logged rather than dropped in silence.** The current early return is
what let two collections stream to every browser for nothing without anyone noticing; a router that
can say "no handler for `notification/x`" makes the next such gap visible on the first message
instead of during an unrelated investigation.

One vocabulary now spans two languages, and the SPA cannot import the Go constants. This project
already has the pattern for that: a small shared corpus under `testing/fixtures/` listing the valid
`type` and `subtype` values, with a Go test and a vitest test reading the same file, exactly as
`group-derivation` and `job-cost` keep their two implementations honest. Adding a message kind on one
side without the other then turns the other side red.

##### Telling the user when figures are known to be behind

A full recalculation that is queued but not finished means the figures on screen are stale in a way
the user cannot otherwise see. The read surface therefore reports that state — but it is **derived at
read time from the rebuild queue**, not stored on any statistics document, and it is carried on the
response envelope rather than beside any figure.

One lookup by `_id` on a small collection answers it. What it must **not** do is report every entry:
after J2 the queue also carries delta work, so an owner is in it briefly every time a job is
archived, and a flag on mere membership would announce a recalculation for ordinary new jobs — the
opposite of what this is for.

The flag therefore reads the entry's `work` kind and reports only `rebuild`. Delta entries are
invisible here, which is right: their latency is seconds, the notification already covers them, and
there is nothing a user could usefully do about one.

Three states, read from the same entry:

| State | Queue entry | What the client shows |
|-------|-------------|------------------------|
| Current | absent, or `work: delta` | nothing |
| Recalculating | `work: rebuild` | figures are being rebuilt |
| Failed | `work: rebuild` with exhausted `failures` | recalculation failed, figures are stale |

The failed state is what J2's retry ceiling produces, so a permanently failing owner is visible
rather than indefinitely pending.

##### One place decides what a change invalidates

Cache invalidation after archiving is currently spread across the call sites that archive.
`ArchivedJobsList.jsx` invalidates the archive list after a restore, but the two archiving paths —
`archiveJobButton.jsx` and `buttonFunctions.jsx` — invalidate only the statistics queries, so the
archived-jobs list keeps a cached page after a job is archived into it.

Adding the missing call at each site would repeat the defect, because the knowledge being duplicated
is *which caches an action affects*, and the next archiving entry point will get it wrong the same
way. The notification above replaces it: one handler receives the signal and invalidates both, so a
call site archives a job and does not have to know what that invalidates.

**Wire compatibility: additive.** Two new envelope fields that existing producers omit, one new
message kind using them, and a field on the statistics response envelope. Nothing existing changes
shape, and a message with no `type` keeps meaning what it means today.

**Tests:** the flag resolves to the three states from queue entries; the notification handler
invalidates both query sets; a client with no statistics on screen does nothing with it; a message
with no `type` still routes to the document path; and an unrecognised `subtype` is reported rather
than silently dropped. The message-kind corpus is read by a test on each side, so a kind added in Go
without its SPA counterpart fails.

##### What landed

1. **The vocabulary is one corpus.** `testing/fixtures/realtime-messages/kinds.json` is read by a Go
   test and a vitest test, so a kind added on one side without the other turns the other side red.
   `nats.Message` gained an optional `Subtype`, and a notification is published as that envelope and
   forwarded to the browser unchanged.
2. **One wildcard subscription, not one per hosted tenant.** Notifications are rare and small,
   delivery already decides who is connected, and a subscription that never changes cannot fall out
   of step with a tenant set that does. `broadcastRawToAccount` gained a route kind rather than
   growing a second copy: more than one kind of message now reaches a browser through it.
3. **Who publishes, and when.** The fold publishes only when it folded something; the rebuild always;
   the reconcile **only when it corrected drift**. The reconcile visits every owner on a rota, and
   "your figures are the same as yesterday" is not worth a snackbar.
4. **The retry ceiling was built here.** It was agreed in J2 and never landed, and the failed state
   reads it. A task returns its error unchanged while asynq has attempts left; at the ceiling it
   writes `failures`, `lastError` and `lastFailedAt` to the queue entry and stops. The entry stays
   queued, because the work is still outstanding — what changed is that a read can now say so.
   Work that succeeds but cannot clear its entry forgets the failure, since that entry stands for a
   request that arrived later rather than for the run that failed.
5. **The flag is embedded in all three statistics responses.** A client learns the figures are being
   rebuilt from the same request that returned them, so there is no window where it has drawn one and
   not asked about the other. It is omitted when there is nothing to say, and a failure to read it
   never fails the request — the figures are what was asked for.

##### Departed from: the notification does not replace call-site invalidation

This section proposed that the notification replace the invalidation the archiving call sites do.
What landed keeps those calls and points them at `invalidateArchiveQueries`, the function that
already invalidates both trees.

The concern behind the proposal was duplicated knowledge of *which caches an action affects*. That
knowledge already lives in one function; a call site only calls it, so there is nothing duplicated to
remove. Removing the calls would instead make the acting user's own screen depend on a message the
design deliberately makes droppable — a failed publish would leave the person who archived the job
looking at a list that does not contain it. The notification now covers the sessions that did not
act, and server-initiated changes, which is what it is good for.

The defect the section describes is fixed either way: both archiving paths invalidated statistics
only, so the archive list kept a page without the job just archived into it.
`invalidateStatisticsQueries` had no caller left afterwards and is gone.

##### Where the client shows it

**Above the tabs, as one statement for the page.** A rebuild moves every figure the page holds, so a
marker beside one of them would be both wrong and repeated nine times; the notice sits over all three
tabs and no panel carries a stale state of its own. Running reads as information, failed as a
warning — the difference matters to the reader, because one resolves itself and the other will not.

The state comes back on `useArchiveTimeline` rather than through a hook of its own, and the notice
takes the page's window so it reads the response the panels are already reading. Every statistics
response carries the state, so a window of its own would be a request for a field it can have for
nothing. A state this side has no wording for renders nothing: a value the server gains before
the SPA knows it should be silent, not an empty alert.

#### Chosen values

Set here so they are decided once rather than at each call site, and so a later change is a change to
this table rather than an archaeology exercise.

| Value | Setting | Reasoning |
|-------|---------|-----------|
| Dispatch cron | `*/2 * * * *` | A tick that fails to publish costs two minutes rather than an hour |
| Debounce window | 5 minutes | The longest an owner waits, and the shortest gap between two of its rebuilds |
| Reconciliation rota | every owner once per 24 hours, oldest stamp first, 50 owners a tick on a `*/15` cron | Routine enough to catch a delta bug; the cap spreads a first run, where every owner is due at once |
| Retry ceiling | asynq's default `MaxRetry` | Statistics do not need a second retry policy beside the one every other task uses |
| Float tolerance | 1e-9 relative, 0.0001 ISK absolute near zero | Tight enough that only float residue passes; counts still compare exactly and are the primary drift signal |
| Delta task priority | `priority_3` | User-facing freshness, small unit of work |
| Reconcile / rebuild priority | `priority_5` | Bulk, nothing waits on them |

#### What this stage does not change

- The reduction rules. What a job contributes is unchanged; only how often it is recomputed and how
  much is recomputed with it.
- Corporation scope itself, which stays with Stage C. Stage J makes its surfaces owner-shaped; it
  does not add the corporation kind, decide what scopes a job to a corporation, or rename the
  `account_*` collections.
- The restore sequence, whose ordering and lock gate are Stage G's and are untouched beyond the
  delta and the min/max repair.

### Stage K — Filing a job's figures by hand

A job's months are derived from what it carries: costs from the earliest linked ESI job, then the
earliest sale, then the archive date; sales from each transaction's own date. Derivation is right
whenever the job holds evidence, and guesses when it does not — a build with no linked job and no
sale is filed wherever it happened to be archived, and a job restored months later moves.

So the user gets to say, and the rule is **evidence wins where evidence exists**.

| Side | Default | May the user move it |
|------|---------|----------------------|
| Outgoing (what it cost) | earliest linked ESI job, then earliest sale, then the archive date | **Yes**, always: a cost carries no timestamp of its own |
| Incoming (what it sold for) | each transaction's own date | **Only** when no line came from the market |

A market transaction is one ESI recorded, and the archive can already tell: a hand-entered sale is
minted with a **negative** `transaction_id`, so `transaction_id > 0` is the market and needs no new
flag. A job with even one market line has its incoming side locked — the money arrived when it
arrived, and letting that be moved would make the figures disagree with the wallet they came from.
Broker fees follow the same rule for the same reason.

**The override lives on the job, never on the statistics row.** The row is derived output: every
rebuild recomputes it, so anything stored there is overwritten on the next pass. On the job it is
*input* to the reduction, which makes the whole feature rebuild-safe for free — the rebuild derives
the same answer every time, the reconcile finds no drift, and a restore carries the choice back with
the job so a re-archive files it the same way.

**Changing a month queues the ordinary rebuild.** A delta can add a row's figures or take them back;
it cannot move them between buckets, because a job has one row and the two halves would have to
happen at once. The wholesale rebuild already rewrites an owner's aggregates from its rows, so
filing queues one and the debounce carries it — no new mechanism, and nothing to fall out of step.

**The page is written to React 19 throughout.** Async work is an action rather than a flag someone
maintains: the filing dialogue submits through `useActionState` with the shell's `formProps`, its Save
button reads `useFormStatus`, and restore runs inside `useTransition`, so the rows stay disabled for
as long as the write and the refresh it triggers are in flight. Item names come from a query rather
than an effect that fetched and set state, which also means every panel shares one read of the static
list instead of one each. Nothing on the page uses `forwardRef`, `useContext` or an effect.

**A filed job says so.** A month that disagrees with the job's own evidence reads as a bug to the
next person to look. The row carries the fact and the archive list marks it, beside the stale and
pending marks it already has — behind them, because those two are about whether the figures are
current while this one is only about where they sit.

##### What landed

`PATCH /api/v1/archived-jobs/{jobID}/filing` takes `costMonth` and `salesMonth` as `YYYY-MM`. A
field omitted is left alone, `null` returns that side to what the reduction derives, and a month that
has not happened is refused. Filing a market job's income answers **409** rather than ignoring the
field. The job document gains `filedCostMonth` and `filedSalesMonth`; `costMonthFor` and the two line
builders read them, and the row records `monthsFiled` so the list can mark it.

**The dialogue is the shared shell, and the months are picked.** `ContentDialogue` carries the title,
helper copy, error boundary and actions, with `DialogueCloseAction` and `useDialogueCloseReset` for
closing — the same pieces every other dialogue uses. Months come from `@mui/x-date-pickers` in
year-month views rather than a typed `YYYY-MM`, so there is no format to explain, nothing to parse
and nothing to sanitise. A picker has no empty state to choose, so each field carries its own Clear:
clearing is what asks the archive to derive the month again, and without it a filing could not be
undone.

**Both fields open on where the figures count today**, which is why the archive list carries
`costMonth` and `salesMonth` beside the row. A blank field would read as "no month", which is a
different request from leaving a side alone — and a reader cannot judge a change they cannot see the
starting point of. The income month is the earliest of the sale lines, since filing moves them
together. The fields sit on app-shell inset surfaces with the shell's own outlined text-field style,
so the dialogue matches the panels behind it.

**A set is filed as a set.** The same three ways restore names jobs — one job, a group, a related set
— now name a filing, through the same `selectArchivedJobs`; the name says what it does rather than
who calls it. A group's members share a filing because they were archived as one, and the block's own
row carries the control, so correcting twenty jobs is one action rather than twenty.

What the market rule does then depends on how the caller named the jobs. **Naming one job and being
refused is an answer; refusing a whole group because one member sold on the market would make bulk
filing useless.** So a single job answers 409, and a set files what it can and reports
`salesLockedByMarket`, which the client says out loud: "3 sales came from the market and stayed where
they were." Costs move for every member either way, because no member's costs are evidence of
anything.

**The market rule is enforced twice, and the second time is not redundant.** The endpoint refuses to
store a filed income month for a job the market recorded; the reduction ignores one it finds anyway.
The case that needs the second is a job filed while its sales were hand-entered, which later has an
ESI transaction linked to it — the stored filing is then no longer the user's to apply, and only the
reduction is in a position to notice. A mutation test found this guard untested before it was.

## Owner block — owed to shared planners

[shared-planners](../shared-planners/plan.md) makes the planner an explicit thing a user works in, and
replaces the per-scope fields on stored documents with a single owner. Four items land **here**,
because they are cheap only while this project is still open and touching live data. The shapes below
are settled; the reasoning for each lives in that plan.

| Item | Status |
|------|--------|
| 1. `ArchivedJobStats` takes an owner | **Done, and since extended to every scoped document.** The three statistics documents were owner-keyed first — `AccountID` and `CorpRef` off the row, `models.StatsOwner` became `models.Owner`, the ids lead with the owner key, the row gained `ArchivedBy` and `SchemaVersion`, and the dead `Version` field went. The owner then moved into `_meta` on all of them, so a statistics document and a job document now carry ownership in the same place. See § The owner block landed as one cutover |
| 2. Collection and document-id renames | **Done.** Every collection carries the name it holds rather than who owns it, and the three statistics document ids lead with the owner key. The renames ship as `CollectionRenames` version 1 in the Deployment Tool — ten entries, one per collection live holds and still needs; `build_stats` is left behind because the recalculation reproduces it into `statistics_totals` |
| 3. Route and query key take an owner | **Done.** The route is `/api/v1/statistics/{owner}/{view}` with the owner as a handle, and every statistics query key carries the owner under the shared root |
| 4. Stage C's ownership inference is dropped | **Done.** `corpinference`, the per-line corporation fields and the lane on the corporation bucket are gone; nothing in `services/` or the SPA infers a scope |

Nothing in [shared-planners](../shared-planners/plan.md) blocks items 1 or 2 — the dependency runs the
other way. Item 1 includes the `StatsOwner` → `Owner` rename, because fifteen of the sixteen non-test
files referencing that type are this project's own code and it is already opening them; and
`ArchivedJobStats` carries flat fields rather than embedding `MetaData`, so it does not wait on that
split. Shared-planners Stage A **consumes** `models.Owner` and starts after item 1 lands.

Item 2's *code* is likewise this project's to write, and its deployment turned out not to be coupled
to shared-planners after all. Live holds no statistics collections, so the three entries that would
have renamed them had a source that exists nowhere and were dropped: what live owes is ten renames
over the collections it does hold, none of which the owner backfill touches. The entries are therefore
version 1 on their own rather than sharing a version with that plan's Stage B.

### 1. `ArchivedJobStats` takes an owner

`AccountID` and `CorpRef` collapse into one embedded owner. The row also gains `ArchivedBy`, the
account that archived the job, so per-member contribution inside a shared planner is answerable
without writing a second archive.

The row has no schema version today, and its existing `Version` field is **dead**: no code reads or
writes it, and all 10,338 rows on dev hold the zero value it has always been written with. It is
**deleted** in the same change rather than renamed — renaming it would carry the dead weight forward
under a better name.

**The row is schema versioned.** `SchemaVersion`, an `ArchivedJobStatsSchemaCurrent` constant and an
upgrader entry land together, the same three parts every other persisted model carries. Being derived
is not a reason to skip it: a rebuild only reaches rows whose owner is queued, so a row can sit at an
older shape indefinitely, and a reader that cannot tell which shape it holds has to infer it from
which fields are present — exactly the guessing the version exists to remove.

The upgrader is what makes every read correct from the moment the code ships: it fills `Owner` from
`AccountID` when the owner is absent, in memory, idempotently, so a stored row written before the
backfill still answers as an owner-shaped one.

The collection does **not** join `SchemaMaintainedCollections()`. That list drives the maintenance
batch that rewrites documents a user owns; a statistics row is derived, so the way to bring one to
the current shape on disk is the rebuild that already exists.

#### The indexes are keyed from the queries, not from the document

Owner-keying the documents was not enough to make the indexes right: the first set carried fields
the code never filters on, and missed the ones it does. What they are now, and why:

| Collection | Keys | Why |
|------------|------|-----|
| `statistics_rows` | `owner.kind`, `owner.id`, `revoked`, `contributedAt` | The delta fold's two reads — the rows not yet counted, and the revoked rows still counted — are the owner's rows narrowed by exactly these |
| `statistics_rows` | `owner.kind`, `owner.id`, `typeID`, `revoked` | Rebuilding one item type reads that type's live rows |
| `statistics_timeline` | `owner.kind`, `owner.id`, `isProductionChain`, `typeID` | The timeline excludes production-chain buckets unless asked for them |
| `statistics_timeline` | `owner.kind`, `owner.id`, `typeID` | The same views with the chain included |
| `statistics_totals` | `owner.kind`, `owner.id`, `typeID` | The lifetime totals read, whole-owner and single-type, and the `typeID` ordering it returns in |

Three fields came **off** the earlier specs. `year` and `month` cannot serve the timeline's range: it
is bound on a month ordinal computed in an `$addFields` stage, which no index reaches, so the tail was
carried and never used. `archivedAt` and `isProductionChain` are filtered on the month buckets and set
on the rows, never filtered on a row. `contributedAt` went on because it is what the fold actually
selects by and no index held it.

**An index a query uses is not the same as an index that fits it.** Mongo will take an index for its
leading prefix and scan everything after it as a residual filter, so `explain` naming an index proves
nothing on its own; the tell is a `SORT` stage in the winning plan, or `totalDocsExamined` far above
`nReturned`. Each spec above was confirmed by creating it, re-running `explain`, and checking it won
its query before it was written down.

**Ensure only ever adds an index, so a reshaped one has to be retired by name.** A replacement with
different keys under a different name conflicts with nothing, and both would survive — the old one
maintained on every write and chosen by no query. `RetiredIndexes` in the Deployment Tool names them,
runs before the specs are created, and treats an index already gone as done.

### The names followed the keying

Once the documents were keyed by owner, everything named for the account was describing the old model.
`LoadAccountProductionTotals(owner)` reads as though an account is still the unit; a reader has to
check the signature to find out otherwise.

So the prefix came off wherever the thing genuinely takes or returns an owner:
`models.AccountTimelineMonthBucket` is `TimelineMonthBucket`, the seven Mongo reads and prunes lost
their `Account`, `AccountBuckets` is `TimelineBuckets`, `AccountBuildHistory` is `BuildHistory`,
`RebuildAccountStatistics` is `RebuildStatistics`, and the two files behind those are named for what
they hold rather than for the scope they used to have.

Two names that were wrong before the owner existed were fixed with them. `BuildAccountSnapshot` did
not build a snapshot — it reduced a job to a row *given* one — and is `RowFromSnapshot`; `NewAccountRow`
is `NewRow`, and each now says how it differs from the other.

**What kept its name.** `ArchivedJobAccountFilter` filters job documents on `_meta.accountID`, which is
still what they carry, and the user-document reads are account-scoped in fact. Renaming those would
have made the code less true, not more consistent.

**`DrainAccountStatsRebuildQueue` was renamed, in the window it was waiting for.** Its Go symbol was
paired with a wire task name and a subject, so renaming one alone would desync them — which is why it
was parked for a downtime with no message in flight. It is now `dispatchStatisticsRebuilds`, pairing
with `dispatchStatisticsReconciles`: the two do the same job for the two kinds of work, and the task
dispatches rather than drains — it publishes one task per owner and performs no rebuild itself.

Six surfaces moved together, which is the reason it could not be done piecemeal: the Go symbol, the
task name, the NATS subject, the publisher, the cron id, and the command an operator types.

**Two documents were dead and are gone.** `CorpProductionTotalsRow` and `CorpTimelineMonthBucket` were
parallel corporation shapes from the design the owner replaced. Nothing outside their own definitions
and tests referred to either: an owner-keyed document already covers a corporation.

### Extras categories name themselves

An archived row recorded what a job's extras cost **per category id** and nothing else. The name was
resolved when a chart was drawn, from `state.applicationSettings.extrasCategories` — the viewer's own
current settings — falling back to `Category {id}`.

That is a live defect before shared planners exist. On dev, 172 archived rows are keyed to category
`90`, *Retired Courier Contract*, which has been deleted: those rows draw as **"Category 90"**, and
the extras panel reports them as *Unassigned*, which is a different category rather than a missing
name. Under a shared planner it is worse in a different way — a member has none of another member's
categories, so a legend reads back a raw UUID.

So the row stores the name beside the money:

```go
type ArchivedExtraCategory struct {
	ID     string  `bson:"id"`
	Label  string  `bson:"label,omitempty"`
	Amount float64 `bson:"amount"`
}
```

`ExtraCategoryTotals` becomes `ExtraCategories`, and the schema version goes to **2**. Nothing
converts on read: the release moves every document to the new shape while the app is down, so the
code only ever meets one shape. See § 0.9.0 converts rather than tolerates.

**Where the name comes from matters.** A row is derived from its job and nothing else — that is what
lets it be written wherever the job is archived, and every incremental path rests on it. Reading the
account's settings to name a category would break it. So the name travels on the job instead:
`models.ExtraCost` gains `CategoryLabel`, written by the SPA when the cost is added, and the archived
row copies it. That also fixes the live job: the extras panel now prefers the stored name and only
consults settings for a row that predates it.

**Wire compatibility:** additive both ways. `categoryLabel` is omitted rather than written empty, so a
row without one is the document it already was.

**The names are recoverable, and only here.** A settings list keeps a deleted category rather than
dropping it, so `tasks prepareRelease` reads each account's list and stamps the name onto every extra
its jobs hold, before the rebuild that derives the rows from them. Measured against dev: 659 extras
across 12 accounts, none unnamed, including the 65 that recover *Retired Courier Contract*.

**The names reach the charts.** A bucket carries `extraCategoryLabels` beside its totals, filled by the
fold from the rows and by the delta as a `$set` rather than an `$inc` — a name is not a quantity, so a
removal takes back money and leaves the name. Neither map can be `$summed`, so the aggregation pushes
and folds both, and `SalesMeasures.Plus` is where one id keeps one name: there is no rename, so
whichever side names a category is right and the first stands.

`toExtrasRows` and `toExtrasTotalRows` read the names off the response and no longer take a category
list, so neither extras panel reads `applicationSettings`. A category with no stored name still falls
back to its id, which is what every reader had before.

### 0.9.0 converts rather than tolerates

A shape change has two ways to reach stored documents: teach the code to read both and convert on
read, or move every document to the new shape in one pass and have the code read only the new one.
**0.9.0 takes the second**, and accepts a downtime window to do it.

What that buys is the absence of a whole category of code — no dual-read branch, no field kept only so
an old document still decodes, no expand-then-contract sequence spread over releases, and no question
of which shape a given document is in. `SchemaVersion` stays, because it is what the script *selects*
unmigrated documents by rather than guessing from field presence.

It also buys correctness the read path cannot reach. A statistics row is derived from its job alone —
the rule that lets it be written wherever the job is archived — so a derivation can never consult a
settings document. A release step runs per account and can, which is the only reason the extras names
above are recoverable at all.

**What it costs is rollback.** Once documents are converted, the previous release cannot read them.
The window is therefore: stop the app, back up, run `tasks prepareRelease`, deploy. Going back means
restoring the backup, not redeploying.

**Derived collections are not converted at all.** The three statistics collections are reproduced
whole by a rebuild, and the release already queues every owner for one, so they are dropped and rebuilt
rather than migrated — which is also what makes the document-id change free.

### Sequencing item 1: expand now, contract with the backfill

The stored shape changes, so the order matters and is worth stating before any of it is written:

It landed as one change rather than the expand-then-contract sequence first planned, because 0.9.0
converts during downtime — see § 0.9.0 converts rather than tolerates. There is no window in which an
old-shaped document meets new code, so nothing needed a dual read.

The three statistics collections are not converted at all, because they are **derived**: every row,
bucket and total is reproduced whole from the archived jobs, and the release already queues every
owner for a rebuild. Converting them would be work the rebuild overwrites minutes later.

That an `_id` is immutable is a supporting cost, not the reason. Mongo refuses an update to `_id`
outright, so a conversion would be an insert and a delete for each of 22,064 documents rather than a
`$set` — which makes an unnecessary job an expensive one. Regenerable is why they are regenerated;
unmodifiable is only why converting them would have been worse.

**They are copied, and nothing is deleted.** The release copies each collection to
`{name}_pre_0_9_0` with `$out` — server-side, documents unchanged, ids included — and stops there. The
rebuild writes the new owner-keyed documents alongside the old ones, which an operator removes by hand
once the figures have been checked.

The old documents are inert in the meantime: every query filters on the owner, and a document written
before this release has none, so nothing reads them. That is a property to keep rather than assume —
`timelineRangeFilter` and `StatisticsOwners` both named `accountID` after the models had moved on, and
neither would have failed. A filter that matches nothing returns an empty result, which is a valid
answer to "what has this owner archived", so the rota would have quietly stopped reconciling and every
timeline would have read empty. Both now name the owner, and a test pins the field names.

Re-running is safe: a collection whose copy already holds documents has been through the step and is
left alone, so a second run cannot overwrite a copy. A short copy is an error rather than a warning —
it is the one outcome that would leave an operator believing there is a complete copy to fall back on.

**The distinction matters for what follows.** Item 2's renames and the `_meta.owner` backfill touch
`accounts`, `account_settings`, `account_archived_jobs` and the rest — user data, which nothing
regenerates. Those get a real migration, and there the `_id` constraint is a design input rather than
a footnote.

One thing does still read an account: a job document names `_meta.accountID`, not an owner, so the two
walks over the archive translate — an account owner reads its jobs, and any other kind is refused
rather than matching nothing. That becomes `_meta.owner` in shared-planners Stage A.

**Wire compatibility:** additive on the way in. The row's JSON is served to no client — every field
on it is `json:"-"` or reached through a response type — so the added fields cross no public surface,
and `Owner` deliberately carries no JSON tags at all.

```go
type Owner struct {
	Kind OwnerKind `bson:"kind"`
	ID   string    `bson:"id"`
}
```

`Owner` carries **no JSON tags**. For the corporation and alliance kinds its `ID` is a ref, so a
response serialising it directly would leak one; every response builds an owner handle explicitly
instead. Note what that does and does not buy: an untagged struct still marshals, under Go field
names, so an owner reaching a response emits conspicuous `"Kind"` / `"ID"` keys rather than failing
to compile. What actually keeps a ref off the wire is the `json:"-"` on every field that holds an
owner, which is why those tags are asserted rather than trusted.

`models.StatsOwner` is renamed `models.Owner` — it stops being a statistics concept once it is on
every document. `Key()`, `ParseOwnerKey`, `Validate` and `IsZero` carry over unchanged, and the
`account` kind resolves to exactly the key this project already uses.

### 2. Collection and document-id renames

The renames this plan parked as "the expensive part of a scope change" happen, because every kind
shares one collection under the owner model.

They were planned to ride with the owner backfill, on the reasoning that the whole cost of a rename is
touching live data. That turned out not to apply: a same-database `renameCollection` is a metadata
operation that does not touch a document, so a rename costs a moment's exclusive lock rather than a
pass over the data, and there is nothing to share a window with.

Names are chosen per collection rather than by swapping one prefix for another: `account_archived_jobs`
becomes `archived_jobs`, `account_archived_job_stats` becomes `statistics_rows`, and so on. The
owner block on the document states ownership, so a name that also encodes it says the same thing
twice. Document ids take the owner key in place of the account id —
`ArchivedJobStatsDocumentID` becomes `{ownerKey}|{jobID}`.

**Live owes ten renames, not fourteen.** It holds no statistics collections at all, so the entries for
those had a source that exists nowhere; carrying them would have described a migration no database
performs. What ships is one entry per collection live actually holds **and still needs**:

| From | To |
|------|----|
| `users` | `accounts` |
| `application_settings` | `account_settings` |
| `archivedJobs` | `archived_jobs` |
| `user_job_documents` | `job_documents` |
| `user_job_groups` | `job_groups` |
| `user_group_template_catalog` | `group_template_catalog` |
| `user_group_template_payloads` | `group_template_payloads` |
| `user_watchlist_deprecated` | `watchlist_deprecated` |
| `blueprints` | `shared_blueprints` |
| `citadel_names` | `shared_citadel_names` |

`statistics_rows`, `statistics_timeline`, `statistics_totals`, `statistics_rebuild_queue` and
`statistics_reconcile_rota` are created under their final names by the code that writes them, so
live's first population is already correct.

**These five were renamed to the statistics vocabulary the API and SPA already use** — the route is
`/api/v1/statistics/{owner}/{view}`, its views are `timeline` and `totals`, and the code calls the
per-job figures *rows* throughout. `archived_job_stats` said what it was derived from while
`production_totals` said what it held, which is two conventions for one subsystem. The rename cost
nothing but a constant: live has never held any of them, so there is no `CollectionRenames` entry
and no migration step — a freedom that ends the moment live holds them.

`build_stats` is the one collection live holds that is **not** renamed forward. Its documents are
derived, and the recalculation reproduces every one of them into `statistics_totals` under the new
shape — a rename would carry rows that the rebuild is about to replace, and that no query can match
anyway once every filter leads with the owner. It is left in place for an operator to drop, the same
treatment the other pre-release statistics collections get.

The rename path was proven by putting dev back to live's exact names and running `eip ensure-mongo`
once: every entry fired and every count came back identical. Ensure applies renames **before** the two
steps that create a collection when its name is absent — preimages and indexes — because either
running first would leave the rename facing a name that now exists at both ends, which it refuses.

### 3. The statistics route and query key take an owner

`/api/v1/statistics/account/…` was about to become a live public surface with one scope hardcoded in
its path. Parameterising it by owner handle **now**, while the account is the only accepted value, is
additive; changing it later is breaking. The same applies to `STATISTICS_QUERY_KEY_ROOT`: without the
owner in the key, two planners share one cache entry the first time a shared planner exists.

**Landed.** The three views are `/api/v1/statistics/{owner}/{view}`, where the owner is a handle —
`account:{id}` today. The router parses it and rejects one it cannot read as a 404; each handler then
compares it with the session and answers **403** for an owner the session does not hold, which is
what stops a caller reading another account by editing one segment. A kind that is routable but not
served yet — `corporation:`, `planner:` — is refused there rather than falling through to the
caller's own account.

The check lives in the handler rather than the router because it compares the path against the
session the auth middleware resolved: a router that rejected it would answer 403 where these routes
answer 401. When a shared planner exists, that equality becomes a grant lookup and nothing else about
the shape changes.

On the SPA, `statisticsOwner.js` owns the handle: it builds the path and the key prefix from the same
value, so the two cannot disagree about whose figures are being read. `statisticsQueryScope()`
returns `["backend", "statistics", "{owner}"]`, which every statistics key now extends — invalidation
still targets the root above the owner, so archiving still clears every view.

### 4. Stage C's ownership inference is dropped

Stage C is blocked on nothing deciding, from the corporation and character ids the SPA records, that a
job is corporation scoped. Under the owner model that decision does not exist: **a job's owner is the
planner it was created in**, written once at creation and never inferred from a correlated field. The
half-built inference producer is not finished — it is removed from scope. The ids the SPA records stay
useful for linking ESI jobs; they are not evidence of ownership.

### Sequencing

Items 1 and 2 are one change to live data and ship together, and Stage J widened what they touch: the
statistics row is now written by `api/v1endpoints/archivedjobs` as well as the worker, so
`ArchivedJobStatsDocumentID` and the row's field names have call sites in two services plus the live
tests rather than one worker package. Item 3 is additive and can land any time before the route
reaches `Public`. Item 4 is a reduction in scope.

**Neither 1 nor 2 waits on anything.** Both are this project's code: sixteen files reference
`StatsOwner` and only `testing/mongolive` is not ours, and `ArchivedJobStats` carries flat fields
rather than embedding `MetaData`, so it is untouched by the metadata split shared-planners Stage A
performs. That stage **consumes** `models.Owner` and therefore starts after item 1 lands.

The renames' **deployment** was expected to be coupled to shared-planners' own, sharing one
`CollectionRenames` version in that plan's Stage B window. It is not: live holds none of the
statistics collections, so the renames it owes are over collections the owner backfill never touches,
and they ship as version 1 by themselves. `CollectionRenames` is version-gated — a database skips
every entry at or below the version it records — so an entry added to a version already applied would
never run; a later batch takes the next version. The wider owner migration,
and the task that performs it, belong to [shared-planners](../shared-planners/plan.md) § Stage A,
which is now a single cutover inside the deployment window rather than a gradual switch.

## The owner block landed as one cutover

Item 1 owner-keyed the three statistics documents. The rest of the database still said ownership a
different way — `_meta.accountID` on every scoped document, with `_meta.corporationRef` and
`_meta.allianceRef` beside it — so the same fact had two vocabularies and the statistics collections
were the odd ones out. This closed that, following
[shared-planners](../shared-planners/plan.md) § Stage A, whose design this implements.

**One vocabulary.** `models.Owner` is the only way ownership is stated. The parallel tenant-key surface
in `shared/wsplacement` — `TenantPrefixAccount`, `TenantKeyAccount/Corporation/Alliance`,
`TenantStringFromRouting` — is deleted rather than wrapped, because `Owner.Key()` already produced a
byte-identical string. What was worth keeping from it is the *validation*, and that moved onto
construction: `CorporationOwner` and `AllianceOwner` refuse a raw EVE id, so a caller that has not
converted fails visibly instead of routing on something that addresses nothing.
`nats.AccountIDFromTenantString` was a second `ParseOwnerKey` and went the same way.

**One place on the document.** `MetaData` carries `Owner` and no longer carries `AccountID`,
`CorporationRef` or `AllianceRef`. The three statistics models embed `MetaData` rather than holding a
root `Owner`, so every scoped document — stored or derived — states ownership at `_meta.owner`. That is
what lets one pair of field-path constants cover the whole database.

**`MetaData` gains no schema version.** Every persisted model already carries `schemaVersion` at the
document root, and the maintenance batch selects on the root field; a second one inside `_meta` would be
two sources for one fact and would silently not drive the rotation.

**The owner does not go on the wire.** `Owner` carries `json:"-"`. The evidence supported deletion
rather than migration: the SPA read `_meta.accountID` in one place, nothing downstream read it back, and
the server overwrote whatever a client uploaded while taking real identity from the `X-Session-ID` and
`X-WS-Client-ID` headers. So the SPA change was to stop reading it. Nothing about an owner — and so no
corporation or alliance ref — can reach a client through `_meta`.

### The failure this shape is built against

A filter naming the wrong field path matches nothing and reports no error, and the compiler cannot see
it, because these are string keys in a `bson.M`. Converting the queries proved it: the build stayed
green with around twenty-five sites still filtering the field that had been removed, including the
websocket subscribe authorisation. Two guards exist because of it:

- `FieldMetaOwnerKind` and `FieldMetaOwnerID` in `shared/mongo` are the only spelling of those paths.
- A test scans every non-test file in the module for the retired paths and fails on one, with an
  allowlist naming the two migration commands that legitimately read the pre-stamp shape.

### One way to write `_meta`

`_meta` holds server-owned facts, and three writers used to `$set` it wholesale from a marshalled
struct while the rest patched named fields. Having both is what made a stamped owner erasable by an
ordinary save. All writers now patch named fields, so the class of bug is closed rather than the
instance: `owner` is written on insert, the session and client fields per write, and the archive
lifecycle fields by the path that owns them.

The two upsert contracts are opposites and must not drift into each other, so both are pinned by tests.
A derived document's writer owns its `_meta` outright and writes it on every upsert — putting it on
insert only would let a rebuild write an owner once and never correct it, and a row whose owner is
wrong matches no query and reports no error.

### The indexes moved with the queries

Every spec that led with the retired field now leads with `_meta.owner.kind` and `_meta.owner.id`,
keeping its trailing keys, renamed from `meta_accountID` to `meta_owner`. Thirteen specs across
`accounts`, `account_settings`, `job_groups`, `watchlist_deprecated`, `job_documents` and
`archived_jobs` moved; the statistics specs had already been converted with item 1.

All thirteen predecessors are named in `RetiredIndexes`. This is not tidiness: Ensure only ever creates,
and a reshaped index under a new name conflicts with nothing, so both would survive — a full second set
of indexes on a field no document carries, maintained on every write and chosen by no query. Ensure
reports creating an index on an absent field exactly as it reports one that works, so nothing else would
have said.

**Checked with `explain`, and all seven win their query.** Run against dev's 9,336 job documents, using
the filters the callers actually build rather than invented ones:

| Spec | Query | Plan |
|------|-------|------|
| `ajd_meta_owner_displayOnPlanner_1` | the planner read in `jobdocuments/getHandlers.go` | `IXSCAN`, 10 examined for 10 returned |
| `ajd_meta_owner_groupID_1` | the by-group read | `IXSCAN` |
| `ajd_meta_owner_marketOrders_order_id_1` | `esilinks.go`, one kind each | `IXSCAN` |
| `ajd_meta_owner_linkedJobs_job_id_1` | the same | `IXSCAN` |
| `ajd_meta_owner_transactions_transaction_id_1` | the same | `IXSCAN` |
| `ajd_linkedJobs_corporation_id_1` | the corporation-id lookup | `IXSCAN` |
| `ajd_protected_spec_1` | `jobidentity`'s `$ne` scan for unconverted jobs | `IXSCAN`, 9,336 examined for 9,336 returned — a migration scan meant to find every job |

No spec examines more than it returns, which is what the check was for: an index that has stopped
winning its query still returns the right answer, just slowly, and reports nothing.

**The check found something it was not looking for: `jobs` is not a built collection.** It is named in
`knownCollections` and in [shared-planners](../shared-planners/plan.md) § Collection layout, which
splits a job's record from its body — but no environment holds it, nothing writes one, and every job
lives in `job_documents`. That is why it has no index specs: there is nothing to index yet.

The one caller reading it was the websocket planner sync, which returned nothing and reported nothing;
it now reads `job_documents` alongside the HTTP planner handler. The split, the collection and its
index specs are shared-planners' to build, and that plan records what they owe.

**Four predecessors survived the first pass, and are now retired.** Retirement matches an index by exact
name, and an index keeps its name through a `renameCollection` — so on the three collections renamed from
`user_*`, the predecessors were still spelled `ujg_`, `uwd_` and `ujd_` while the entries retiring them
had been written with the post-rename `a` prefix. `job_groups`, `watchlist_deprecated` and
`job_documents` each carried an index on a field no document holds, maintained on every write and chosen
by no query — the exact outcome `RetiredIndexes` exists to prevent, hidden because Ensure reported the
replacements as created and said nothing about what it had not dropped. Both spellings are now listed.

**A query hint had drifted the same way, and was failing every run.** The `accounts` maintenance queries
hint an index by name, and the hint still said `users_meta_lastLoginAt_1` while `IndexSpecs` creates
`accounts_meta_lastLoginAt_1` — the `users` → `accounts` rename moved the spec and left the caller. A
hint Mongo cannot resolve fails the query with `BadValue` rather than falling back to a scan, so
`cloud esi refresh maintenance` errored on every scheduled run. The constant now matches the spec, and
the name is pinned from both modules so the pair cannot drift again. Found while checking service logs
after a rebuild, not by a test — which is why the pinning tests exist now. Behaviour →
[overlay.md](./overlay.md) § The indexes.

### What is not done

~~`ChangeStreamMessage` still carries `AccountID`, `CorporationRef` and `AllianceRef`.~~ **Done.** The
message carries one `ownerKey`, and the second vocabulary is gone from the last type holding it.
Behaviour → [overlay.md](./overlay.md) § How a change reaches the right clients.

**The deprecated watchlist was missed by the cutover, and has since been brought in.** It was absent from
`metaOwnerCollections`, so the stamp never reached it, while its index spec and its retired predecessor
had both been written as though it had been converted — an owner index over documents that carried no
owner. `websocket/sync` already filtered it on `_meta.owner`, so a resync of a watchlist matched nothing
and reported no error. Its writer replaces the whole document, so the fix is in the writer rather than
only in the release: `UpsertWatchlistDeprecated` builds the owner, `LoadWatchlistDeprecated` filters on it
the way every other singleton read does, and the collection is stamped by `prepareRelease`. Behaviour →
[overlay.md](./overlay.md) § How `_meta` is written.

The lesson generalises past this one collection: a deprecated surface is exempt from new features, not
from a change of shape. The test is whether anything still **reads** it.

Wire compatibility: **migrate-required**, under the same `_meta` owner block row as every other scoped
collection — the document gains an owner and the reads filter on it, so the stamp and the images deploy
in one window. **Not** client-facing: the GET handler projects `groups` and `items` and never returns
`_meta`, and the realtime routing key is derived from the owner rather than from the retired field, so
nothing on the wire changes shape. `_meta.accountID` is left on the document for an operator to remove,
as everywhere else.

**Settled: the dry run names the stamp rather than reporting zero.** The problem was narrower than
written here. Of the eight steps, three do not filter on the owner at all, the schema-maintenance and
owner-stamp steps read the pre-stamp shape correctly, and the statistics copy counts without an owner
filter — so "reports zero work for every owner-filtered step" overstated it. Two steps were affected,
and the rebuild queue already refused rather than reporting zero: it errors with "the owner stamp has
not run" when an empty owner list meets archived jobs that are present.

That left the extras-label step as the one place a dry run reported `would stamp 0` while real work was
owed, and it now takes the same guard and the same wording. Stopping the dry run after the first
required step was rejected: it would discard the honest reports from five steps and the existing hard
guard to fix one misleading line.

The contract is now consistent — **every owner-filtered step either reports real work or names the
stamp as the reason its filter matched nothing.** Behaviour → [overlay.md](./overlay.md) § The dry run
tells an unstamped database from an idle one.

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

Re-run for the owner block, against its touch surface (`shared/models/…`, `shared/mongo/…`,
`shared/wsplacement/…`, `core/changestream/…`, `core/commands/…`, `shared/nats/…`, and
`deployment-tool/internal/dataplane/mongo/…`). One suggestion was reported and landed with the work:
a composite literal in `shared/mongo` setting an embedded struct's fields through the promoted names,
which Go 1.27 allows. Nothing else in either module's scope needs modernization.

Re-run for Stage J, against its touch surface (`shared/archivestats/…`, `shared/mongo/…`,
`shared/models/…`, `core/scheduler/archivedjobs/…`, `worker/tasks/archivedjobs/…`,
`api/v1endpoints/statistics/…`, `api/v1endpoints/archivedjobs/…`). **No suggestions** in any of
them. One is reported in `api/helper/sso/jwt.go` — an `interface{}` that becomes `any` — but that
package is a dependency of the scan rather than part of Stage J's surface, so it is left for
whichever work touches SSO next rather than widened into this stage.

Re-run for the watchlist and dry-run work, against its touch surface (`shared/mongo/…`,
`core/commands/…`, `core/changestream/…`, and `deployment-tool/internal/dataplane/mongo/…`). One
suggestion, in `core/changestream/resume.go`: `errors.As` with a declared variable becomes
`errors.AsType[mongo.CommandError]`. [shared-planners](../shared-planners/plan.md) § Go modernisation
in scope had it listed against a stage that has not started; the routing-log fix put the package in
this work's surface, so it landed here rather than waiting. Nothing else in either module's scope.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — data model and Mongo layer | Complete for the account scope — entity refs on job documents, statistics models, Mongo layer and index specs landed. Corp scope held for C; partial indexes land with D |
| B — account statistics pipeline | **Complete** — transformation, worker rebuild, queue drain, its task and asynq handler, its schedule, and the archived-jobs producer are all landed. Queue → publish → drain runs end to end, and the claim protocol, revoke, prune and write-then-remove ordering are pinned by passing live tests. The worker's end-to-end composition of those helpers has no live test yet (see Open questions) |
| C — corporation statistics pipeline | **Superseded in part** — its ownership question is answered by [shared-planners](../shared-planners/plan.md): a job's owner is the planner it was created in, so the half-built inference producer that would decide corporation scope from recorded ids is dropped. What remains of C is aggregation over a non-account owner, which the owner block makes additive. See § Owner block — owed to shared planners |
| D — statistics API | **Complete for the account scope** — timeline, timeline/items and totals land under `/api/v1/statistics/account/`, with the indexes their filters need. Months carry the six components of a period's cost and its extras by category; `totals?summary=1` folds the archive into one row. The old build-stats producer is retired and its documents are rebuilt by the statistics pipeline. Corporation views wait for Stage C |
| E — frontend | **Complete for the account scope** — the SPA reads `totals`, `timeline` and `timeline/items`; build-stats is deleted; the dashboard carries the month-on-month comparison and the item breakdown; the archive dialogue is split into its four segment blocks. Corporation scope waits for Stage C |
| F — archived jobs read API | **Complete** — `GET /api/v1/archived-jobs` serves a paged, filtered list of summaries and `GET /api/v1/archived-jobs/{jobID}` one full document. Rows report group and related-set membership, figures come from the shared `archivestats` reduction, and the query parsing both this and the statistics views use moved to `api/helper`. Indexes landed in the Deployment Tool |
| G — restore | **Complete** — three POST routes restore a job, a group rebuilt from its jobs, or a related set walked over the archive. The write is one server-side sequence: decrypt, resolve links, write job documents, re-link free ESI ids on the account, return the jobs to their groups, delete the archived documents, queue the rebuild. Each job rejoins the group it was archived from, merging into it when it is still on the planner. Conflicts are reported and stripped rather than blocking, and a group another session holds refuses the restore |
| H — archived jobs page | **Complete for the account scope** — `/archived-jobs` carries three tabs: statistics (metric cards, eight charts, item table), per-item history over the same windowed reads, and the jobs list with its three row shapes and restore. Chart primitives are shared and the price-history dialogue moved onto them. Neither later tab is queried until it is opened, and all three carry a mobile layout |
| I — one owner for group derivation | **Complete** — `models.Group` derives itself through `RebuildFrom` and `AddJobs`, mirroring the SPA's `createGroup` and `addJobsToGroup`; a nine-case corpus at `testing/fixtures/group-derivation` defines the rules and a harness on each side reads it. The three divergences it found are fixed |
| J — incremental statistics and the build history panel | **Complete bar one placement decision.** J1 replaced the stored snapshot array with a query, added the bucket's `quantityProduced` and `isProductionChain` key, `BuildHistoryMarks` on the totals row and `includeProductionChain` on the timeline read, rebuilt the Build History panel on the chart primitives, and removed the `archive_and_stats` change-stream group. J2 made a job's figures a delta — folded in on archive, taken back on restore — guarded by `contributedAt` on the row and a claim bump that stands a fold down when a rebuild has taken the owner on. J3 made the drain a dispatcher over one task per owner. J4 reconciles every owner once a day, oldest stamp first, rewriting aggregates from the rows and reporting drift without acting on it. J5 gave realtime messages a `type`/`subtype` vocabulary, notifies an account when its figures move, reports the recalculating and failed states on every statistics response, and shows them above the page's tabs. Built on an owner rather than an account id, so Stage C adds a kind rather than a rewrite |
| Owner block — owed to shared planners | **All four items done, and shared-planners Stage A implemented with them.** The ownership inference Stage C was blocked on is removed, the statistics route and query key take an owner handle, and the collections carry the names they hold. The owner block then went in whole: `_meta.owner` is the single ownership statement on every scoped document, `models.Owner` is the only vocabulary, and the stamp is a `prepareRelease` step. The renames turned out **not** to be coupled to that plan's Stage B window — live holds none of the statistics collections — so they ship as `CollectionRenames` version 1 on their own. See § Owner block — owed to shared planners and § The owner block landed as one cutover |

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
- Archiving a job costs the same whether the archive holds ten jobs or ten thousand, and no
  statistics document grows without bound.
- The build history panel answers what an item has cost before and whether that is drifting,
  from documents the panel already fetches, with per-build detail read only on request.
- A rebuild that cannot finish in one pass still makes progress, and the tasks CLI names the
  same work the scheduler and worker do.
- Aggregates that disagree with the rows beneath them are corrected on a schedule without anyone
  asking, and the disagreement is reported when it happens.
- A user is told when their figures have been updated, and when a recalculation is outstanding or
  has failed, rather than reading stale numbers presented as current.
- No change stream carries archive or statistics documents that nothing subscribes to.
- Realtime messages carry a family and a kind, and one the client does not recognise is reported
  rather than discarded.
- One item's history over time is answerable on its own, not only as a row in a ranking.
- The archive surfaces have tests that render the page against its endpoints, so a change of meaning
  between two units is caught where a user would see it rather than in neither unit's tests.
- Overlays in this folder describe the landed behaviour, ready to promote into live SoT.

## Handoff status

**Stage B is committed on `feature/archived-jobs-stats`.** The transformation, the worker rebuild,
the drain, its task and asynq handler, the archived-jobs producer and its schedule are all
reachable from a clone.

`services` builds, vets and tests clean, and `go fix -diff` reports nothing on any package this
stage touched. The one outstanding `go fix` suggestion in scope is `shared/tasks/queue_scale.go`
(a `maps` import), which predates this work and sits outside its touch surface — it was left rather
than swept in.

**Stage B is closed.** The account pipeline runs end to end: `PUT /archived-jobs` queues an account,
`ScheduleDispatchStatisticsRebuilds` publishes on its cron, the worker dispatches, and the claim
protocol decides what stays queued. Behaviour → [overlay.md](./overlay.md) § Stage B.

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

**Stage J is complete, and its overlay is written.** [overlay.md](./overlay.md) § Stage J covers the
delta and its stamp, the claim that decides who may write, the per-owner dispatcher, the reconcile
rota, the build history marks and the realtime vocabulary; § What "kept as stock" means covers the
segment rule and the derived quantity beside it. Archiving a job
folds its figures in and restoring takes them back out, so what an archive costs no longer depends on
how much the archive holds; a wholesale rebuild is what the rota and the tasks CLI run. The
statistics row is built in the archive request itself rather than by the work that follows it — the
first shape queued a fold whose work list was rows, so the job that queued the fold was the one job
it could not see. Aggregates are rewritten from rows on a daily rota, and drift is reported rather
than acted on.

**Restore is covered end to end on both sides.** Its pieces were unit tested while the sequence that
uses them was not: `live_restore_test.go` drives select → restore against stack Mongo and holds the
three things the order exists for — the job is back on the planner without its archive stamps and the
archived document is gone, its statistics row is revoked but keeps the stamp that says its figures
are still counted, and a delta is queued rather than a rebuild. A contested ESI id is reported and
stripped rather than refusing the job. `ArchivedJobsRestore.integration.test.jsx` covers the client
half: which scope each button asks for, the response being applied to the planner store by the one
tab the websocket will not tell, the conflict wording, and a failed restore leaving the caches alone.
Both were confirmed to bite by breaking the code they cover.

**The archive surfaces have page-level tests, not only unit tests.** Suites render a real page
against mocked endpoints — the statistics page and its tabs, the item tab, the jobs list, its search,
sort and paging, and the eight chart panels' own contract with the primitives they draw through — and
they were confirmed to catch the regression that prompted them by reverting the fix and watching them
fail. Shared scaffolding rather than per-file copies: `frontend/tests/archiveHarness.jsx` holds the
store mocks, chart capture and render helpers, and `testing/mongolive` holds the live-Mongo gate and
the scratch-account cleanup the Go live tests share. Browser-level coverage (Playwright) is a
deliberate later decision, not an oversight.

**The owner block is landed.** All four items are done and
[shared-planners](../shared-planners/plan.md) § Stage A is implemented with them: `_meta.owner` is the
single ownership statement on every scoped document, `models.Owner` is the only vocabulary, the index
specs moved with the queries, and the stamp is a `prepareRelease` step rather than a task an operator
can skip. Design and reasoning → § The owner block landed as one cutover. Behaviour →
[overlay.md](./overlay.md) § The owner block.

Three modules build, vet and test clean, and `go fix -diff` reports nothing on any package this work
touched.

**The statistics collections are rebuilt, not migrated.** The decision that was owed is taken: they are
derived, `tasks prepareRelease` already queues every owner, and the rebuild reproduces every row, bucket
and total from the archived jobs. Old-shaped documents are left in place rather than deleted — they
carry no owner and every query filters on one, so they are inert until an operator removes them. What
this loses is revoked rows, which exist so a fold can tell "removed" from "never seen"; a wholesale
rebuild does not read them, so nothing depends on them surviving it.

**Start here: the two verification steps below, then the window.** The code this project owns is
complete — the owner block, the `ChangeStreamMessage` collapse, the dry-run honesty fix and the
watchlist are all landed, and the second ownership vocabulary is gone. What stands between here and
promotion is evidence, not implementation:

1. ~~`explain` the seven `job_documents` index specs.~~ **Done** — all seven win their query. The check
   also found that `jobs` is not a built collection at all, which is [shared-planners](../shared-planners/plan.md)'
   to settle. See § The indexes moved with the queries.
2. ~~Look at the failing live tests.~~ **Done** — every gated package passes, and running them found the
   reconcile rota reconciling nothing. See § Handoff status.

**Both verification steps are closed, so what remains is the window.** § Operational steps owed lists the commands, and
[shared-planners](../shared-planners/plan.md) § Stage A owns the order and the backup.

**The live tests now run, and the owner tests pass.** `scripts/testing/live-mongo.sh` builds a test
binary for linux and runs it in a container on the stack network, so `mongo` resolves and the credentials
come from the running stack's secrets. `config.MongoURL` carries `replicaSet=`, so the driver discards the
seed host and connects to the name the set advertises — `mongo:27017` — which is why a host-side run
cannot work whatever `MONGO_HOST` says. Running inside the network was chosen over a hosts entry on the
developer's machine because it needs no per-machine setup and works the same way in CI.

All three `live_meta_owner_survives_test.go` cases pass, including the watchlist one, as does
`core/commands`' dry-run refusal test and every `core/changestream` live test.

**Running them found a live defect the owner block left behind.** `StatisticsOwners` — which every
reconcile derives its owner list from — matched and grouped on a **root** `owner` field, while the owner
block moved every statistics document's owner to `_meta.owner`. On dev that is 9,279 rows carrying
`_meta.owner` and none carrying the root field, so the aggregation returned an empty list and
**the daily reconcile rota reconciled nothing**. It reported success each night having done no work,
which is the silent-filter failure this project exists to close, surviving in the one query that grouped
on the block rather than filtering on a leaf.

`shared/mongo/scope.go` now carries `FieldMetaOwner` for the block alongside the two leaf paths, so a
query that groups on the owner spells it from the same source as one that filters on it.

`mongolive.ScratchAccount` had the same fault: it cleaned statistics rows on a root `accountID`, so a
live test's rows survived into the next run. Both are fixed, and the fix took the live failures from
eight to four.

**Every gated live test now passes**, across `shared/mongo`, `core/commands`, `core/changestream`,
`worker/tasks/archivedjobs`, `api/v1endpoints/archivedjobs`, `api/v1endpoints/statistics` and
`api/helper`. Getting there took one production fix and a sweep of the fixtures, all of the same shape:
a filter or a seed still written against the pre-owner document.

| Fault | Where |
|-------|-------|
| Cleanup filters on a retired field, so scratch documents survived and later runs hit duplicate `_id` | `mongolive.ScratchAccount` and five test files |
| Assertions read `_meta.accountID`, which nothing writes | four test files |
| A seed writes `_meta.accountID` and no owner, so the upsert cannot match it and inserts onto its own `_id` | `live_parity_docshape_test.go` |
| A clone copies its source's owner, leaving the scratch document owned by a real account | `cloneAsScratchAccount` |
| `job.MetaData.Owner.ID = x` sets the id and leaves the kind empty, so every owner-scoped read misses it | nine sites across seven files |

The last one is worth keeping in mind when writing a fixture: an owner is a pair, and `models.AccountOwner`
is the only construction that fills both. A half-set owner passes every compile-time check and matches
nothing.

Documents written by earlier runs of these tests had to be cleared by hand — they carry `owner.kind: ""`,
which the fixed cleanup filters do not match. A live database that has run these tests before may hold
them.

**Still owed:** `job_documents`' seven index specs have never been confirmed against real queries with
`explain`, which matters because their leading keys all changed.

**Stages H and I are independent of Stage C** and proceed while the corporation scope stays deferred;
the page leaves the same corporation seams the archive dialogue does.

**Stage C no longer starts with a decision.** What scopes a job to a corporation is answered: a job's
owner is the planner it was created in, written once at creation and never inferred from a correlated
field — see § Owner block item 4, which removed the half-built inference producer rather than
finishing it. What remains of C is aggregation over a non-account owner, and it waits on the owner
block. The frontend seams for the corporation scope are already open, see § The archive dialogue.

Before designing the aggregation against real shapes, run the two data steps below; a pipeline
designed against a database where every corporation ref is empty would be guessing.

### Operational steps owed

None of these is development work. They are commands run against a database, and they are needed
before Stage C can be designed against representative data.

**Dev has had the whole of `prepareRelease`, end to end, and has since been rebuilt from scratch.** The
collections were dropped and repopulated to put dev on live's exact starting names, so the current
figures are what a first population produces rather than a catch-up: 9,270 archived jobs, 9,271
statistics rows, 4,039 totals and 7,273 timeline buckets, with 227 owners queued and rebuilt. The
`_pre_0_9_0` snapshots hold what the copy step took.

The one row without an archived job is a restored `testfixture-` job whose row is revoked rather than
deleted, which is the fold taking a job's figures back out while keeping its history. The steps stay
listed because they are owed against live, and because a deploy should reach them through
`tasks prepareRelease` rather than one at a time.

`statistics_reconcile_rota` holds 138 owners, which is the first evidence the rota runs at all — it
returned an empty owner list until `StatisticsOwners` was pointed at `_meta.owner`.

**The queue sits for five minutes before anything happens.** `rebuildDebounce` bounds the longest an
owner waits rather than sliding with each re-queue, so a drain firing in that window reports
`eligible: 0` against a full queue. That is the debounce working, not a stall.

**Order matters: identity conversion first, then the rebuild.** The rebuild derives statistics from
job documents, so converting identities first means it sees refs where they exist. The other order
just means the corporation data arrives a rebuild late.

| Step | Command | Why |
|------|---------|-----|
| 1. Convert stored entity ids | `tasks encodeJobIdentity` (`-dry-run` first) | On dev, `protected.spec` is null on all 9,130 archived jobs and 834 still hold a raw `corporation_id` on their linked jobs. Those are the only corporation ids in the database, and `archivestats` reads refs, so until they are converted the aggregation sees nothing. It is also the first thing that would give `character_ref` any value at all. Owned by [entity-id-encryption](../entity-id-encryption/plan.md); this project only depends on it |
| 2. Everything the release owes the database | `tasks prepareRelease` (`-dry-run` first) | One command. It runs every release's steps, oldest first — see `releases` in `core/commands/prepare_release.go`; these eight are 0.9.0. A step with nothing to do reports zero, so re-running against a current environment is safe, and an environment several versions behind catches up in one pass |

The eight steps inside that command, in order, and why each is owed:

| Step | Why |
|------|-----|
| Complete outstanding schema maintenance | **Required — a failure here stops the release.** The hourly rotation visits one collection per tick, so an environment can sit several versions behind indefinitely. That is fine while every read goes through the upgrader and not fine here, because later steps stamp the current version onto documents they touch: a document still owing an earlier upgrade would have that upgrade skipped and be recorded as current without ever running it |
| Stamp the owner onto every scoped document | **Required — a failure here stops the release.** Derives `_meta.owner` from the account id on the same document, as a server-side pipeline, selecting on *owner absent* so a re-run reports zero. Everything after it filters on the owner. `_meta.accountID` is deliberately left behind for an operator to remove once the figures are checked |
| Drop retired change stream resume tokens | J1 removed the `archive_and_stats` change-stream group. Resume tokens are written with no expiry, so a retired group's key would sit there forever. The registry says which groups exist, so anything else under the prefix is retired by definition |
| Drop unaddressable rebuild queue entries | A queue entry whose id names no owner is skipped by every dispatch and cleared by none, so it would never leave the queue |
| Stamp extras category labels onto jobs | Before the rebuild, which derives each row's category names from the jobs. Settings retain a deleted category, so the name is recoverable now and not later — on dev this recovered 65 extras naming *Retired Courier Contract* out of 659 across 12 accounts, with none left unnamed |
| Copy the statistics documents before the rebuild | After the jobs are stamped and before the rebuild, which writes these three collections back in the owner-keyed shape. `$out` to `{name}_pre_0_9_0`, server-side and count-verified. Nothing is deleted: the old documents carry no owner and every query filters on one, so they are inert until an operator removes them |
| Drop retired statistics fields | `dataSnapshots` and `buildRows` left `ProductionTotalsRow` in J1, but the rebuild upserts with `$set` and never replaces, so a document written before then keeps whichever it had. **After the copy, not before** — the copy is what an operator falls back to, and a fallback stripped of the fields the previous release read is not one |
| Queue every account for rebuild | Recomputes every account's three collections. Idempotent, and safe to re-run. Owed again after J1: every bucket gains `quantityProduced` and `isProductionChain`, and every total gains `history`. The rebuild runs when the drain next fires, or on `tasks dispatchStatisticsRebuilds`. It reads distinct owners from the archived jobs, so an empty result with archived jobs present is an error rather than "nothing to do": that combination means the stamp did not reach them, and reporting it as success would end the release having queued nothing |

**Two steps are marked required, and the rest are not.** A step the others read the output of does not
make them fail when it fails — they succeed against documents it never prepared, report zero, and let
the release finish green having migrated nothing. Those two stop the run; the rest name themselves and
the release carries on, because every step is idempotent and a re-run picks up what failed.

These must also run against **live** when this work ships — with the caveat that live carries no
statistics collections yet, so step 2 there is a first population rather than a catch-up. Whether
step 1 has already run against live was not checked; do not assume live matches dev.

They run inside the deployment's maintenance window rather than against a serving system. The window,
its order, and the backup the cutover relies on instead of a rollback path are
[shared-planners](../shared-planners/plan.md) § Stage A's; this plan owns only which commands are owed
and why.

A third command is owed in the same window but belongs to
[shared-planners](../shared-planners/plan.md): `tasks backfillMetaOwner` stamps `_meta.owner` on the
documents that carry an account id, writing the owner block ahead of any code that reads it. It wants
to run alongside step 1 rather than after step 2, because the rebuild derives from job documents and
there is no reason to have it read them twice. It has run on dev — every stamped owner carrying the id
its `_meta.accountID` already held, across the seven collections `metaOwnerCollections` names.
`watchlist_deprecated` is the seventh and was added after the first run: see § What is not done.

**The stamp is not durable until the model carries the field.** Four write paths `$set` a whole
marshalled struct rather than named fields — `BulkUpsertJobs`, `BulkUpsertGroups`, the archive
`putHandler`, and the job upsert behind them — and `$set` on a subdocument replaces it.
`models.MetaData` has no `Owner` field, so a document those paths rewrite comes back **without** the
owner it was stamped with: not stale, erased. Accounts and settings keep theirs, because the user
write patches named fields instead.

On dev that makes the run a demonstration of the transform and nothing more, and those 9,591 stamps
last only until something saves a job.

**On live it is no longer a cross-release problem.** The deployment takes the stack down, so every
data step in this release and in shared-planners rides one window with nothing serving and nothing
writing — see [shared-planners](../shared-planners/plan.md) § Stage A for the window and its order.
The constraint that survives is only the order inside it: the images carrying `Owner` on `MetaData`
are deployed before `tasks backfillMetaOwner` runs, and no job is saved in between because no traffic
is being served. What was a hazard spanning two releases becomes a step order in one.

### Left open, none blocking

1. **A statistics rebuild is owed** — see § Operational steps owed. Changes have landed since the last
   one: the Market segment decides on evidence, broker fees count as market activity, the stored row
   lost its per-line corporation fields, a job's cost now includes invention, and Stage J added
   `quantityProduced`, the production-chain key, `history` on the totals row and `contributingRows`
   on every bucket. Existing rows keep the old figures until a rebuild rewrites them; the rota
   corrects them owner by owner over a week without one. Behaviour →
   [overlay.md](./overlay.md) § Corrections to figures already served.
2. ~~**`retainedStockBuild` is dead in the UI.**~~ **Removed, not wired.** Kept output cannot be
   verified: ESI reports what a character holds, but nothing attributes a stack in a hangar to the
   job that built it, so a stored flag would present a guess as a record. The field is off
   `models.Job` and `ArchivedJobStats`, and both classifier branches lose the override — Stock now
   means exactly what the evidence supports, "the job left no sale behind".

   What a user can be shown instead is a quantity: **`quantityProduced − quantitySold`**, both
   already on every bucket since J1, so it needs no stored field and no backfill. The **Kept as
   stock** panel plots it per month on the statistics tab, floored at zero because a month can
   settle a sale against an earlier month's build. Chain output is excluded, because the timeline
   sums direct buckets unless an item view asks for the chain.

   The two questions stay separate: the segment breakdown answers "how many builds never sold at
   all", which a job selling most of a run does not, and the panel answers "how much was kept".
3. ~~**The lifetime-totals module still says `buildStats`.**~~ **Done** — see § The SPA's statistics
   modules are named for their views.
4. **`extrasTotal` is recomputed only on add and remove.** Editing a row's value in place, or
   loading a document with a stale total, leaves it unreconciled — and the archive would inherit the
   drift permanently. Not investigated further; outside this plan's surface.
5. **The dev database holds 110 `testfixture-` jobs** from month-duplication testing. Harmless,
   removable whenever.
6. ~~**The worker's end-to-end composition still has no live test.**~~ **Closed** — see Open
   question 1. `ReconcileAccountStatistics` and `RebuildAccountStatistics` are both driven over
   seeded jobs against stack Mongo, as are the archive → fold → restore → fold cycle and the
   recovery of an archived job whose row was never folded.

7. ~~**Nothing links into the item tab.**~~ **Done** — a breakdown row's item name is a link that
   opens the item tab on that item.

8. ~~**The recalculation flag has no display.**~~ **Done** — see § Where the client shows it.

9. ~~**A skipped job keeps stale figures with nothing to say so.**~~ **Fixed** — a job the reduction
   cannot read keeps its row and its figures, because it is still archived and dropping them would
   take real history out of the totals over a document the pipeline cannot parse. The row is now
   stamped `skippedAt` with the reason, so a stale row is distinguishable from a current one, the
   archive list reports `figuresStale` and the row carries a **Stale** chip, and the rebuild logs
   `stale_rows` beside `skipped_jobs`. Stale outranks pending on a row that is both: one resolves
   itself in seconds and the other does not resolve at all. The
   stamp clears the moment the job can be read again, which makes a recalculation the way out. Rows
   are stamped, never created: a row carrying no figures would fold as a contributor of nothing and
   add a count to every bucket it touched.

10. **Browser-level tests are not started.** The page-level suites render components against mocked
   endpoints, which is where a shared-meaning change between two units shows up. What they cannot see
   is the route, the real query client and a real response together. Deliberately deferred.

~~**`dataSnapshots` is the one shape still carried for compatibility.**~~ **Done in J1.** The
unbounded per-job array is off `ProductionTotalsRow`, which now carries `BuildHistoryMarks` instead —
the marks a panel actually reads, derived from the rows rather than duplicating them. Both readers
moved with it: `hasMeaningfulBuildStats.js` is `hasMeaningfulTotals.js`, and the Archive Jobs Panel
reads `totals.history`. Documents written before J1 keep the field, because the rebuild upserts with
`$set` and never replaces; `tasks prepareRelease` unsets it — see § Operational steps
owed.

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

1. ~~**Live coverage.**~~ **Closed.** Every path named here is driven against stack Mongo.

   **Confirmed against stack Mongo**, all passing:

   | Test | Pins |
   |------|------|
   | `live_rebuild_queue_test.go` | The claim protocol — `queuedAt` survives a re-queue while `claim` increments, a stale claim clears nothing, the current claim clears the account |
   | `live_rebuild_queue_test.go` | The fold guard — `OwnerClaimIsCurrent` is true only on the dispatched claim, and false once a rebuild upgrades the entry or sweeps it |
   | `live_account_rebuild_test.go` § revokeAndPrune | Keep-list rows survive, absent ones are revoked not deleted, produced months stay and empty ones are pruned |
   | `live_account_rebuild_test.go` § emptyKeepListClearsTheAccount | An empty keep-list drops the `$nin` and empties the account, rather than leaving it untouched |
   | `live_account_rebuild_test.go` § writesBeforeRemoving | Both outgoing and incoming rows are readable between the write and removal halves, so a mid-rebuild reader sees no gap |

   Stage J added three more, all passing against stack Mongo: `live_reconcile_test.go` drives
   `ReconcileAccountStatistics` over seeded jobs and breaks the aggregates four ways at once,
   `live_rearchive_test.go` runs a job through archive, restore and re-archive and back to its
   starting figures, and `live_new_job_rows_test.go` proves the rota recovers an archived job whose
   statistics row was never folded. The `models.Job` fixtures that were the obstacle exist now.

   **The last gap is closed.** `RebuildAccountStatistics` was reachable only through the rota
   against real data; `live_skipped_rows_test.go` now drives it directly over seeded jobs, five
   times across three tests — a job the reduction cannot read keeps its figures and is stamped, the
   stamp clears once the job reads again, and stamping moves no aggregate. Each pass runs the whole
   function, so the row load and revoke either side of the shared arithmetic are covered too.

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
4. ~~**Producer without consumer.**~~ Closed: the drain schedule landed, so the queue has a
   consumer and the first pass picks up whatever accumulated.

5. ~~**`shared/archivestats` is not shared.**~~ **Closed — it is, and the move it proposed would now
   break the service-import rule.** Three services read it: the worker rebuilds and reconciles with
   it, `api/v1endpoints/archivedjobs` builds a job's statistics row in the archive request and
   reduces figures for the list, and `core` uses it in the archive-date backfill.

   What closed it is J2's decision that the row is written where the job is archived. Stage D's
   reasoning still holds — the API recomputes no aggregate — but it does produce the row a fold
   later counts, and that is the same reduction the worker runs. Sharing the code is what keeps the
   two from disagreeing about what a job contributed.

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
- The drain cron publishes **unconditionally** rather than reading the queue first: that read would
  duplicate the worker's own and give the scheduler a Mongo dependency to fail on, to save one
  message a tick. It runs on `*/2`, and the debounce rather than the cron decides how long an owner
  waits — Stage B's hourly minute-30 tick was replaced by J3.
- The drain **dispatches one task per owner** rather than doing the work itself. Stage B ran one task
  over the whole queue, which J3 replaced when a queue too long for one pass made no progress at all;
  the claim protocol moved with it, so a mid-rebuild re-queue is still not cleared.
- A job's **cost month is re-derived on every archive**, from the job itself: the earliest linked ESI
  industry job, then the earliest sale, and only failing both, the archive date. Every path that
  writes a row — the archive request, the rebuild, and the rota's new-row pass — goes through
  `archivestats.NewAccountRow`, so a job restored, edited and archived again is filed by the same
  rule as the first time and returns to the months its evidence names. Sale and fee lines are filed
  under their own dates throughout, so revenue never moves.
- **A job with neither a linked ESI job nor a sale may move to the month it was re-archived in, and
  that is accepted.** Its cost month falls back to the archive date, which restore clears, so the
  original month cannot be recovered. Such a job records spend with nothing to attribute it to;
  correcting it is the user's to do by editing the job rather than the pipeline's to infer. Do not
  add a stored first-archived date or a carried-forward cost month to close it.
- The B1 / B2 / B3 split is conversational shorthand, not a documented structure: B1 pure
  transformation, B2 worker tasks, B3 scheduling and producers. This plan defines Stage B as one
  stage.

**Recommended pickup order:** owner block item 1 (backfill, then contract) → item 2 → Stage C.
Stages A, B, D, E, F, G, H, I and J are done for the account scope.

**Reference material:** `feature/archived-jobs-redesign` on origin. Read it for pipeline shapes and
bucketing logic; do not merge or cherry-pick its Mongo-touching commits.
