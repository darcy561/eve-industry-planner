# Container identity (process / telemetry)

**Roadmap:** #2 — Replica identity  
**Design:** hostname / `ContainerID[:12]` SoT; helper `container.ID()` (see design plan).  
**Supersedes field name:** `ws_instance_id` (metric attr + log detail) — **removed**, not renamed to `ws_container_id`.  
**Code anchors (Phase A):**
- [`services/shared/container/id.go`](../../../../services/shared/container/id.go) — `container.ID()`
- [`services/shared/telemetry/telemetry.go`](../../../../services/shared/telemetry/telemetry.go) — `service.instance.id`
- [`services/websocket/server/identity/jetstream.go`](../../../../services/websocket/server/identity/jetstream.go) — durable names

## Where it is used

Custom `ws_instance_id` metric/log fields are removed. Identity is OTel `service.name` + `service.instance.id` (= `container.ID()`). Placement/routing use the same string, not the OTel attribute.

## How it is used

Operators tell concurrent containers apart in Prom/Grafana/logs. One identity is enough.

## Does it require a stable identity?

No for correctness. A replacement container should emit a different value.

## Outcome

**Locked (discussion + design).**

- **Job:** identify the running **container** (websocket and other roles). Distinguishes concurrent containers; changes on replace.
- **Stable slot identity required?** No.
- **SoT:** Docker short container id — in-container `HOSTNAME` (default); externally `ContainerStatus.ContainerID[:12]`. No env inject. If `ContainerSpec.Hostname` is ever set, revisit. Helper: **`container.ID()`**.
- **Telemetry:** standard OTel resources — `service.name` + `service.instance.id` (value = `container.ID()`). Prom/Grafana use those. **Remove** custom `ws_instance_id` / do not invent `ws_container_id`.
- **Logs:** no hand-stamped `ws_*` identity field; rely on the same resource attrs.
- **Not** derived from stack `OTEL_SERVICE_INSTANCE_ID` / `websocket-N`.

**Principle:** each consumer justifies its identity kind; do not invent a second name for the same container id.
