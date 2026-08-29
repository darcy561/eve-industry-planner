# Capacity controller (`eip_capacity-controller`)

Live SoT for the Swarm **capacity-controller** singleton: Observe → Evaluate → Apply → Wait. Code: [`services/capacity-controller`](../../services/capacity-controller/). Membership / networks → [stack.md](./stack.md), [network.md](./network.md). Operator YAML → [config.md](./config.md). Host verbs → [verbs.md](../deployment/deployment-tool/cli/verbs.md) (`eip capacity`). Planned WS cordon/drain → [websocket.md](../backend/websocket/websocket.md). Tests → [testing/services/capacity-controller.md](../testing/services/capacity-controller.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-capacity-controller:${APP_VERSION}` | [`docker-stack.yml`](../../docker-stack.yml) |
| Replicas | `1` (`start-first`) | stack YAML |
| Docker API | `capacity-docker-proxy:2375` on `eip-docker-capacity` (`POST=1`) | [network.md](./network.md) |
| Policy | Swarm config `eip_config_yaml` → `/etc/eip/eip.config.yaml` | [config.md](./config.md) |
| Lease | Redis `lease:capacity:primary` | only lease holder mutates Docker |
| Cooldown | Redis `eip:capacity:cooldown:v1:{service}` | per-role after Apply |

## Loop

Under the primary lease, three **parallel** loops (`worker`, `websocket`, `api`):

1. **Observe** — Moby desired/running + labels; Redis Asynq queue depth (worker); NATS health (`health.command.ping`) for websocket backends (clients / soft / full / draining).
2. **Evaluate** — pure policy (`policy.EvaluateService`); no Moby/NATS side effects.
3. **Apply** — only when `services.<role>.capacity_controller_managed: true` (template default **true** for api / websocket / worker).
4. **Wait** — tick + remaining cooldown / stabilization.

Evaluate does **not** query Prometheus (Prom is optional obs only).

## Evaluate (current behaviour)

### Worker

- Slots ≈ `concurrency × running` (`C×R`).
- Scale-up when any priority queue’s pending exceeds that queue’s `queue_scale_up_pct` fraction of `C×R` (and stabilization elapsed); scale-down when underutilised and above `min`.
- Missing queue signal → hold (no blind scale).

### Websocket

- Average clients across backends vs `target_clients` and `reserve_capacity`: scale-up when `avg > target × (1 − reserve)`.
- Scale-in when underutilised (`avg ≤ target × 0.35`) and above `min`: **cordon → drain → wait empty / drain ack → Scale(desired−1)** (NATS `ws.command.*`; drain wait = `lifecycle.AppStopGrace`, not a YAML drain timer).
- Soft divert env (`WS_TARGET_CLIENTS`) is separate from controller reserve math — both come from the same YAML keys via sync / policy mount.

### Api

- Scales from **websocket client load** (same reserve / underutilised thresholds as websocket). Approximation until api has its own request signal.
- **Plain Scale only** — no cordon/drain for api.

## Operator path

| Verb | Effect |
|------|--------|
| `eip capacity status` | Observe snapshot via ctl |
| `eip capacity plan` | Evaluate without Apply |
| `eip capacity cordon\|drain\|uncordon <container_id>` | One-shot NATS planned ops |
| `eip capacity evacuate <container_id>` | One-shot WS scale-in playbook; **forces managed** for that Apply |

Automatic Apply still requires `capacity_controller_managed: true` for that role. Set `false` to pause controller mutations for the role (YAML kill-switch).

## Out of this surface

Hosted-tenant **id** census, node-exporter headroom, and Prom-as-Evaluate-input are **not** implemented. **Pin/move tenant verbs are scrapped for now** (do not implement until explicitly reopened).
