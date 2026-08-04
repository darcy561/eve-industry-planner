# MongoDB Go driver v1 → v2 migrate

**Status:** Stage A **live on dev**. Stage B **parity-gated rebuild** into [`services/shared/mongo`](../../../services/shared/mongo) — spine + `TestParity_*` landed; legacy oracle untouched. Rules: [`rebuild-rules.md`](./rebuild-rules.md). Promote live SoT only with go-ahead.  

**Module:** `services/` on `go.mongodb.org/mongo-driver/v2` **v2.8.0** (v1 removed). Pins: [`versions.md`](./versions.md).  
**Companion OTel:** v2 `otelmongo` + OTel core at newest resolving set with the driver (see versions). `SetMonitor` kept.  

**Server (stack):** data fragment [`docker-stack.data.yml`](../../../docker-stack.data.yml) pins **`mongo:8`** (major floating tag). Replica set `rs0` + auth + keyFile; day-2 ensure via `eip ensure-mongo` / Ready Ensure.

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and [`../technical-rules.md`](../technical-rules.md) (migration-plans). Phase 1 (project folders/docs) before any product work. Live SoT will not be edited until this project is complete and promotion is approved. While active: live docs + this folder’s overlay; overlay wins on overlap; no overlay → live docs are truth. Missing SoT found mid-work is drafted here and promoted with the rest.

**Doc sync:** After every phase step (A1–A4, then B slices), update this plan’s status/checklists, [`overlay.md`](./overlay.md), [`start-here.md`](./start-here.md), and [`inventory.md`](./inventory.md) / [`versions.md`](./versions.md) when pins or surface change — same day as the code. Do not leave handoff text describing a prior step as “current.”

**Handoff / start:** [`start-here.md`](./start-here.md)

## Phase 1 — Project docs setup (gate)

**Status:** done

| Item | Status |
|------|--------|
| Named subfolder `mongo-driver-v2/` | done |
| Project [`contents.md`](./contents.md) | done |
| This plan + rules acknowledgment | done |
| Row in [`../contents.md`](../contents.md) | done |
| Overlay scaffold [`overlay.md`](./overlay.md) | done |
| Handoff [`start-here.md`](./start-here.md) | done |
| Inventory [`inventory.md`](./inventory.md) | done |
| Smoke notes scaffold [`smoke-notes.md`](./smoke-notes.md) | done |

Phase 1 gate cleared (historical). Stage A (A1–A4) complete on dev.

## Server image vs driver (why Stage A matters for the stack)

| Piece | Now (after A2) | Notes |
|-------|----------------|--------|
| Swarm image | `mongo:8` | Unchanged in Stage A |
| Go driver | **v2.8.0** | Full (✓) with MongoDB 8.0 per compatibility table; was v1.17.9 (partial) |

Stage A does **not** require changing the server image. It aligns the client with the server major already running. Optional later (not A): pin `mongo:8.0.x` (or digest) for reproducible pulls; obs `percona/mongodb_exporter:0.51.0` stays independent of the Go driver bump.

## Goal split

| Phase / stage | Goal | Mix with the other? |
|---------------|------|---------------------|
| **1 — Docs setup** | Project folder + overlays scaffold | Gate — no product work until done |
| **A — Driver cutover** | Supported driver, behavioural **parity** | No; only after Phase 1 |
| **B — Access layer + v2 extras** | Maintainable `Store` / `Bulk()`, multi-coll writes, selective writers, error/role polish | Only **after** A is green; see [`stage-b-access-layer.md`](./stage-b-access-layer.md) |

Do **not** redesign access layer, changestream architecture, pools, or write batching inside Stage A. That makes regressions un-bisectable. Stage B is **incremental façade + adoption**, not a full repository/ODM rewrite.

---

## Stage A — Driver cutover (parity)

**In scope**

- Module path rewrite to `go.mongodb.org/mongo-driver/v2/...` (~81 files today).
- Central connect in [`services/shared/core/mongo/mongo.go`](../../../services/shared/core/mongo/mongo.go): `mongo.Connect` signature, options, **`DefaultDocumentM` / BSONOptions** so nested docs stay `bson.M`-friendly.
- Known API breaks: `Distinct` ([`archived_job_queries.go`](../../../services/shared/core/mongo/archived_job_queries.go)), `ArrayFilters` (grouptemplates), `bson/primitive` → `bson`.
- **OTel with driver:** At A1, `go get @latest` for `mongo-driver/v2`, v2 `otelmongo`, and direct OTel modules we use (see [`versions.md`](./versions.md)). No stale snapshot pins; no trailing contrib. Pseudo-version OK only when that is `@latest`. Keep `SetMonitor(otelmongo.NewMonitor())`.
- Compile + `go test ./…` + live smoke (connect, one CRUD path, changestream resume).

