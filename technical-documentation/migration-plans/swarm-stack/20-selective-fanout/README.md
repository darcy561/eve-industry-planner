# #20 — Selective fan-out decision pack

**Rules:** Read and following [`../../documentation-rules.md`](../../documentation-rules.md) and [`../../technical-rules.md`](../../technical-rules.md) (migration-plans). Phase 1 (project folders/docs) before any product work. For Go surfaces in scope only: `go fix -diff` before planned work ([go-fix-pretest.md](./go-fix-pretest.md)); again on edited packages (not unrelated code). Live SoT will not be edited until this project is complete and promotion is approved.

**Roadmap:** [../roadmap.md](../roadmap.md) `#20`  
**Overlay pointer:** [../overlays/20-selective-fanout.md](../overlays/20-selective-fanout.md)  
**Durable naming (done):** [../02-replica-identity/jetstream-durables.md](../02-replica-identity/jetstream-durables.md) — one durable per `container.ID()`; interest is **filter set**, not rename.

Each doc separates:

1. **Where / how** it is used today (facts)
2. **What must be true for correctness** — delivery cost vs miss windows, not habit
3. **Trade-offs** — ops / soak / cutover
4. **Outcome** — locked for implement plan

## Vocabulary (locked)

| Concept | Canonical name | Do not call it |
|---------|----------------|----------------|
| Per-instance JetStream consumer name | **durable** (`doc-live-updates-{container.ID()}` / `doc-lock-{…}`) | slot durable, per-tenant durable |
| Subject patterns the durable may pull | **filter set** / `FilterSubjects` | interest Redis keys |
| Local connected tenants | **`HostedTenants`** / `HostsTenant` | census, place map |
| Placement affinity → backend | **place** (ws-router memory) | hosted set / census |
| Cross-replica hosted aggregation | **census** | **parked** — not needed for #20; revisit #18 / #21 |

## Working correctness sketch (locked Outcomes)

| Topic | Locked? |
|-------|---------|
| [subjects-doc-update](./subjects-doc-update.md) | **Yes** — tenant in subject |
| [subjects-doc-lock](./subjects-doc-lock.md) | **Yes** — #20 account filters done; corp/alliance → document-lock roadmap |
| [filter-mutate](./filter-mutate.md) | **Yes** — shared helper + WS debounce |
| [empty-and-miss](./empty-and-miss.md) | **Yes** — no catch-all; updates DeliverNew miss OK; locks DeliverLast |
| [lifecycle](./lifecycle.md) | **Yes** — name vs filter lifecycle split |
| [metrics-acceptance](./metrics-acceptance.md) | **Yes** — pull≈0 on non-hosts |

## Files

| Doc | Question |
|-----|----------|
| [subjects-doc-update.md](./subjects-doc-update.md) | `doc.update` subject shape |
| [subjects-doc-lock.md](./subjects-doc-lock.md) | `doc.lock` subject + filter phasing |
| [filter-mutate.md](./filter-mutate.md) | How filters update; shared helper |
| [empty-and-miss.md](./empty-and-miss.md) | Empty hosts + join/reconnect gap |
| [lifecycle.md](./lifecycle.md) | Start / drain / reconcile |
| [metrics-acceptance.md](./metrics-acceptance.md) | Done-when / soak |
| [go-fix-pretest.md](./go-fix-pretest.md) | Scoped `go fix -diff` (safe applied; watcher deferred) |
| [implement-watcher-cutover.md](./implement-watcher-cutover.md) | Publisher subject cutover checklist (after filter helper) |

## Implement order (after Outcomes)

1. Shared NATS filter helper + GetOrCreateConsumer fan-out path  
2. WS debounced filter controller  
3. [Watcher / `doc.update` cutover](./implement-watcher-cutover.md) (+ WS parse in same release)  
4. Metrics + soak → promote (lock corp/alliance subjects = document-lock project)  

## Explicitly out of this pack

- Cross-replica census (#18 / #21) — parked
- Redis hosted-tenant registry — rejected (#8)
- Per-tenant durable names — rejected (#2)
- Capacity controller / armed evacuate CLI
- `doc.lock.{tenantString}` / corp-alliance lock fan-out — [document-lock roadmap](../../../backend/api/document-lock/roadmap.md)

## Outcome checklist

- [x] subjects-doc-update
- [x] subjects-doc-lock
- [x] filter-mutate
- [x] empty-and-miss
- [x] lifecycle
- [x] metrics-acceptance
- [x] go-fix-pretest (safe modernizers applied; watcher hand-edit only)
- [x] implement-watcher-cutover (landed with filter helper + WS controller + E2E)
- [x] live SoT promote 2026-08-08 ([../promote/](../promote/))
