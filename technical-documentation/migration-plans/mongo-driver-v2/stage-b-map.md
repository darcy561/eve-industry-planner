# Stage B map — where benefits are real

**Not live SoT.** Write-path audit (2026-08-02). **Access-layer plan (Store / Bulk / slices):** [`stage-b-access-layer.md`](./stage-b-access-layer.md). Revisit if write paths move.

**Rules:** Following [`../documentation-rules.md`](../documentation-rules.md) + [`../technical-rules.md`](../technical-rules.md). Live SoT untouched until promote go-ahead.

## Summary

Access-layer slices (**B0–B6**) are in [`stage-b-access-layer.md`](./stage-b-access-layer.md). This file is the **write benefit** map only.

| Concern | Real benefit now? | First move |
|---------|-------------------|------------|
| Multi-coll writes (→ B1 via `Store.Bulk`) | **Yes** — 2 hot spots | After B0: `process_build_stats`; then group-templates |
| Changestream (→ B5) | **Small** | Resume + history-lost smoke |
| Timeouts / pools (→ B6) | **Maybe** | Evidence only |
| Error handling (→ B4) | **Yes, low risk** | With Store adoption PRs |

No Mongo sessions/transactions in `services/` today. Collection-level `BulkWrite` on hot PUTs is already good — **do not rewrite**.

---

## B1 — Write audit

### Keep (already batched, same collection)

| Path | Why keep |
|------|----------|
| `shared/core/mongo/put/job_documents.go`, `put/groups.go` | Hot API PUT → unordered BulkWrite |
| `api/v1endpoints/archivedjobs/putHandler.go`, `user/citadelNames.go` | Same |
| `helpers.UpsertStructsByIDPreservingMetaBulk` + SDE blueprints / schema batches | Chunked same-coll bulk |
| `firestoremig/groups.go` | Import already BulkWrite |

### Candidates (benefit)

| Priority | Path | Collections | Benefit |
|----------|------|-------------|---------|
| **1 — pilot** | `worker/tasks/archivedjobs/process_build_stats.go` | `build_stats` + `archivedJobs` | Per job: `UpdateOne` stats then `UpdateOne` flag; batch ≤500 → **~2 RTTs × N**. Client bulk (or accumulate then mark) cuts wall time on unprocessed archives |
| **2 — correctness** | `api/v1endpoints/grouptemplates/handlers.go` create/patch/delete | `user_group_template_payloads` + `user_group_template_catalog` | 2–3 RTTs + compensating `DeleteOne` on create; delete can orphan catalog. Client bulk (or txn) for atomicity |
| 3 — low | `worker/tasks/maintenance/inactive_account_planner_cleanup.go` | jobs / job_documents / groups | 3× `DeleteMany` → 1 RTT; rare |
| weak | user-doc / cloud-accounts migration tasks | `users` + `application_settings` | 2 RTTs + soft copy-then-unset; one-shot / low volume |

### Leave alone

- Separate jobs PUT vs groups PUT (different HTTP requests; each already bulk).
- `delete_after_meta.go` same-coll stamp-then-delete (changestream ordering).
- Websocket processor per-message single-coll writes.
- Login dual-create + `lastLogin` (cold path; reads dominate).

### B1 suggested order

1. Measure `ProcessBuildStats` on a large unprocessed account (before).
2. Pilot client bulk or batched accumulate+mark; measure after.
3. Group-templates multi-ns write if pilot proves client bulk ergonomics OK.
4. Skip weak migration paths unless still running at scale.

### Reusable API (superseded by access-layer plan)

Call-site shape and `Store` / `ClientBulk` design live in [`stage-b-access-layer.md`](./stage-b-access-layer.md). This map keeps **which** paths benefit; that doc owns **how** we structure Mongo access.

**Still true here:** ordered pairs for build_stats; templates create/patch/delete via ordered bulk; do not rewrite same-coll PUT BulkWrites; no “all stats then all marks.”

---

## B2 — Changestream

**Current:** `UpdateLookup` + before-change when available; Redis resume (`SetStartAfter`); history-lost via `CommandError` 286/280/260 (+ string fallback); payload from event docs only (`AsDocumentM`) — **no post-event Find**. No `SetBatchSize`.

**Benefit:** deepen live smoke (resume round-trip + forced history-lost → clear + cold start). A4 only cold-watched insert.

**Leave alone:** watcher architecture; no evidence of wasteful re-reads; no `SetBatchSize` need yet.

---

## B3 — Timeouts / pools

**Current** (`shared/core/mongo/mongo.go` — both `ConnectAPI` and `ConnectPrimary`):

| Knob | Value |
|------|-------|
| Connect / server selection / CSOT `SetTimeout` | 10s each |
| Max pool / min pool | 10 / 1 |
| Retry writes/reads | true |

Role split is **credentials only** (API URL vs primary URL). Changestream inherits the same 10s CSOT.

**Benefit candidate:** role-specific clients (short API vs worker batches vs long `Watch`) **if** idle/reconnect or pool saturation shows up.

**Leave alone until evidence:** retuning pools/timeouts “because v2”; smoke was short-lived and did not prove CSOT harm.

---

## B4 — Error handling

**Already good:** `mongo.IsDuplicateKeyError`, `errors.As` → `BulkWriteException` / `CommandError`, `IsNetworkError` / `IsTimeout` in dependency helpers. No `E11000` string checks found.

**Candidates:**

1. `shared/core/mongo/retry.go` + `get/retry.go` — stringly `IsRetryableMongoError` (duplicate); prefer `IsNetworkError` / `IsTimeout` (+ narrow fallback).
2. `err == mongo.ErrNoDocuments` → `errors.Is` at API/helper/worker sites (ESI tokens, job get, helpers, etc.).
3. Opportunistic: tighten changestream resume string fallback if wraps hide codes.

Low risk, opportunistic while touching files — not a blocker for B1.

---

## Explicitly out (B5)

Repository layering, index/agg redesign, Atlas IWM / QE / vector, global BSON `OmitEmpty` — unchanged from [`plan.md`](./plan.md).