**Out of scope for A**

- Schema / index changes.
- Query or repository redesign.
- `Client.BulkWrite` adoption.
- Global `OmitEmpty`, CSOT policy rewrite, pool retune.
- “Make Mongo less central” layering work.

### A — phases

1. **Module + connect spine** — **done.**
2. **Known API breaks** — **done.** Remaining imports → v2; ArrayFilters / primitive / `options.Update` → `UpdateOne`; `go build ./…` green; v1 require removed.
3. **Unit tests** — **partial done (2026-08-02).** Mongo-touching packages that need **no live DB** all green (see overlay). Full `go test ./…` not required for A3 when Redis/Mongo aren’t local (e.g. ratelimiter flood dials Redis).
4. **Live smoke** — **done (2026-08-02).** See [`smoke-notes.md`](./smoke-notes.md).

### A — done when

- [x] `mongo-driver/v2` + v2 `otelmongo` at `@latest` as of A1 (see [`versions.md`](./versions.md)).
- [x] `otelmongo` on **v2** path; `SetMonitor` retained; v1 otelmongo removed.
- [x] `go.mod` with **no** v1 `mongo-driver` require.
- [x] `go build ./…` green.
- [x] Mongo unit tests without live DB green (A3 focused set).
- [ ] Full `go test ./…` optional when local Redis/deps available.
- [x] Live smoke notes recorded (pass/fail) for connect + changestream (A4).

**Ship note:** Dev app images rolled (2026-08-02); frontend fetching data against the v2 cutover. Live SoT still not promoted until go-ahead.

**Rough budget:** ~2–3 developer-days (familiarity + local suite + smoke).

---

## Stage B — Access layer + v2 extras (after A)

**Start only when Stage A is done.** Separate PR(s) / slice(s). Full plan: [`stage-b-access-layer.md`](./stage-b-access-layer.md). Write benefit audit: [`stage-b-map.md`](./stage-b-map.md).

**Goal:** Replace ad hoc collection access and sequential multi-coll writes with a **`Store` façade** and **`Store.Bulk()`** (v2 `Client.BulkWrite`), plus selective domain writers — and **move** live Mongo code from `shared/core/mongo` → `shared/mongo` (see [`stage-b-full-move.md`](./stage-b-full-move.md)).

**Not in B:** full per-collection repository rewrite, schema merges, index/agg redesign, global `OmitEmpty`, Atlas IWM/QE/vector, Deployment Tool mongosh.

### B — slices

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **B0** | `Store` + `ClientBulk` API + tests in `shared/mongo` | **partial** — package landed; no production callers yet |
| **B1** | Multi-coll consumers: `process_build_stats`, group-templates | planned (audit done) |
| **B2** | Route hot paths through Store; stop new scattered `Database().Collection` | planned |
| **B3** | Domain writers for templates + build-stats batches | planned |
| **B4** | Retry / `ErrNoDocuments` hygiene | planned |
| **B5** | Changestream resume + history-lost smoke deepen | planned |
| **B6** | Role-specific connect/Store (evidence-gated) | planned / defer OK |

### B — checklist

- [x] Write audit ([`stage-b-map.md`](./stage-b-map.md))
- [x] Access-layer plan ([`stage-b-access-layer.md`](./stage-b-access-layer.md))
- [x] B0 foundation package (`services/shared/mongo`) — callers still open
- [ ] B1 build_stats + group-templates on `Bulk()`
- [ ] B2 Store adoption waves
- [ ] B3 selective writers
- [ ] B4 error/retry cleanup
- [ ] B5 changestream smoke deepen
- [ ] B6 role clients — change or document defer

### B — suggested order

1. **B0** Store + ClientBulk.  
2. **B1** build_stats → group-templates (measure stats path).  
3. **B3** writers when B1 call sites should thin (can merge with B1 PRs if small).  
4. **B2** adoption waves + **B4** opportunistic in those PRs.  
5. **B5** when convenient; **B6** only with evidence.

---

## References

- Official: [migration-2.0.md](https://github.com/mongodb/mongo-go-driver/blob/master/docs/migration-2.0.md)
- Live Mongo connect SoT (code): `services/shared/core/mongo`
- Changestream: `services/core/changestream`
