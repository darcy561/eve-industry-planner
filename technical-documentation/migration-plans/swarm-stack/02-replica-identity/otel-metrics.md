# OTel / Prometheus instance id

**Roadmap:** #2 — Replica identity  
**Related locked Outcomes:** [ws-container-id.md](./ws-container-id.md)  
**Code anchors (current call sites):**
- [`services/shared/telemetry/telemetry.go`](../../../../services/shared/telemetry/telemetry.go) — sets `service.instance.id` from `container.ID()`
- Stack env `OTEL_SERVICE_INSTANCE_ID` removed from [`docker-stack.yml`](../../../../docker-stack.yml) (Phase A)

## Where it is used

- OpenTelemetry resource attribute `service.instance.id`
- Prometheus / Grafana series split by that instance

Value is `container.ID()` (hostname / short container id). The old slot **env** was mistaken ownership of identity; the **attribute name** is standard OTLP.

## How it is used

Telemetry attributes time series to a process/container for ops views. Application routing does not read this attribute.

## Does it require a stable identity?

No for correctness. Historical desire for continuous `websocket-N` series is a different need — not a requirement of `service.instance.id`.

## Outcome

**Locked (discussion + design).**

- **Job:** same container-identity contract as [`ws-container-id`](./ws-container-id.md) — which running container emitted this telemetry.
- **Stable slot identity required?** No. Replacement → new value.
- **Value SoT:** `container.ID()` (hostname / short container id). Set `service.instance.id` **in code** from that.
- **Retire:** stack `OTEL_SERVICE_INSTANCE_ID` (`role-{{.Task.Slot}}` / fixed `core` for this purpose). Do **not** read that env in `container.ID()`.
- **Keep:** standard OTel resources — `service.name` (role) + `service.instance.id` (container). Value of instance id = `container.ID()`.
- **Remove:** EIP-invented identity fields (`ws_instance_id`; do not add `ws_container_id`). Stack `OTEL_SERVICE_INSTANCE_ID` env as SoT.
- **Implement with #2 Phase A:** value cutover; strip custom attrs; Grafana → resource labels; Prom via existing OTLP→collector path. Old `websocket-N` / `ws_instance_id` series end (expected).
- **Not in this work:** a second Swarm-slot Prom label — later only if capacity needs it.
