# Core service (`eip_core`)

Live SoT for the **core** control-plane service (schedulers, changestream, nested singletons). Code: [`services/core`](../../../services/core/). Rebuild / cutover history → [migration-plans/core-rebuild.md](../../migration-plans/core-rebuild.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-core:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.core.image` |
| Replicas | `1` | stack YAML `deploy.replicas` |
| Update order | `start-first` (monitor `45s`, delay `10s`) | stack `deploy.update_config` |
| `stop_grace_period` | `60s` | stack YAML |
| Volume | `core_data` → `/data` | stack YAML |
| Networks | `eip-core` only | [network.md](../../stack/network.md) |

Secret attach: `x-secrets-core`. Full service block → `services.core` in that YAML.

## Primary lease (summary)

| Piece | Live rule |
|-------|-----------|
| Lease | Redis `lease:core:primary` — who may run scheduler + changestream |
| Controllers | `primarycontroller` + `servicemanager` |
| Swarm healthcheck | `GET :19100/ready` = **handoff-ready standby** (deps + election loop) — must **not** require holding the lease |
| Roll | `start-first`: new Healthy → SIGTERM old → old releases lease → new acquires |
| Changestream resume | Redis `eip:core:handoff:v1:cs:resume:{groupID}` |

Expand this section later (sequence, workload gating, nested singleton leases).

## Health

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` | Liveness |
| `GET :19100/ready` | Standby handoff-ready for Swarm replace |

No Traefik route.
