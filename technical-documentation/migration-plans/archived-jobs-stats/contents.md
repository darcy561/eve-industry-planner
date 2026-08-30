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
