# Owner stamp coverage, and what the release copied

Read on 2026-09-17 from the running development stack's Mongo, read-only, against database
`eve_industry_planner`. The stack also carries `eve_industry_planner_snapshot` (a restored copy of
live) and `eve_industry_planner_test` (the gated live-test database).

## Every document carries an owner

Counted as `_meta.owner` missing, which is what the `prepareRelease` gate refuses on.

| Collection | Documents | Missing an owner |
|------------|-----------|------------------|
| `accounts` | 12 | 0 |
| `job_documents` | 46 | 0 |
| `job_groups` | 1 | 0 |
| `planner_settings` | 12 | 0 |
| `planners` | 12 | 0 |
| `planner_memberships` | 16 | 0 |
| `archived_jobs` | 9,531 | 0 |

`jobs` does not exist on this database.

`prepareRelease` has been run repeatedly as steps were added to it, and these figures are what that
leaves behind.

## The release copies hold one document each

| Collection | Documents |
|------------|-----------|
| `planners_pre_0_9_0` | 1 |
| `planner_memberships_pre_0_9_0` | 1 |
| `planner_settings_pre_0_9_0` | 1 |

This is the case § Owed to the release, not to a stage describes, now measured rather than recalled:
the app recreated a planner document before the copy step ran, so the copy recorded one rather than
zero. `revertRelease` drops a collection it copied as empty and restores one it copied as non-empty, so
the drop path is the branch these figures show has never been exercised — and a genuine first run is the
path Public will take. Repeating the release cannot produce it: the first run created the planner
documents, so every run after it copies a collection that is not empty.
