# Orchestration probes bus `InstanceID`

**Roadmap:** #2 — Replica identity  
**Related locked Outcomes:** [ws-container-id.md](./ws-container-id.md), [otel-metrics.md](./otel-metrics.md)  
**Code anchors (current call sites):**
- [`services/shared/orchestrationprobes/bus.go`](../../../../services/shared/orchestrationprobes/bus.go) — `BusOptions.InstanceID`
- Call sites: [`services/api/app.go`](../../../../services/api/app.go), [`services/websocket/app.go`](../../../../services/websocket/app.go), [`services/worker/app.go`](../../../../services/worker/app.go)

## Where it is used

Gated NATS health census (`StartBus`): each app process answers health pings with an `instance_id` from `container.ID()`.

HTTP `/ready` / `/healthy` on the orchestration probe port do not embed this id in the URL; the bus payload does.

## How it is used

Controller / ops poll publishes a ping; responders include `InstanceID` so the census can tell which process answered. Used for readiness-style inventory across api / websocket / worker.

The bus needs distinct ids among **live** responders. It does not define placement, drain, or JetStream identity.

## Does it require a stable identity?

No for correctness of “is something ready.”

A distinct id per live responder is enough so census answers do not collide. A boot-unique / replacement-changing id satisfies that.

Assuming `instance_id = websocket-1` means Swarm slot 1 forever is operator convention, not a probe protocol requirement.

## Why might a stable identity still be desirable?

Only so census reads as “slot N ready” across rolls without remapping, or matches cordon/drain vocabulary. That is a **different** identity kind (placement/slot) if ops still want it — not a reason to keep the bus on slot-stable ids by default.

## Outcome

**Locked (discussion + design).**

- **Job:** identify the running process/container answering the census — the same identity contract as [`ws-container-id`](./ws-container-id.md) / [`otel-metrics`](./otel-metrics.md). Distinguishes concurrent instances; does **not** need to remain stable across container replacement.
- **Stable slot identity required?** No. The value only needs to uniquely identify a currently running instance. A replacement container should naturally emit a different value.
- **SoT:** `container.ID()` (hostname / short container id). Same value as OTel `service.instance.id` — **not** from stack `OTEL_SERVICE_INSTANCE_ID`. No parallel `ws_*` identity field.
- **Bus field name:** may stay `instance_id` (census vocabulary) while the **value** is the container id; do not assume `api-N` / `websocket-N` shape.
- **Rework:** stop implying slot-stable `Replica()` / OTEL env is required for the probes bus. Slot-oriented census presentation, if still wanted, is a separate concern — do not overload this id.
- **Follow-on:** Placement, Redis, JetStream, routing, drain must still justify their own identity kinds. Combining the bus with process identity does not pull those onto this ephemeral id.
