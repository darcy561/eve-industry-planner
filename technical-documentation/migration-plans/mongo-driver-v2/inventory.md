# Inventory — Stage A touch surface

**Not live SoT.** Recount when the tree moves. Keep this file aligned with code at each Stage A step.

## Import surface (current — A2)

All on `go.mongodb.org/mongo-driver/v2` (recount 2026-08-02 after A2).

| Area under `services/` | Files |
|------------------------|------:|
| `shared` | 29 |
| `core` | 22 |
| `api` | 18 |
| `worker` | 10 |
| `websocket` | 2 |
| **Total** | **81** |

**Pins:** see [`versions.md`](./versions.md) (landed A1/A2). No v1 `mongo-driver` / v1 `otelmongo`.

## Connect spine

| Item | Path | A2 status |
|------|------|-----------|
| Connect + options + `SetMonitor(otelmongo)` | `services/shared/core/mongo/mongo.go` | done — `Connect(opts)`, `DefaultDocumentM`, `SetTimeout(10s)`, monitor kept |
| Role helpers (`ConnectAPI` / `ConnectPrimary`) | same + `services/shared/stackservices/connect.go` | done (v2 client types) |

## Known API breaks (A — done)

| Break | Location | Status |
|-------|----------|--------|
| `Distinct` → `Decode` | `archived_job_queries.go` | done |
| `SetArrayFilters([]any{…})` | `grouptemplates/handlers.go` | done |
| `primitive` → `bson` | extras_category, helpers, sync_mongo | done |
| `options.Update` → `UpdateOne` | helpers, processor, process_build_stats, etc. | done |

## High-risk packages (A3 — no live DB; done 2026-08-02)

Passed: `core/changestream`, `shared/core/mongo/...`, `shared/archiveimport`, `shared/models`, `shared/dependency`, `api/helper`, `websocket/server`, `worker/tasks/archivedjobs`, `documentlock`, `firebaseuserdoc`, `scheduler/maintenance`.  
No tests: `grouptemplates`, `websocket/sync`.

## Offline regression packs (post-A4)

| Pack | Path |
|------|------|
| Decode helpers | `services/shared/core/mongo/bson_decode_test.go` |
| StructToMongoDoc / meta as `bson.D` | `services/shared/core/mongo/helpers_test.go` |
| Changestream `fullDocument` as `bson.D` | `services/core/changestream/bson_doc_test.go` (`TestFullDocumentAsBsonD_extractsAccountID`) |

## Out of scope (do not touch in A)

- Deployment Tool `deployment-tool/internal/dataplane/mongo` (mongosh; no Go driver)
- Stack `mongo:8` image pin
- `Client.BulkWrite`, schema/index, pool/CSOT redesign (Stage B+)

## Stage B package split (2026-08-02)

| Package | Path | Role |
|---------|------|------|
| New (B0+) | `eve-industry-planner/shared/mongo` | `Store`, `ClientBulk`, names — rebuild home |
| Legacy | `eve-industry-planner/shared/core/mongo` | Live call sites until migrated; do not add B features here |
