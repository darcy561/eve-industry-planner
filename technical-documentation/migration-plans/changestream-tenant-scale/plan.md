# Changestream tenant scale — plan

**Status:** Phase 1 (docs) — open; no product work yet  
**Code today:** [`services/core/changestream`](../../../services/core/changestream/)  
**Live SoT (until promote):** [core.md](../../backend/core/core.md) § Changestream → JetStream

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Problem

Today the primary-only watcher partitions by **collection group** (`account` / `planner` / `archive_and_stats` / `blueprints`) — one Mongo `database.Watch` + serial `Next → publish` loop per group. That isolates *domains*, not *tenants*.

Product direction adds **separate corporation and alliance collections** (users-like + planner-like per tenant type, plus more). Selective JetStream fan-out (#20) already protects **websocket pull**. The remaining cliff is **core publish**: one hot alliance can saturate a group’s cursor while other tenants wait on the same serial loop.

## Goals

1. **Isolate busy tenants in the publish path** so one whale does not stall unrelated tenants on the same collection group.
2. **Ship metrics** that make lag and hot tenants visible (group + `tenantString`).
3. **Leave the door open** for future **auto-detect → dedicated Mongo Watches** without a second redesign.
4. Keep **single-primary** changestream ownership (`lease:core:primary`) until a later, explicit multi-publisher design.

## Non-goals (this project)

- Multi-active core changestream / hash-sharded publishers across processes (rejected until deliberately revisited — see swarm-stack decision **#32**).
- One Mongo collection per busy alliance.
- Changing `doc.update.{tenantString}.{collection}.{docID}` subject shape (#20 locked).
- WS placement / capacity-controller replica scale (separate roadmaps).

## Current baseline (do not regress)

| Piece | Live rule |
|-------|-----------|
| Leadership | Only primary runs changestream |
| Partition today | `CollectionGroups()` — parallel Watch per group |
| Resume | Redis `eip:core:handoff:v1:cs:resume:{groupID}` + `StartAfter` |
| Publish | Sync JetStream `PublishMessage` on the watch loop |
| Downstream | Tenant-keyed subjects; WS filters by hosted tenants |

## Target shape (phased)

```mermaid
flowchart LR
  mongo[Mongo oplog]
  watch[Collection-group Watch]
  dispatch[Dispatch by tenantString]
  qA[Tenant queue A]
  qB[Tenant queue B]
  qHot[Hot tenant queue]
  js[JetStream doc.update]
  metrics[Prometheus metrics]
  future[Future: auto pin dedicated Watch]

  mongo --> watch
  watch --> dispatch
  dispatch --> qA --> js
  dispatch --> qB --> js
  dispatch --> qHot --> js
  qA --> metrics
  qB --> metrics
  qHot --> metrics
  metrics -.-> future
  future -.-> watch
```

### Phase A — Metrics (prerequisite)

Instrument the existing loops **before** changing scheduling. Contract → [metrics.md](./metrics.md).

**Done when:** group + tenant publisher metrics scrape cleanly; dashboards/alerts can name a hot `tenantString` and a lagging `group_id`.

### Phase B — Per-tenant publish streams (processing split)

Keep one Mongo Watch per **collection group**. After `Next` + decode + tenant resolve, enqueue to a **per-`tenantString` worker** (bounded queue). Preserve order **per tenant** (and prefer per-doc within tenant). Sync JetStream publish moves onto those workers so NATS latency on alliance A does not block account B on the same group cursor.

**Done when:** a synthetic hot tenant’s publish backlog does not stall other tenants’ publish latency on the same group; resume still advances safely (at-least-once OK); primary lose cancels queues.

### Phase C — Collection registry for corp / alliance

When corp/alliance collections land, register them as **tenant-type × domain** groups (e.g. `corporation_planner`, `alliance_planner`) in `CollectionGroups()` — capacity knob by family, not one mega-`planner`. Still one primary; still Phase B queues inside each group.

**Done when:** new collections have an explicit group home in the registry; docs/overlay list the map.

### Phase D — Auto-detect hooks (open for later; not required to close B/C)

Design seams only in B/C so a later controller can promote a whale without rewriting the publisher:

- Stable metric names/labels for “tenant dominating group”
- Interface / config seam for **pinned hot tenants** (dedicated Watch + exclude from default `$match`)
- Hysteresis policy documented — → [auto-detect.md](./auto-detect.md)

**Implementing** dynamic Watch split/merge is **out of scope until** Phase B metrics prove a single Watch + queues are insufficient. Phase D docs stay ahead of code.

## Ordering vs other work

| Related | Relationship |
|---------|----------------|
| Swarm #12 changestream lease | Remains the leadership gate |
| Swarm #20 selective fan-out | Consumer path; this plan is publisher path |
| Corp/alliance product collections | Drive Phase C timing; do not wait on Phase D |
| Capacity controller #18 | May **consume** publisher hot-tenant metrics later; does not own Mongo Watches |

## Go touch surface (when product work starts)

Run `go fix -diff` only on packages in scope before edits; re-run on edited packages after.

- `services/core/changestream/`
- Likely `services/core/metrics/` (or existing metrics wiring under core)
- Tests under `services/core/changestream/`

## Promote (when go-ahead)

Fold landed behaviour into [backend/core/core.md](../../backend/core/core.md) (changestream section: groups, per-tenant queues, metrics). Leave history here.

## Status checklist

- [x] Phase 1 — project folder + plan + metrics/auto-detect scaffolds + section `contents.md` link
- [ ] Phase A — metrics landed
- [ ] Phase B — per-tenant publish queues landed
- [ ] Phase C — corp/alliance collection groups registered (when collections exist)
- [ ] Phase D — auto-detect / dedicated Watch (optional; only if needed)
- [ ] Promote to live SoT
