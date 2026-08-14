# Durable lifecycle vs filter lifecycle

**Roadmap:** #20 — Selective fan-out  
**Naming SoT:** [../02-replica-identity/jetstream-durables.md](../02-replica-identity/jetstream-durables.md)

## Where / how (landed)

- **Start:** `GetOrCreateConsumer` with inert `FilterSubjects` (`__none__`); widen via debounced reconcile as hosts appear.
- **Drain:** `DeleteConsumers` for this container’s two durables, then stop intake / flush / kick (#2 Phase E).
- **Reconcile:** allowlist by durable name prefix + this `container.ID()`; stamp `InactiveThreshold`; delete orphans (filters not reconcile SoT).

## Correctness need

Name lifecycle (create/delete/orphan) stays instance-scoped. Filter lifecycle (widen/shrink) is independent and may run many times per process life. Reconcile must **not** treat filter content as SoT or thrash recreate on filter drift.

## Trade-offs

Shrinking filters on drain before delete is optional nicety; delete already stops delivery. Prefer keep drain path simple (delete durables) unless shrink helps observability mid-drain.

## Outcome

**Locked.**

| Phase | Name | Filters |
|-------|------|---------|
| Start | Create/bind `doc-live-updates-{id}` / `doc-lock-{id}` | Inert `__none__` at boot; then current hosted set |
| Running | Unchanged name | Debounced UpdateConsumer via [filter-mutate](./filter-mutate.md) |
| Drain / Shutdown | Delete durables (existing) | No requirement to shrink first |
| Crash | `InactiveThreshold` + peer reconcile | N/A |
| Reconcile | Allowlist by **name** only | Do not recreate solely because filters ≠ firehose |

Keep durable **name** lifecycle separate from #20 **filter** updates. No per-tenant durables.
