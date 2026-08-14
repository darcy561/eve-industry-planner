# JetStream durables

**Roadmap:** #2 — Replica identity  
**Related:** [#20 selective fan-out](../overlays/20-selective-fanout.md) (filters / interest — separate from durable **name**); [ws-container-id.md](./ws-container-id.md)  
**Code anchors:**
- [`services/websocket/server/identity/jetstream.go`](../../../../services/websocket/server/identity/jetstream.go)
- [`services/websocket/server/natslogic/consumers.go`](../../../../services/websocket/server/natslogic/consumers.go) — durable config + `InactiveThreshold`
- [`services/websocket/server/nats_doc_consumer_reconcile.go`](../../../../services/websocket/server/nats_doc_consumer_reconcile.go)
- [`services/shared/core/nats/stream_consumer_reconcile.go`](../../../../services/shared/core/nats/stream_consumer_reconcile.go)

## Where it is used

Websocket JetStream durable names are prefix + suffix from `container.ID()`:

- `doc-live-updates-{container.ID()}`
- `doc-lock-{container.ID()}`

Each live websocket process binds its own durables (not a shared competing durable). **Interest** is the durable’s mutable `FilterSubjects` from local `HostedTenants` (#20) — not a firehose to every replica.

## How it is used

- On start, the process creates/binds pull consumers to those durable names.
- On graceful process stop (`DrainForRoll` → `Shutdown`): `DeleteConsumers` for this container’s two durables first (NATS stops delivering), then stop intake only, flush outbound shard FIFOs (best-effort, stop-grace bounded), kick clients, then stop workers. `Shutdown` repeats delete best-effort (not-found OK) when drain was skipped.
- `InactiveThreshold` (1h) remains the crash/kill backstop (and peer reconcile `NumWaiting==0` is a second). Graceful delete is primary; threshold must not assume slot-stable resume.
- Reconcile allowlists **this** process’s current durables, deletes abandoned same-prefix durables (and other naming generations), and stamps `InactiveThreshold` on kept fan-out durables.

**#20:** durable **name** stays “one consumer per live instance.” Interest = **mutable filter set** from local hosted tenants — decision pack [../20-selective-fanout/](../20-selective-fanout/).

## Does it require a stable identity?

**No for correctness.**

Needs:

- **Uniqueness while live:** two live websocket processes must not share one durable (would load-balance instead of fan-out).
- **This process can bind its durable** at start.
- **Orphans are cleaned** (graceful delete and/or `InactiveThreshold` + reconcile).

Slot-stable suffixes only buy resume of the same durable across replace. That is optional continuity, conflicts with “new instance → rebuild interest,” and is a poor fit for #20 (filters come from **this** process’s clients, which start empty after replace).

## Why might a stable identity still be desirable?

Slightly less consumer churn across rolls; easier ops join to old `websocket-N` vocabulary. Not required for delivery if new durable + cleanup is solid. Rejected as a requirement given #20 and the rest of this pack.

## Outcome

**Locked (discussion + design).**

- **Job:** name the per-instance JetStream durables so each live websocket has its own fan-out consumer(s).
- **Stable slot identity required?** **No.** Durable suffix is `container.ID()` (same family as [container identity](./ws-container-id.md) / `service.instance.id`). A replacement container gets a **new** durable name; it must not inherit/resume the predecessor’s durable by slot or `OTEL_SERVICE_INSTANCE_ID`.
- **Lifecycle (leave door open for #20):**
  1. **Create / bind** durables for this instance on container **start** (unique instance suffix) — done.
  2. **Delete / unregister** those durables on graceful container **stop** — done (`DeleteConsumers` **before** pull stop / kick; not on cordon-only).
  3. **`InactiveThreshold` (1h) + reconcile** — reviewed: keep as crash/kill / missed-shutdown backstop; does not assume slot-stable continuity; peer `NumWaiting==0` reconcile stays.
  4. Keep durable **name** lifecycle separate from #20 **filter** updates (interest from connected clients). Do not design naming that blocks mutable filters later.
  5. **Phase E (landed):** best-effort flush of already-queued outbound fan-out before kick on process stop.
- Filter / subject Outcomes → [../20-selective-fanout/](../20-selective-fanout/).
