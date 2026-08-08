# Metrics and acceptance

**Roadmap:** #20 — Selective fan-out

## Where / how today

No per-replica “pulled but not hosted” gauge. Soft/full/clients are placement signals, not bus interest. Soak limits profile proves place divert, not JetStream pull selectivity.

## Correctness need

Prove non-hosting replicas stop paying firehose cost; prove durable cleanup still works after #2 naming; document miss-window policy so ops do not expect JetStream replay on filter widen.

## Outcome

**Locked — done-when for implement / soak.**

### Metrics (minimum)

| Signal | Intent |
|--------|--------|
| Messages **pulled** per durable (or per process) | Cost before local drop |
| Messages **delivered** to local clients | Existing fan-out success |
| Hosted-tenant count / filter-subject count | Interest size |
| Filter update success / error / no-op | Controller health |
| Orphan durables deleted (existing reconcile) | Cleanup still works |

### Acceptance

1. Hot tenant load: replica that does **not** host that tenant pulls **≈ 0** messages for that tenant’s subjects (allow tiny race during filter update).
2. Kill / drain replica → its durables gone (graceful delete or InactiveThreshold + reconcile).
3. Documented policy: update widen uses **DeliverNew** — no backlog dump; clients use refetch/resume for gaps. Lock durables use **DeliverLast** ([empty-and-miss](./empty-and-miss.md); live [websocket.md](../../../backend/websocket/websocket.md)).
4. Unit/integration: shared `UpdateConsumerFilterSubjects` no-op + apply; WS hosted-set → subject list mapping.

### Soak

Extend `ws_soak` or a small probe later — not a gate for locking this pack. Census not required for these asserts.
