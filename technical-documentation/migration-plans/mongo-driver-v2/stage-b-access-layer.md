# Stage B — Mongo access layer (plan)

**Not live SoT.** Architecture + slice plan (2026-08-02). Builds on the write audit in [`stage-b-map.md`](./stage-b-map.md) and v2 APIs already available after Stage A.

**Rules:** Following [`../documentation-rules.md`](../documentation-rules.md) + [`../technical-rules.md`](../technical-rules.md). Live SoT untouched until promote go-ahead. Product comments stay current-behaviour only (no overlay ticket refs).

## Why this is Stage B (not A, not a rewrite)

| Already done (A) | Stage B goal | Explicitly not B |
|------------------|--------------|------------------|
| Driver v2.8 + DefaultDocumentM + otelmongo | **Maintainable access** on top of v2 | Full repository/ODM rewrite |
| Behavioural parity on dev | One façade for DB/coll + multi-ns writes | Handlers never seeing `bson` (all at once) |
| Collection `BulkWrite` on hot PUTs | Adopt **`Client.BulkWrite`** via a clean API | Schema merges, index redesign, Atlas extras |

Today’s pain: collection-first helpers, ad hoc `Database(DatabaseName).Collection(…)`, sequential multi-coll writes, retry/error helpers duplicated. Stage B fixes that **incrementally**, using v2 client bulk as the multi-ns tool.

## Package home

| Path | Role |
|------|------|
| **`services/shared/mongo`** | **Rebuild home** — `Store`, `ClientBulk`, names. Import `eve-industry-planner/shared/mongo`. |
| `services/shared/core/mongo` | **Legacy** — unchanged until call sites move; retire when empty of live use. Name clash with Core service is why the new tree is not under `core/`. |

Do not edit legacy files for B0–B1 features; add or migrate into `shared/mongo` instead.

**Rebuild rules (parity before swap):** [`rebuild-rules.md`](./rebuild-rules.md).  
**Full move waves:** [`stage-b-full-move.md`](./stage-b-full-move.md).

## Target shape

```text
handler / worker
    → shared/mongo.Store  (Client + DB pinned)
         → Coll(name)
         → Bulk() → UpdateOne/InsertOne/… → RunOrdered|RunUnordered
         → (later) same-coll helpers moved or wrapped here
    → optional domain writers under shared/mongo/…
         e.g. GroupTemplates.Create, BuildStats.ProcessBatch
```

### Principles

1. **Store is the seam** — construct once from connect helpers; pin `Database(DatabaseName)` in `shared/mongo`.
2. **Same-coll stays in legacy until moved** — keep working PUT BulkWrites; re-home later, do not rewrite to client bulk.
3. **Multi-coll only via `Store.Bulk()`** — no raw `[]mongo.ClientBulkWrite` at call sites; no compensating deletes when ordered client bulk can replace them.
4. **Domain writers are selective** — add only for real multi-coll product units (templates, build stats). Not one interface per collection.
5. **Parallel packages during migration** — legacy `shared/core/mongo` and new `shared/mongo` coexist; no big-bang cutover.
6. **Bisectable slices** — each B-slice ships compile + focused tests; no mixing role-pool retunes into the first façade PR.

### Types (landed B0 in `shared/mongo`)

`Store`, `NewStore`, `Coll`, `ClientBulk` (`UpdateOne` / `UpdateMany` / `InsertOne` / `ReplaceOne` / `DeleteOne` / `DeleteMany`, `RunOrdered` / `RunUnordered`), options `Upsert()` / `ArrayFilters(...)`. Collection name constants in `names.go` (aligned with legacy until retirement).

Retry: wrap `Run*` with legacy `RetryMongoOperation` at call sites until retry lives in `shared/mongo`.

## Slices (implementation order)

### B0 — Foundation (façade + bulk API)

**Deliver:** `Store`, `NewStore`, `Coll`, `ClientBulk` + unit tests in **`services/shared/mongo`**.

**Status (2026-08-02):** package landed; tests green; no production callers yet. Legacy `shared/core/mongo` untouched.

**Done when:** package compiles; tests cover Upsert/ArrayFilters wiring; no production call sites required yet (or one smoke-only use). ✅ package + tests; callers = B1.

