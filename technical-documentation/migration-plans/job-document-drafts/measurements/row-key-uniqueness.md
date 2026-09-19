# Measurements — can a row collection be keyed by the id it carries?

Collected 2026-09-18 against `eve_industry_planner_snapshot`, a live snapshot restored into the local
dev Mongo. The snapshot predates the collection renames, so `user_job_documents` is today's
`job_documents` and `archivedJobs` is today's `archived_jobs`. Re-measure against live before Stage 2
writes anything: these counts are a snapshot's, and the two sale collections are the ones that grow.

This is the gate § Settled names. `$arrayToObject` keeps the **last** value for a repeated key,
so any array whose distinct-key count is lower than its row count loses the difference silently.

## Method

Per collection and path, comparing row count against distinct-key count on the same document:

```js
{ $project: {
    n: { $size: { $ifNull: ['$<path>', []] } },
    d: { $size: { $setUnion: [ { $map: {
        input: { $ifNull: ['$<path>', []] },
        in: { $toString: { $ifNull: ['$$this.<key>', null] } } } }, [] ] } } } }
```

`$toString` mirrors what the conversion itself must do with a numeric key, so two rows whose keys differ
only by type are counted as the collision they would become.

**A repeated key is not automatically a lost row.** Rows sharing a key that are identical collapse into
one and lose nothing. Telling the two apart needs a canonical comparison — `$objectToArray` sorted by
key — because rows written by different code paths carry the same values in a different field order,
and `$addToSet` treats field order as significant. Without that step this measurement reported 20
lost linked jobs that do not exist.

## Every row collection, both collections

| Collection | Path | Key | Docs with rows | Rows | Docs losing a row | Rows lost |
|---|---|---|---|---|---|---|
| `job_documents` | `skills` | `typeID` | 31,920 | 46,196 | 0 | 0 |
| `job_documents` | `build.materials` | `typeID` | 31,953 | 174,258 | 0 | 0 |
| `job_documents` | `build.materials[].purchasing` | `id` | 3,509 | 14,834 | 0 | 0 |
| `job_documents` | `build.costs.extrasCosts` | `id` | 250 | 319 | 0 | 0 |
| `job_documents` | `build.costs.inventionEntries` | `id` | 12 | 19 | 0 | 0 |
| `job_documents` | `build.costs.linkedJobs` | `job_id` | 2,010 | 6,381 | 29 | 217 |
| `job_documents` | `build.sale.marketOrders` | `order_id` | 204 | 361 | 1 | 1 |
| `job_documents` | `build.sale.transactions` | `transaction_id` | 145 | 4,396 | 0 | 0 |
| `job_documents` | `build.sale.brokersFee` | `id` | 204 | 325 | 23 | 57 |
| `archived_jobs` | `skills` | `typeID` | 10,106 | 17,572 | 0 | 0 |
| `archived_jobs` | `build.materials` | `typeID` | 10,112 | 50,737 | 0 | 0 |
| `archived_jobs` | `build.materials[].purchasing` | `id` | 8,629 | 43,559 | 0 | 0 |
| `archived_jobs` | `build.costs.extrasCosts` | `id` | 742 | 1,070 | 0 | 0 |
| `archived_jobs` | `build.costs.inventionEntries` | `id` | 184 | 226 | 0 | 0 |
| `archived_jobs` | `build.costs.linkedJobs` | `job_id` | 7,977 | 29,814 | 27 | 263 |
| `archived_jobs` | `build.sale.marketOrders` | `order_id` | 2,565 | 3,828 | 6 | 6 |
| `archived_jobs` | `build.sale.transactions` | `transaction_id` | 2,611 | 43,667 | 44 | 3,294 |
| `archived_jobs` | `build.sale.brokersFee` | `id` | 2,521 | 3,834 | 193 | 1,078 |

## What a repeated key actually costs, once identical rows are discounted

"Identical rows collapsed" is rows-in-group minus distinct-rows-in-group, counted across every group
including one holding both duplicates and genuinely different rows. With that definition the two columns
sum back to the previous table's "Rows lost" on every line, which is what makes the split checkable.

