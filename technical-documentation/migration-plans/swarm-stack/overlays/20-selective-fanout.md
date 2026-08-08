# #20 — Selective JetStream / WS fan-out (interest-based)

**Roadmap:** [../roadmap.md](../roadmap.md) `#20`  
**Status (mirror):** **done** — product + live SoT promote 2026-08-08  
**Live SoT:** [websocket.md](../../../backend/websocket/websocket.md) § JetStream doc fan-out; [core.md](../../../backend/core/core.md) § Changestream → JetStream; [locks.md](../../../backend/api/document-lock/locks.md) (WS filters). Snapshot: [../promote/](../promote/).

## Decision pack (history)

→ **[../20-selective-fanout/](../20-selective-fanout/)**

Durable **naming** under [#2 jetstream-durables](../02-replica-identity/jetstream-durables.md).

## What changed

_Publisher + selective filters (2026-08-08):_ `UpdateConsumerFilterSubjects`; WS debounced reconcile from `HostedTenants`; core publishes `doc.update.{tenantString}.{collection}.{docID}`; empty hosts use inert filters (not `>`). Live stack verified: host/non-host FilterSubjects + deliveries. Promote into live SoT same day.

## How this part works after the change

→ Prefer **live** docs above. Summary: one durable per `container.ID()`; mutable `FilterSubjects` from local `HostedTenants`; tenant-keyed `doc.update`; lock filters phase-1 = `doc.lock.{accountID}` for hosted accounts; updates `DeliverNew` / locks `DeliverLast` on widen.

## Still open (follow-ons — not blocking #20 done)

1. Formal Grafana pull≈0 / soak profile (manual NATS + log evidence accepted for close)
2. Cross-replica hosted-tenant census — parked (#18 / #21)

Corp/alliance lock subjects (`doc.lock.{tenantString}`) are **not** this overlay — see [document-lock roadmap #32](../../../backend/api/document-lock/roadmap.md) (notes what #20 already landed for account filters).

## Notes / decisions

- Local `HostedTenants` only; **no** Redis interest registry (#8).
- Census parked — not required for selective pull.
- Filter updates are cost control; miss window accepted ([empty-and-miss](../20-selective-fanout/empty-and-miss.md)).
