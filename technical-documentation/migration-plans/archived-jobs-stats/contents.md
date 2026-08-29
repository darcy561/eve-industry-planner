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
| Add a chart, or reuse one with different data | [plan.md](./plan.md) § Chart primitives are data-agnostic |
| Know what happens to the price-history chart | [plan.md](./plan.md) § Price history moves onto the primitives |
