# doc.lock subjects

**Roadmap:** #20 — Selective fan-out  
**Remainder (not this pack):** [document-lock roadmap #32](../../../backend/api/document-lock/roadmap.md) — tenant-string publish + corp/alliance WS fan-out  
**Publish:** [`services/shared/core/documentlock/publish.go`](../../../../services/shared/core/documentlock/publish.go) → `doc.lock.{accountID}` (numeric account id, not `account:` prefix)

## Where / how (landed for #20)

Locks publish `doc.lock.{accountID}`. Websocket durable **FilterSubjects** are `doc.lock.{accountID}` for each hosted `account:{id}` (inert when none) — not `doc.lock.>`. After pull: `broadcastRawToAccount`.

## Correctness need (#20)

Account-scoped locks filter once WS knows hosted **account** ids. That cost win is **done** for #20.

## Outcome

**Locked for #20 (done).**

1. Keep publishing `doc.lock.{accountID}`; WS filter set = hosted accounts only; one `doc-lock-{container.ID()}` with mutable filters — **landed**.
2. Corp/alliance `doc.lock.{tenantString}` + tenant broadcast → **document-lock #32** (see that roadmap’s “already landed” note).
