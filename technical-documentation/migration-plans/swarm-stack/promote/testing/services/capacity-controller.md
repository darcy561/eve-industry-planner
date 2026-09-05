# capacity-controller — tests

Live SoT for test depth under [`services/capacity-controller`](../../../services/capacity-controller). Behaviour → [capacity-controller.md](../../stack/capacity-controller.md) · [stack.md](../../stack/stack.md) (membership) · [config.md](../../stack/config.md) (policy YAML) · [websocket.md](../../backend/websocket/websocket.md) (planned cordon/drain) · [verbs.md](../../deployment/deployment-tool/cli/verbs.md) (`eip capacity`). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./capacity-controller/...` | No Docker |
| Policy | `go test ./capacity-controller/policy/` | Pure Evaluate fixtures |
| Executor / Fake | `go test ./capacity-controller/executor/` | Managed gate + management sim (uses `testing/capacity_controller/clusterfake`) |
| Config | `go test ./capacity-controller/config/` | Load / Validate |
| Capacity soak unit | `go test ./testing/capacity_soak/lib/` | Profile parse / shape helpers |
| Ops soak | `go build -o ../.tmp/capacity_soak ./testing/capacity_soak` | Live stack — § Ops soak |

```bash
go test ./capacity-controller/...
go test ./testing/capacity_soak/lib/
```

## Coverage map

**Depth:** Strong on pure policy EvaluateService and Apply gating against Fake. Parallel per-service loops + per-service cooldown in the product binary. Swarm adapter and live scale paths are little/none in CI; optional ops soak drills worker/WS scale on a running stack.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `policy` | Worker scale up/hold/down; per-priority pending % thresholds; managed kill-switch; per-service cooldown hold; worker cooldown does not block websocket; WS reserve scale-up; draining empty → scale; missing queue signal; api Scale linked to WS client load |
| `executor` | Scale skips unmanaged; managed Scale records via `clusterfake` |
| `executor` management sim | Underutilised WS: cordon → drain → scale via shared helpers (mirrors websocket loop) |
| `config` | Load / Validate mirror of operator YAML keys |
| `testing/capacity_soak/lib` | Profile parse; EffectiveReplicas prefers desired |

### Thin

| Area | Gap |
|------|-----|
| `testing/capacity_controller/clusterfake` | Recording + backend drain flags; not a full Swarm fidelity model |
| `ctl` | No package tests — exercised via binary / `eip capacity` |

### Little / none

- `cluster.Swarm` Observe/Scale/NATS Request against real Moby
- Lease / per-service cooldown Redis integration in CI
- Host `eip capacity` Moby-exec path
- Live scale-up/down in CI (operator soak only)

## Ops soak

`testing/capacity_soak` (`main.go` + `lib` / `capsoak`) against `eip up` / `eip dev` with capacity-controller running and **`capacity_controller_managed: true`** for the role under test.

Shared: [`testing/harness`](../../../testing/harness) (NATS / poll / Asynq Redis). WS clients: soaklib `ProfileHold` with **`Accounts == Clients`** (one account per connection — avoids per-user session cap pile-up).

### Prerequisites

1. Shorten `scale_timing` in `eip.config.yaml` for demos (e.g. cooldown / up / down in tens of seconds), then **`eip sync`**.
2. For websocket/api scale-up: lower `services.websocket.target_clients` so hold load can cross reserve (`avg > target × (1 − reserve)`), then **`eip sync`**. Restore prod thresholds after.
3. Start near `min` replicas (`eip sync` re-asserts `min`).
4. Prefer **host** binary with `DOCKER_HOST` so Observe sees **desired**; websocket/api clients still need mesh Redis/NATS (docker on `eip-core`).

| Profile | Load | Asserts replicas |
|---------|------|------------------|
| `worker` | Pause Asynq queue → enqueue `harness.CapacitySoakNoop` → unpause after up | `eip_worker` |
| `websocket` | soaklib hold (`Accounts==Clients`) → wait `-min-live` → cancel hold → idle | `eip_websocket` (cordon→drain→scale-in) |
| `api` | Same WS hold | `eip_api` (plain Scale from WS client load) |

Phases: `-phase all` (default) \| `up` \| `down`.

### Commands

```bash
# from services/
go build -o ../.tmp/capacity_soak ./testing/capacity_soak

# Worker (host — needs DOCKER_HOST for desired)
DOCKER_HOST=unix:///var/run/docker.sock \
  REDIS_HOST=127.0.0.1 NATS_URL=nats://127.0.0.1:4222 \
  ./.tmp/capacity_soak -profile worker -phase all -enqueue 40 -want 2 -min 1

# Websocket (eip-core; linux binary; DOCKER_HOST for desired)
docker run --rm --network eip-core --env-file ../.env \
  -e LOG_LEVEL=warn -e REDIS_HOST=redis -e REDIS_PORT=6379 -e NATS_URL=nats://nats:4222 \
  -e REDIS_PASSWORD -e DOCKER_HOST=unix:///var/run/docker.sock \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/../.tmp/capacity_soak:/capacity_soak:ro" --entrypoint /capacity_soak alpine:3.20 \
  -profile websocket -phase all -clients 80 -want 2 -min 1

# Api (same hold; asserts api replicas)
docker run … /capacity_soak -profile api -phase all -clients 80 -want 2 -min 1

# Halves
./.tmp/capacity_soak -profile websocket -phase up -clients 80 -want 2
./.tmp/capacity_soak -profile websocket -phase down -min 1
```

Default `-ws-url` is `ws://traefik:80/ws`. Auto `-ramp` (~25ms/client) and `-min-live` (~80% of `-clients`) when unset.

### Pass / reading

| Check | Meaning |
|-------|---------|
| Scale-up | Effective replicas (prefer **desired**) ≥ `-want` while load held |
| Scale-down | After load idle, effective replicas ≤ `-min` (cordon→drain→scale) |
| Worker | Paused pending triggers up; unpause drains; down underutilised |
| Websocket | Live clients ≥ `-min-live` before up wait; idle (~0) before down wait |
| Api | Same client wait; asserts **api** desired/running |

**Ops evidence:** managed websocket `-phase all` scale-up + scale-down verified on live stack (use lowered demo `target_clients` for the run).

Shared conventions → [../harness.md](../harness.md) § Capacity soak. CLI header → `testing/capacity_soak/main.go`. Behaviour → [stack capacity-controller](../../stack/capacity-controller.md).

## Topic-only detail

- Product: one Swarm service; under `lease:capacity:primary`, three parallel loops (`worker` / `websocket` / `api`) each ObserveService → EvaluateService → Apply with Redis cooldown key `eip:capacity:cooldown:v1:{service}`.
- Apply runs only for services with `capacity_controller_managed: true` (default **true** for api/websocket/worker).
- Api Scale uses websocket client occupancy (same thresholds as websocket Evaluate) as a stand-in load signal.
- Operator: `eip capacity status|plan`; `evacuate` is a one-shot WS scale-in.
- Depth labels → [contents.md](./contents.md) § Depth labels.
