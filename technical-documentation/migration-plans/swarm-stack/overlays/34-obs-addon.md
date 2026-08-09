# #34 — Observability addon (optional; default off)

**Roadmap:** [../roadmap.md](../roadmap.md) `#34`  
**Status (mirror):** **done** (addon toggle + **Prom on obs** + live docs promote 2026-08-09)  
**Related pack:** [../18-capacity-controller/prometheus-placement.md](../18-capacity-controller/prometheus-placement.md)  
**Live SoT:** [stack.md](../../../stack/stack.md), [network.md](../../../stack/network.md), [config.md](../../../stack/config.md).

## What changed

Addon fragment + YAML toggle **landed**. **Phase B:** Prometheus relocated **data → obs** (`docker-stack.obs.yml`), dual-home **`eip-obs` + `eip-core`**; data fragment lean (mongo/redis/nats/SeaweedFS). DT catalog Groups / SyncConfigs / materialize / InjectExternalConfigs updated for the move. **Phase D:** live stack/network/config/guide docs promoted.

## How this part works after the change

Obs off omits Grafana/Loki/Alloy/exporters/asynqmon/node_exporter **and Prom**. Controller Evaluate does not need Prom (Redis Asynq + NATS health). Supersedes decision 25’s controller rationale.

## Still open

_none_

## Missing live SoT discovered mid-work

_Promoted 2026-08-09._

## Notes / decisions

- Apps must still run correctly with observability off.
- Controller has no Prom query client in v1.
