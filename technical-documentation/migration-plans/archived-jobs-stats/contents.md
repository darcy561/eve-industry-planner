# Archived jobs statistics

## Owns

Plan, stage notes, and behaviour overlays for rebuilding archived-job build statistics: per-account and per-corporation aggregation, the monthly timeline, snapshot history, and the statistics API surface that serves them.

Also owns the salvage decisions for `feature/archived-jobs-redesign` — which parts of that branch are carried forward, reimplemented, or dropped.

## Does not own

- Live archived-jobs behaviour → [backend/contents.md](../../backend/contents.md) (promoted only when this project closes)
- Live Mongo access layer → [backend/shared/mongo.md](../../backend/shared/mongo.md)
- Entity refs (`char_…` / `corp_…` / `alliance_…`), the `shared/crypto/entityid` cipher that derives them, and the `encodeJobIdentity` conversion → [entity-id-encryption/plan.md](../entity-id-encryption/plan.md)
- Frontend SPA conventions → [frontend/technical-rules.md](../../frontend/technical-rules.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, stages, and done-when | [plan.md](./plan.md) |
| See why the existing branch is not merged | [plan.md](./plan.md) § Starting position |
| Know what the statistics surface looks like after each stage | [overlay.md](./overlay.md) |
| Check what has landed and what is still open | [plan.md](./plan.md) § Stage status |
| See what a job records at ingest, and what still does not scope it | [overlay.md](./overlay.md) § Ingest — entity ids on stored jobs |
| Find the data steps owed before Stage C can be designed | [plan.md](./plan.md) § Operational steps owed |
| Understand why a job belongs to exactly one archive | [plan.md](./plan.md) § Ownership is a property of the job |
| Add the archived-jobs page, its charts, or the restore flow | [plan.md](./plan.md) §§ Stage F, G, H |
| Know why a group can be rebuilt without having been stored | [plan.md](./plan.md) § Groups are rebuilt from their jobs |
| See how the archive is read, filtered and grouped today | [overlay.md](./overlay.md) § Stage F |
| Decide whether a query belongs in `shared/` or a service | [overlay.md](./overlay.md) § The queries live in the API |
| Restore a job, a group, or a set of related jobs | [plan.md](./plan.md) § Jobs come back individually, by group, or by related set |
| See how restore works today, and why its order is what it is | [overlay.md](./overlay.md) § Stage G |
| Understand what happens to a group when one of its jobs is archived | [overlay.md](./overlay.md) § Group membership while a job is archived |
| Know which group a restored job rejoins, and whether it is merged or rebuilt | [overlay.md](./overlay.md) § Every restored job returns to its own group |
| Find out why a restore can be refused while another session is editing | [overlay.md](./overlay.md) § The group's lock stands for its archived members |
| See what the archived-jobs page renders and how its charts are layered | [overlay.md](./overlay.md) § Stage H |
| Understand why group derivation exists twice, and what keeps the two honest | [overlay.md](./overlay.md) § Stage I |
| Change a rule about what a group derives from its jobs | [overlay.md](./overlay.md) § The corpus is the rule |
| Get archive data on a dev account to work against | [overlay.md](./overlay.md) § Generated archive data for development |
| Know what a job's cost is made of | [overlay.md](./overlay.md) § What a period cost, and what it was spent on |
| Change how a job's cost is worked out | [overlay.md](./overlay.md) § One corpus holds the two implementations together |
| See which stored figures changed and why a rebuild is owed | [overlay.md](./overlay.md) § Corrections to figures already served |
| Add or change a chart on the statistics tab | [overlay.md](./overlay.md) § The charts, and what each answers |
| Add a chart, or reuse one with different data | [plan.md](./plan.md) § Chart primitives are data-agnostic |
| Know what happens to the price-history chart | [plan.md](./plan.md) § Price history moves onto the primitives |
| Understand why archiving a job must not rebuild the whole account | [plan.md](./plan.md) § Stage J |
| See why the stored snapshot array is being removed | [plan.md](./plan.md) § J1 |
| Know what the build history panel shows and where each figure comes from | [plan.md](./plan.md) § J1 |
| Decide what the build history panel compares an item's history against | [plan.md](./plan.md) § Open — what the panel compares history against |
| Apply a job's statistics as a delta instead of a rebuild | [plan.md](./plan.md) § J2 |
| See what the delta path landed, and what it still owes | [plan.md](./plan.md) § What landed (J2) |
| Know why a rebuilt row is stamped as already counted | [plan.md](./plan.md) § What landed (J2) |
| Find where the delta shape lives, and why it is not in either caller | [plan.md](./plan.md) § J2 |
| Change how often archived-job statistics are recalculated | [plan.md](./plan.md) § J3 |
| Understand why a long rebuild queue currently makes no progress | [plan.md](./plan.md) § J3 |
| Split statistics work across per-account tasks and priorities | [plan.md](./plan.md) § Three tiers of work |
| Add or rename a statistics task, and know what else must change | [plan.md](./plan.md) § The operator surface moves with the tasks |
| Scope statistics to something other than an account | [plan.md](./plan.md) § Owners, not accounts |
| Stop a delta being overwritten by a rebuild running beside it | [plan.md](./plan.md) § A delta must never race a rebuild |
| Know why an empty bucket is deleted on a count and not a total | [plan.md](./plan.md) § Subtracting to nothing |
| Find out what happens when a statistics write keeps failing | [plan.md](./plan.md) § A delta that cannot be written |
| Detect and correct aggregates that disagree with their rows | [plan.md](./plan.md) § J4 |
| Compare stored figures without float noise reading as drift | [plan.md](./plan.md) § Comparing figures that are floats |
| Decide when an owner's turn to be reconciled comes round | [plan.md](./plan.md) § Scheduling |
| See what reconciliation landed, and what it shares with the rebuild | [plan.md](./plan.md) § What landed (J4) |
| Know why a bucket carries a row count, and why a rebuild once lost it | [plan.md](./plan.md) § The bucket's contributing-row count |
| Know why archive and statistics documents are no longer fanned out | [plan.md](./plan.md) § The archive and statistics change streams are removed |
| Tell the client its figures moved, or that a rebuild is outstanding | [plan.md](./plan.md) § J5 |
| Add a realtime message kind, or a handler for one | [plan.md](./plan.md) § Messages gain a family and a kind |
| Decide what a change invalidates in the SPA's caches | [plan.md](./plan.md) § One place decides what a change invalidates |
