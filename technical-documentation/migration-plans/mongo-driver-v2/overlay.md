# Overlay — MongoDB Go driver v1 → v2

In-flight behaviour notes for this project. **Not live SoT.** On overlap with live docs, this file wins until promote.

## Decisions (pre-code)

- Stage A: at A1 pull **`@latest`** for `mongo-driver/v2`, v2 `otelmongo`, and direct OTel modules (see [`versions.md`](./versions.md)). Snapshot pins there are historical only. No trailing otelmongo; keep `SetMonitor`.

## What changed (fill as work lands)

### A1 — connect spine

- `mongo.Connect(opts)` (driver Connect takes no context). Local `context.Background()` in `connectMongo` stays — used for Ping timeout, Disconnect, and logs (not leftover/unused).
- `SetBSONOptions(DefaultDocumentM)`; `SetTimeout(10s)`; `SetMonitor(otelmongo.NewMonitor())` kept.
- `Distinct` → `Distinct(…).Decode(&raw)`; spine `options.Update()` → `UpdateOne`; `primitive.NewObjectID` → `bson.NewObjectID`.

### A2 — full module cutover

- All `services/` Go imports on `mongo-driver/v2`; v1 require removed from `go.mod`.
- `options.ArrayFilters{…}` → `SetArrayFilters([]any{…})` on `UpdateOne` (grouptemplates).
- `primitive.ObjectID` / `primitive.DateTime` → `bson.ObjectID` / `bson.DateTime`.
- Remaining `options.Update()` call sites → `options.UpdateOne()`.
- `go build ./…` green.

### A3 — unit tests (no live DB)

- **Fixed:** v2 `bson.Unmarshal` nests documents as `bson.D` by default. Tests/helpers that asserted `map[string]any` failed (`archiveimport` `missing _meta`). Added `UnmarshalDocumentM` / `AsDocumentM` in `shared/core/mongo` (DefaultDocumentM); `StructToMongoDoc` / meta helpers / changestream `subDocumentToMap` use them; archiveimport test decodes with `DefaultDocumentM`.
- **Regression packs (post-A4, offline):** `bson_decode_test.go` (`AsDocumentM` / `UnmarshalDocumentM`); `helpers_test.go` (`StructToMongoDoc` + `_meta` as `bson.D` via `applyLastModified`); changestream `TestFullDocumentAsBsonD_extractsAccountID`.
- **Passed (2026-08-02, `-count=1`):** `api/helper`, `core/changestream`, `core/scheduler/maintenance`, `shared/archiveimport`, `shared/core/firebaseuserdoc`, `shared/dependency`, `shared/models`, `shared/core/mongo/...`, `shared/core/documentlock`, `websocket/server`, `worker/tasks/archivedjobs`.
- **Not run for A3:** packages that need live Redis/Mongo (e.g. `worker/ratelimiter` flood). Not docker/obs related.

### A4 — live smoke (2026-08-02)

- Harness `services/cmd/mongo_driver_v2_smoke` on `eip-core` → **pass** (ping, CRUD, nested `_meta` as `bson.M`, changestream insert, Distinct). Details: [`smoke-notes.md`](./smoke-notes.md).
- Swarm **app images** rolled on dev after smoke; **frontend fetching data** confirmed (2026-08-02).

## How this part works after the change

App Mongo clients use driver **v2.8.0** with DefaultDocumentM + otelmongo monitor. Offline BSON helpers that build `bson.M` should use `UnmarshalDocumentM` / `AsDocumentM` so nested docs stay `bson.M`. Stage A parity verified (smoke + running stack / FE fetch).

## Stage B (in progress) — parity-gated rebuild

- **Rules:** [`rebuild-rules.md`](./rebuild-rules.md).
- **Production (2026-08-02):** App code uses `eve-industry-planner/shared/mongo` only. Type **`Mongo`** (renamed from Store). `stackservices.Clients.Mongo` is `*eipmongo.Mongo`. Handlers keep `clients` for now; bind `mongo := clients.Mongo` then call `mongo.…`. Docs are **fields** on `Mongo` (not methods).
- **Docs field map:** `JobDocuments` = `user_job_documents` (hot planner API); `Jobs` = `CollectionJobs` (distinct — not the job-docs API). Also `Groups`, `Users`, `ApplicationSettings`, `ArchivedJobs`, `BuildStats`, templates, `Blueprints`, `CitadelNames`, `WatchlistDeprecated`.
- **Call chains:** `mongo.JobDocuments.BulkUpsertJobs`, `mongo.LoadUserAccount`, `mongo.Bulk()`, `eipmongo.Retry`, `eipmongo.Collection*`. Driver import alias `mongodriver` when the handle is named `mongo`.
- **Bulk adopters:** grouptemplates create/patch/delete (`mongo.Bulk()`, no compensating delete on create); `process_build_stats` ordered stats+mark pairs via `mongo.Bulk().RunOrdered`.
- **Legacy:** `shared/core/mongo` **kept** (parity oracle / unused by production). Delete in a later PR.
- **Live parity** (pre-flip): get / put-get / doc-shape / schema-upgrade green on stack — see earlier notes. Re-run after image roll.
- **Maps:** [`stage-b-full-move.md`](./stage-b-full-move.md), [`stage-b-access-layer.md`](./stage-b-access-layer.md), [`stage-b-map.md`](./stage-b-map.md).

## Missing live SoT discovered mid-work

Draft here (live-doc shape). Promote with the rest when go-ahead is given.

_None yet._
