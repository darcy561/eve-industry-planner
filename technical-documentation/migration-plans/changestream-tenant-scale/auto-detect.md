# Auto-detect / dedicated Watch (future)

**Plan:** [plan.md](./plan.md) Phase D  
**Status:** open design — **do not implement** until Phase B + metrics prove queues are insufficient  
**Not live SoT.**

## Intent

Dynamically (or via controller pin) **separate a busy tenant onto its own Mongo change stream** so that tenant’s oplog volume and `$match` path do not share a cursor with everyone else in the collection group.

Phase B **per-tenant publish queues** isolate JetStream publish stalls. Dedicated Watches isolate **Mongo cursor / UpdateLookup** cost. Auto-detect builds on [metrics.md](./metrics.md).

## Dynamic promote / demote (target behaviour)

1. **Detect** — tenant `T` dominates `group_id` G (queue age, event share, publish latency) for longer than promote hysteresis.
2. **Arm dedicated Watch** — new `database.Watch` with `$match` on tenant fields in `fullDocument` / `fullDocumentBeforeChange` (preimages required for deletes) for G’s collections; own resume key e.g. `…:cs:resume:{groupID}:tenant:{tenantString}`.
3. **Narrow default Watch** — reopen G’s default stream with those tenants **excluded** (close + `StartAfter`; expect brief overlap → at-least-once dups OK).
4. **Demote** — when cool past demote hysteresis: tear down dedicated Watch, widen default again; do not flap.

## Seams to leave in Phase B/C (without building the controller)

| Seam | Why |
|------|-----|
| Metric labels `group_id` + `tenant` | Input to detect |
| Config / API stub for `pinned_hot_tenants[]` (even if empty / unused) | Manual pin before auto |
| Watch factory that accepts a `$match` pipeline + resume key | Dedicated vs default share one code path |
| Document hysteresis + overlap=dup policy here | Avoid redesign debates mid-incident |

## Hard constraints

- Still **one core primary** owns all Watches (default + dedicated). Multi-process shard publishers remain a separate, rejected-for-now design.
- Promote/demote must not require dual primary.
- Prefer **rare** dedicated streams (whales), not one Watch per corp.

## Rejected shortcuts

| Idea | Why not |
|------|---------|
| Auto-split without metrics/hysteresis | Flapping cursors / resume storms |
| Exclude tenant from default before dedicated is live | Gap / missed events |
| Shard-hash subjects changing #20 shape | Consumer contract locked |

## Still open

- Who decides: in-process core loop vs capacity controller (#18) consuming metrics
- ~~Exact `$match` field paths once corp/alliance document shapes exist~~ **Settled:** every scoped
  document states its owner at `_meta.owner`, so pinning a tenant matches on `_meta.owner.kind` and
  `_meta.owner.id` regardless of kind. There is no separate corp/alliance shape to wait for
- Resume key namespace finalization
- Soak / chaos tests for promote during write storm