| Collection | Path | Key | Groups | Most rows under one key | Identical rows collapsed | Distinct rows lost |
|---|---|---|---|---|---|---|
| `job_documents` | `build.costs.linkedJobs` | `job_id` | 210 | 3 | 217 | **0** |
| `archived_jobs` | `build.costs.linkedJobs` | `job_id` | 261 | 3 | 263 | **0** |
| `job_documents` | `build.sale.marketOrders` | `order_id` | 1 | 2 | 1 | **0** |
| `archived_jobs` | `build.sale.marketOrders` | `order_id` | 6 | 2 | 4 | **2** |
| `archived_jobs` | `build.sale.transactions` | `transaction_id` | 844 | 20 | 3,251 | **43** |
| `job_documents` | `build.sale.brokersFee` | `id` | 30 | 8 | 1 | **56** |
| `archived_jobs` | `build.sale.brokersFee` | `id` | 257 | 64 | 741 | **337** |

## How many sales were entered by hand

Counted per collection, because the conversion has to mint an id for each of them:

```js
{ $group: { _id: null, rows: { $sum: 1 },
    zero: { $sum: { $cond: [{ $in: [{ $ifNull: ['$…transaction_id', 0] }, [0]] }, 1, 0] } },
    negative: { $sum: { $cond: [{ $lt: ['$…transaction_id', 0] }, 1, 0] } } } }
```

| Collection | Transaction rows | `transaction_id` is 0 or absent | `transaction_id` is negative | No `journal_ref_id` |
|---|---|---|---|---|
| `job_documents` | 4,396 | 1 | 0 | 1 |
| `archived_jobs` | 43,667 | 120 | 96 | 290 |

217 rows in all, and `models.IsMarketTransactionID` already classifies every one of them as hand-entered,
because it asks `id > 0`. The negative ones are minted as the SPA mints one today; the zeros predate that
mint.

## Keys tested and rejected

Neither of these is the key. They were measured to establish whether another field on the row does better
than the one it names, and neither does:

| Collection | Path | Key tried | Docs losing a row | Rows lost |
|---|---|---|---|---|
| `job_documents` | `build.sale.brokersFee` | `order_id` | 1 | 1 |
| `archived_jobs` | `build.sale.brokersFee` | `order_id` | 52 | 813 |
| `job_documents` | `build.sale.transactions` | `journal_ref_id` | 0 | 0 |
| `archived_jobs` | `build.sale.transactions` | `journal_ref_id` | 56 | 3,320 |

Neither is an improvement: 814 fee rows lost against 393 on `id`, and 3,320 transaction rows against
3,294.

`journal_ref_id` fails for the reason it was always going to. It identifies the wallet journal entry a
sale produced rather than the sale, and the journal is a separate ESI endpoint that can lag the
transactions — so it is the field most often absent: 290 archived rows carry none against 120 carrying no
`transaction_id`, per the table above. A row with no key collapses onto a single null entry, so the field
missing from more rows is the worse key.

## What each result says

**`build.materials` keyed on `typeID` holds.** 224,995 material rows across both collections, no job
carrying two rows of one type. That answers the reaction case with a count rather than an
argument: a stacked quantity is one row, so restacking never produced a second.

**Skills, purchases, extras costs and invention entries hold.** No repeated key anywhere.

**Linked ESI jobs repeat, and the repeats are duplicates.** 480 rows across both collections are
byte-identical copies of a job linked twice. Keying collapses them, which repairs the document rather
than damaging it — an ESI job is one job, and the stored array was letting it be two.

**Transactions hold for every row ESI issued.** Of 844 repeated-key groups, 826 are identical rows and
collapse. The 18 that genuinely differ all carry `transaction_id` **0**, and they fall in 18 distinct
archived jobs, one group each. Zero is not a market id, and the SPA's `mintCustomID` mints a hand-entered
sale a non-zero negative one, so these are a historic tail rather than something current code can
produce. 43 rows are what keying them costs.

