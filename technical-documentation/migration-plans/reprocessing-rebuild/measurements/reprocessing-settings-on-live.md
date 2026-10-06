# What the reprocessing settings move will find on live

Read-only counts from the restored copy of live (`eve_industry_planner_snapshot`) on 2026-10-05, taken
while writing F3.

| Figure | Count |
|---|---|
| Account settings documents | 4,822 |
| At schema version 1 (current) | 4,822 |
| Holding the retired reprocessing fields | 4,822 |
| With `preferCompressed: false` | 0 |
| With `sellExcessMineralTypes: true` | 2 |
| `planner_settings` documents | none — the collection does not exist |

What follows for the release:

- Every account is already at the current schema version, so schema maintenance does not rewrite them
  and the retired fields are still on the live collection when `backfillPlannerSettings` runs. The step
  reads them from the release's copy all the same, which holds the same values.
- Every planner is created in the window by `backfillAccountPlanners` on the default reprocessing
  settings. Only the **2** accounts that sold leftovers differ from those defaults, so 2 planners take a
  reprocessing write; nobody had turned Prefer compressed off.
- All **4,822** accounts are cleared of the five retired fields.