### B1 — First multi-coll consumers (v2 Client.BulkWrite)

Use [`stage-b-map.md`](./stage-b-map.md) candidates:

1. **`process_build_stats`** — ordered pairs via `store.Bulk()`; measure before/after on large unprocessed account.
2. **group-templates** create / patch (w/ payload) / delete — drop compensating delete; close orphan window.

**Done when:** those paths use `Store.Bulk()` only for multi-ns; focused tests; no behaviour regressions on create conflict / 404 delete.

### B2 — Stop scattering `Database().Collection`

Incrementally route high-traffic code through `Store`:

- `stackservices` / connect wiring: expose or wrap `*mongocore.Store` alongside client if needed.
- `put/*` and `get/*` helpers: prefer `*Store` or coll from Store.
- API handlers / workers: replace repeated `clients.Mongo.Database(mongocore.DatabaseName).Collection(...)` as files are touched.

**Done when:** new code guidelines in overlay: “new Mongo access goes through Store”; majority of hot paths converted (track count in inventory). Not a requirement that zero `Database(` remain in one PR.

### B3 — Selective domain writers

| Writer | Owns | Uses |
|--------|------|------|
| Group templates writer | catalog + payload lifecycle | `Store.Bulk()` |
| Build-stats batch writer | stats + archiveProcessed marks | `Store.Bulk()` |

Workers/handlers call the writer; BSON assembly can stay nearby or move under `shared/mongo/…` if it stays thin.

**Done when:** B1 call sites thin to writer methods; no second multi-coll pattern invented outside writers/Bulk.

### B4 — Error / retry hygiene (v2-friendly)

From map § B4: dedupe retry helpers → `IsNetworkError` / `IsTimeout`; `errors.Is(ErrNoDocuments)`. Do opportunistically in B0–B3 PRs; finish remaining high-traffic sites here if needed.

### B5 — Changestream deepen (no architecture rewrite)

Resume + history-lost smoke. Watcher stays. Optional later: Watch-oriented Store/client (see B6).

### B6 — Role-specific connect (evidence-gated)

| Role | Intent |
|------|--------|
| API Store | short CSOT, modest pool |
| Worker Store | batch-friendly pool / timeout |
| Watch / core | long or unset CSOT for `Watch` |

Only with reconnect/load evidence or clear misfit. Construct different `*Store` from role connect helpers; same Store API.

## Out of scope for Stage B

- Interface + mock per collection (“full rewrite”).
- Forcing all reads behind stores in one go.
- Mongo transactions as default (client bulk first).
- Merging catalog/payload (or other) collections — schema project, not access layer.
- Index/aggregation redesign, caching, `OmitEmpty` global, Atlas IWM/QE/vector.
- Deployment Tool mongosh ensure.

## Risks / rules of engagement

- **Ordered client bulk** for stats+mark and templates — preserve per-job pairing; do not “all stats then all marks.”
- **Do not** rewrite working same-coll BulkWrite PUTs to client bulk.
- **Partial failure** semantics of client bulk must be understood at each call site (especially delete 404 from delete result map).
- Keep Stage A BSON helpers (`UnmarshalDocumentM` / `AsDocumentM`) — Store does not replace them.

## Done when (Stage B overall)

- [x] B0 Store + ClientBulk landed and tested (`shared/mongo`)  
- [ ] B1 build_stats + group-templates on Bulk  
- [ ] B2 Store adoption on hot paths (tracked; no scattered new `Database()` in touched code)  
- [ ] B3 domain writers for those two multi-coll units  
- [ ] B4 retry/ErrNoDocuments hygiene done or explicitly residual  
- [ ] B5 smoke deepen recorded  
- [ ] B6 documented decision (changed or “defer — no evidence”)  
- [ ] Overlay describes Store + Bulk as current behaviour for promote later  

## Suggested PR granularity

1. B0 only  
2. B0+B1 build_stats  
3. B1 group-templates (+ B3 writer if thin enough)  
4. B2 waves by area (api put, worker, …)  
5. B4 leftovers / B5 smoke / B6 if evidence  
