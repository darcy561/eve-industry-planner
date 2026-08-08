# Redis lease holder id

**Roadmap:** #2 — Replica identity  
**Related locked Outcomes:** [ws-container-id.md](./ws-container-id.md) (ephemeral container identity)  
**Code anchors:**
- [`services/shared/core/redis/lease/lease.go`](../../../../services/shared/core/redis/lease/lease.go) — `InstanceID()` → today `Replica() + ":" + uuid`

## Where it is used

Distributed Redis leases (scheduler / changestream / core singleton / similar “only one holder” work). The lease **value** (holder id) is written into the lease key; renew/compare uses that same string for the hold.

## How it is used

- A process acquires a named lease key and stores its holder id as the owner value.
- While it renews successfully, it owns that leased work.
- On roll or death: renewals stop; lease expires or is released; another process acquires with a **new** holder id. The lease **key** can stay the same; the **owner value** does not carry over.
- Today a uuid suffix guarantees a restarted process cannot refresh a previous boot’s stale holder when the prefix was slot-stable. With an ephemeral process id that already changes on replace, that fencing role overlaps the instance id itself.

## Does it require a stable identity?

No for correctness.

Fencing needs a holder id that is unique to the **current** hold / process run — not a slot-stable name across replaces. A replacement container must not keep renewing under the old owner id.

## Why might a stable identity still be desirable?

It isn’t, for lease safety. A human-readable prefix was only for Redis inspection attribution. Prefer joining to the ephemeral process/instance id for that, not a slot id.

## Outcome

**Locked (discussion + design).**

- **Job:** identify which running instance currently holds the lease (owner of that lease key’s work). Not a domain “item” owner; not a placement slot.
- **Stable slot identity required?** No. The holder must be a **unique instance id**. A replacement container should naturally use a different holder value; the old owner id becomes invalid and the lease is re-acquired.
- **Identity kind:** unique / ephemeral container identity (same family as [`ws-container-id`](./ws-container-id.md) / `container.ID()`). Exact shape (container id alone vs + fencing suffix) is an implementation detail — correctness is uniqueness per live hold, not slot continuity. Not from stack `OTEL_SERVICE_INSTANCE_ID`.
- **Follow-on:** Do not inherit slot-stable `Replica()` / OTEL env for leases by convenience. Placement / JetStream / drain remain separate consumers.
