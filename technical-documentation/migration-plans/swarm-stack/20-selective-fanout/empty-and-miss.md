# Empty hosts and miss window

**Roadmap:** #20 — Selective fan-out  
**Deliver policy today:** live updates `DeliverNew`; locks `DeliverLast` ([`natslogic/consumers.go`](../../../../services/websocket/server/natslogic/consumers.go))

## Where / how (landed)

Empty hosted set uses inert filters (`doc.update.__none__.>` / `doc.lock.__none__`) — not firehose, not empty `FilterSubjects`. Live updates: `DeliverNew`. Locks: `DeliverLast`.

## Correctness need

1. **Empty hosted set** — durable must not keep `doc.update.>` / `doc.lock.>` (that reintroduces firehose).
2. **Join / reconnect (updates)** — between index update and successful `UpdateConsumer`, messages for the new tenant are not pulled. With `DeliverNew`, that gap is not replayed from JetStream.
3. **Join / reconnect (locks)** — `DeliverLast` may still deliver the latest message for a newly filtered `doc.lock.{accountID}`.

Product already has HTTP load + session handoff / resume for reconnect. Filter updates are cost control, not a zero-gap bus.

## Trade-offs

- Permanent dual firehose “for safety” defeats #20.
- Short dual-subscribe grace increases cost during storms; only revisit if soak proves refetch insufficient.
- Aggressive debounce worsens miss window; prefer small debounce (tens–hundreds of ms), not seconds.

## Outcome

**Locked.**

- **Empty hosted set:** no catch-all. **Verified:** JetStream empty `FilterSubjects` means *all* stream subjects (firehose) — never use empty. Product uses inert patterns `doc.update.__none__.>` / `doc.lock.__none__` (`DocUpdateFilterInert` / `DocLockFilterInert` in `shared/core/nats`).
- **Widen miss:** accepted for updates (`DeliverNew`). Locks may see last message (`DeliverLast`). Rely on existing client refetch / resume / handoff. Live SoT: [websocket.md](../../../backend/websocket/websocket.md) § Miss window.
- **No permanent dual firehose.** Optional short dual-subscribe only if evidence demands it later (separate decision).
- **Reconnect storms:** debounce filter updates; do not UpdateConsumer synchronously on every single connect in a burst without coalescing.