**Market orders lose history rather than orders.** Six repeated-key groups across the archive, four of
them identical. The two that differ differ in `timeStamps` alone — the same order recorded twice with
different slices of its observation history, one carrying a timestamp the other lacks. So keying on
`order_id` never loses an order; it loses whichever history array the conversion does not keep, in two
jobs. A conversion that keeps the longest `timeStamps` of the rows it collapses loses nothing at all.

**Broker fees have no row key at all, and the model already says so.** `BrokerFee.ID` is the journal
entry id, and its own comment records that it is *shared by orders listed together* — an in-game
multi-sell charges several orders in one journal entry. 393 distinct rows across both collections are
lost by keying on it, with one archived job carrying 64 fees under one id. `order_id` is worse, not
better — 814 rows, per the table above — because one order can carry more than one distinct fee row.

What the fee does have is an order. A live job document holds a mean of **1.00** fees per order; the
archive's worst case is one order carrying 65 rows, of which 64 are byte-identical copies of a single
fee. Keying on `(order_id, id)` together leaves 11 colliding rows across both collections, and all 11 are
one fee stored twice, once with `CharacterHash` and once without. There is no order anywhere holding two
fees that differ in what they charged. Five fees have no order on their job at all, each on a job holding
none, with amounts up to 28M ISK.

Stored fee rows also carry two fields no model and no class reads: `complete` on all 4,159 of them, and
`CharacterHash` on 325 of 325 live rows and 3,299 of 3,834 archived ones. Whose fee it is comes from the
order, which records it already. `salesTax`, which the model does carry, is on **zero** of all 4,159.

## A fee, scoped to its order

Counting a fee by what it charged — its journal id, date, amount and sales tax, ignoring the unmodelled
`CharacterHash` and `complete` — rather than byte-for-byte:

| Collection | Fee rows | Orders holding them | Orders whose fees all mean the same | Orders with more than one distinct fee | Rows a single `fee` field would lose |
|---|---|---|---|---|---|
| `job_documents` | 325 | 324 | 324 | 0 | **0** |
| `archived_jobs` | 3,834 | 3,021 | 2,979 | 42 (worst 6) | **61** |

Keyed by journal id **within its order** — measured before the shape was settled, and kept because it is
what established that the extra entries are distinguishable rather than corrupt:

| Collection | Keys | Colliding keys | Rows lost |
|---|---|---|---|
| `job_documents` | 324 | 0 | **0** |
| `archived_jobs` | 3,082 | 0 | **0** |

In all 42 orders carrying several distinct fees, the journal ids tell them apart, and no two of those
fees share a journal id, a date or an amount.

**When those orders were charged**, by the latest fee date on the order:

| Year | Orders carrying fees | Of which multi-fee |
|---|---|---|
| 2022 | 136 | **38** |
| 2023 | 750 | 2 |
| 2024 | 393 | 0 |
| 2025 | 627 | 0 |
| 2026 | 1,115 | 2 |

38 of the 42 are 2022 — 28% of that year's orders against 0.1% of every year since. The four later ones
are split: two carry a smaller second entry, two a larger. Every amount carries the long decimals of
`calcSellingCharges`' arithmetic rather than a journal figure, so an entry records a fee this app worked
out at link time. Whether two entries on one order were two charges or one charge worked out twice was never established.
[plan.md](../plan.md) § A fee belongs to its order settles it by fiat instead: an order holds one fee,
the oldest, which is the entry the listing was charged and the larger in 40 of the 42. Consolidating
drops 814 rows carrying 489.8M ISK — 210 duplicates and 604 differing entries, counted by running the
conversion rather than by grouping distinct values, which undercounted it six-fold because the cost
paths sum rows rather than meanings. So the id is not a bad
key — it is unique within an order and ambiguous across them, which is exactly what a multi-sell charging
several orders in one journal entry produces.

That is what [plan.md](../plan.md) § A fee belongs to its order rests on: the fee moves onto its order and
is keyed there.
