# Stage B — Full move: `shared/core/mongo` → `shared/mongo`

**Not live SoT.** Inventory + wave plan (2026-08-02). **Approach:** rebuild-under-parity (not gradual touch-as-you-go). Binding rules: [`rebuild-rules.md`](./rebuild-rules.md). Also [`stage-b-access-layer.md`](./stage-b-access-layer.md), [`stage-b-map.md`](./stage-b-map.md).

**Rules:** Following [`../documentation-rules.md`](../documentation-rules.md) + [`../technical-rules.md`](../technical-rules.md). Live SoT untouched until promote. Legacy `shared/core/mongo` is the **oracle**; swap imports only when `TestParity_*` is green for that surface.

## End state

```text
services/shared/mongo/           ← only Mongo access package
  store.go, bulk.go, names.go    (B0 — landed)
  connect.go                     (from mongo.go connect/cleanup)
  bson_decode.go
  retry.go
  helpers.go                     (generic get/upsert/bulk upsert)
  delete_after_meta.go
  build_stats.go                 (ID helper; writers may live beside)
  archived_job_queries.go
  get/…                          (load helpers)
  put/…                          (upsert helpers)
  writers/…                      (optional B3 — templates, build-stats batch)

services/shared/core/mongo/      ← deleted when import count is 0
```

Import path: `eve-industry-planner/shared/mongo`  
Subpackages: `…/shared/mongo/get`, `…/shared/mongo/put` (same layout, new root).

Alias at call sites: keep `mongocore` / `mongoget` / `mongoput` **or** switch to `eipmongo` / `mongostore` — pick one convention in the first caller wave and stick to it. Recommendation: **`eipmongo`** for root, **`mongoget` / `mongoput`** unchanged for subpackages.

## Legacy surface (what exists today)

| Area | Files | Exports (summary) |
|------|------:|-------------------|
| Connect / names / unset maps | `mongo.go` | `ConnectPrimary`, `ConnectAPI`, `ConnectFromMongoEnv`, `Cleanup`, collection name vars, upsert `$unset` maps, health monitor |
| BSON | `bson_decode.go` (+ test) | `UnmarshalDocumentM`, `AsDocumentM` |
| Retry | `retry.go` | `RetryConfig`, `RetryMongoOperation`, `IsRetryableMongoError` |
| Generic CRUD helpers | `helpers.go` (+ test) | get-by-id, `StructToMongoDoc`, upsert/replace/preserving-meta (+ bulk) |
| Delete ritual | `delete_after_meta.go` | `DeleteManyAfterStampingMeta` |
| Archive / stats IDs | `archived_job_queries.go`, `build_stats.go` | filters, Distinct accounts, `BuildStatsDocumentID` |
| get/ | 4 `.go` + retry dup | watchlist, account docs, groups, jobs |
| put/ | 6 `.go` + test | jobs, groups, user, settings, watchlist, meta helper |

**~22 files**, **~70+ external importer files** under `services/` (api, worker, core, websocket, shared/migration, documentlock, stackservices, smoke).

## Target tree (full)

```text
shared/mongo/
  names.go                 ✅ B0
  store.go                 ✅ B0
  bulk.go                  ✅ B0
  connect.go               ← Connect* + Cleanup (+ monitor); NewStore from connect helpers optional
  bson_decode.go
  retry.go                 ← dedupe get/retry.go here (B4)
  helpers.go
  delete_after_meta.go
  archived_job_queries.go
  build_stats.go
  get/
    account_documents.go
    groups.go
    job_documents.go
    watchlist.go
  put/
    apply_request_meta.go
    application_settings.go
    groups.go
    job_documents.go
    user_document.go
    watchlist.go
    write_helpers.go
  writers/                 ← B3 (new, not a mechanical move)
    group_templates.go
    build_stats_batch.go
```

## Move waves (recommended)

Each wave: **copy or move into `shared/mongo` → re-point importers → delete legacy file when unused**. Prefer **move + fix imports** over long dual-maintain. Thin re-export stubs in `core/mongo` are allowed for one release if a wave is too large — mark temporary in overlay.

### Wave 0 — Home (done)

- [x] `shared/mongo` package + `Store` / `ClientBulk` / `names`
- [x] Rebuild rules + parity harness convention ([`rebuild-rules.md`](./rebuild-rules.md))

### Wave 1 — Spine (in progress)

Landed in `shared/mongo` (legacy untouched): `connect.go`, `bson_decode.go`, `retry.go`, `unset.go`, `build_stats.go`, `Connect*Store`, `parity_test.go` (names / unset / AsDocumentM / UnmarshalDocumentM / retry / BuildStatsDocumentID).

Still open:

1. Flip no production callers yet (parity-gated)
2. Fold `get/retry.go` when get/ moves (exact parity first; v2 `IsNetworkError` only as explicit delta)

**Done when:** new code can `eipmongo.ConnectPrimary()` / `ConnectPrimaryStore()` without importing `core/mongo` **and** spine `TestParity_*` stay green.

### Wave 2 — Multi-coll v2 extras (access-layer B1/B3)

- Adopt `Store.Bulk()` in `process_build_stats` + group-templates
- Add `writers/` if call sites should thin
- Still may use legacy helpers for StructToMongoDoc etc. until Wave 3

**Done when:** those two flows import `shared/mongo` for writes (Bulk); compensating delete gone on template create.

### Wave 3 — Generic helpers + delete ritual (landed in `shared/mongo`, no import flips yet)

**Clean API:** `store.Docs(name)` only — no collection-passing / RetryConfig facades. Parity tests prove **same data outcomes** vs legacy; call sites rewrite to `Docs` when green. `Retry` + `errors.Is(ErrNoDocuments)`.

Landed: `docs.go`, `struct_doc.go`, `archive.go` (filters + `Store.DistinctUnprocessedArchivedAccountIDs`). Parity: StructToMongoDoc, archive filters; real-doc path when fixtures/live.

**Still open:** flip production imports to `shared/mongo` (parity-gated).

**Done when:** no `core/mongo` imports except get/put (and until those move).

### Wave 4 — put/get on Store/Docs (in progress)

**Clean API (flat files in `shared/mongo`, not `get/`/`put/` subpackages):** methods on `*Docs` / `*Store` with named collections (`JobDocuments()`, `Groups()`, …). Legacy `core/mongo/get` + `put` remain the oracle until import flips.

**Landed (no production import flips yet):**

| Surface | New home |
|---------|----------|
| Meta stamp | `meta.go` — `ApplyMetaSessionClient` |
| Jobs put | `put_jobs.go` — `BulkUpsertJobs` |
| Groups put | `put_groups.go` — `BulkUpsertGroups` + membership deltas |
| User / settings / watchlist put | `put_user.go`, `put_settings.go`, `put_watchlist.go` |
| WS clientID retry | `put_ws_retry.go` |
| Jobs / groups get | `get_jobs.go`, `get_groups.go` |
| Account get (+ schema upgrade persist) | `get_account.go` — `Store.LoadUserAccount`, `Store.LoadApplicationSettings` |
| Watchlist get | `get_watchlist.go` |
| Offline tests | `put_groups_test.go` (`diffAddedJobIDs`); `TestParity_ApplyMetaSessionClient` |

**Live parity:** green on stack (2026-08-02) — see [`overlay.md`](./overlay.md). Scratch put/get uses account `eip-parity-account` only.

**Still open:**

1. Flip production importers (api, login resolve, documentlock, …)

**Done when:** `core/mongo/get` and `put` have zero importers.

### Wave 5 — Call-site sweep + delete legacy

1. Grep `shared/core/mongo` → zero (except maybe temporary stubs)
2. Delete `services/shared/core/mongo/`
3. Overlay: “Mongo lives at `shared/mongo`”
4. Inventory import recount

**Done when:** directory gone; CI/build green; smoke still valid.

### Wave 6 — Role Stores (access-layer B6, optional)

Split connect options (API / worker / watch) into role-specific `NewStore` constructors — only with evidence.

## Importers by area (approx.)

| Area | Role in move |
|------|----------------|
| `shared/stackservices` | Wave 1 — Store on clients |
| `api/v1endpoints/*`, `api/helper/*` | Waves 2–4 |
| `worker/tasks/*` | Waves 2–4 (build_stats early) |
| `core/changestream`, scheduler, commands, startup | Waves 1 + 3–4 (names, AsDocumentM, filters) |
| `websocket/*` | Wave 3–4 |
| `shared/core/documentlock` | Wave 3–4 (names + get) |
| `shared/migration/firestoremig` | Wave 3–4 (can stay on legacy longer — migration code) |
| `cmd/mongo_driver_v2_smoke` | Wave 1 or 3 |

## What improves vs mechanical move

| Mechanical (must happen) | Improve while moving |
|--------------------------|----------------------|
| Package path + names | `Store` instead of `Database().Collection` at touched sites |
| Same function bodies | `ClientBulk` for multi-coll (Wave 2) |
| get/put layout preserved | Single retry helper (drop `get/retry.go` dup) |
| | `errors.Is(ErrNoDocuments)` at touched sites (B4) |
| | Optional writers for templates / build-stats |

Do **not** require full repository interfaces or schema merges to finish the move.

## Dual-package rules (while both exist)

1. **New features** (Bulk, Store, writers) → `shared/mongo` only.  
2. **Bugfixes** in legacy → fix in legacy; if file already moved, fix in new home only.  
3. **No** long-lived `core/mongo` wrappers that call `shared/mongo` unless a wave needs a one-PR bridge.  
4. Collection **name strings** must match (`names.go` is source of truth once Wave 1 drops vars from legacy).

## Rough effort

| Wave | Effort (order of magnitude) |
|------|-----------------------------|
| 0 | done |
| 1 | small (1 PR) |
| 2 | medium (behaviour + measure) |
| 3 | medium (many import edits) |
| 4 | larger (api put/get + tests) |
| 5 | small cleanup |
| 6 | optional / evidence |

## Checklist (full move complete)

- [x] Wave 0 package home  
- [x] Wave 1 connect + bson + retry  
- [x] Wave 2 Bulk callers (process_build_stats + grouptemplates)  
- [x] Wave 3 helpers / archive / delete_after_meta  
- [x] Wave 4 put/get + production import flips (`eipmongo.Mongo`, Docs fields)  
- [ ] Wave 5 delete `shared/core/mongo` (deferred — kept as oracle)  
- [ ] Wave 6 role Stores (or defer documented)  
