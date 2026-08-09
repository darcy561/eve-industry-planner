# capacity-controller — tests

Live SoT for test depth under [`services/capacity-controller`](../../../services/capacity-controller). Behaviour → [stack.md](../../stack/stack.md) (membership) · [config.md](../../stack/config.md) (policy YAML) · [websocket.md](../../backend/websocket/websocket.md) (planned cordon/drain) · [verbs.md](../../deployment/deployment-tool/cli/verbs.md) (`eip capacity`). Module entrypoints → [contents.md](./contents.md).

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
| `policy` | Worker scale up/hold/down; per-priority pending % thresholds; managed kill-switch; per-service cooldown hold; worker cooldown does not block websocket; WS reserve scale-up; draining empty → scale; missing queue signal |
| `executor` | Scale skips unmanaged; managed Scale records via `clusterfake` |
| `executor` management sim | Underutilized WS: cordon → drain → scale via shared helpers (mirrors websocket loop) |
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

`services/testing/capacity_soak` against `eip up` / `eip dev` with capacity-controller running and managed services.

Prerequisites: shorten `scale_*` timing in `eip.config.yaml` for demos, `eip sync`, start near min replicas. Prefer host run with `DOCKER_HOST` so **desired** is visible.

```bash
go build -o ../.tmp/capacity_soak ./testing/capacity_soak

# Worker: pause queue → pending backlog → scale up → unpause → scale down
DOCKER_HOST=unix:///var/run/docker.sock REDIS_HOST=127.0.0.1 NATS_URL=nats://127.0.0.1:4222 \
  ./.tmp/capacity_soak -profile worker -enqueue 40 -want 2 -min 1

# Websocket: hold clients → scale up → stop load → cordon/drain/scale down
DOCKER_HOST=unix:///var/run/docker.sock REDIS_HOST=127.0.0.1 NATS_URL=nats://127.0.0.1:4222 \
  ./.tmp/capacity_soak -profile websocket -clients 80 -want 2 -min 1
```

Shared conventions → [../harness.md](../harness.md). CLI comments → `services/testing/capacity_soak/main.go`.

## Topic-only detail

- Product: one Swarm service; under `lease:capacity:primary`, three parallel loops (`worker` / `websocket` / `api`) each ObserveService → EvaluateService → Apply with Redis cooldown key `eip:capacity:cooldown:v1:{service}`.
- Apply runs only for services with `capacity_controller_managed: true` (default **true** for api/websocket/worker).
- Operator: `eip capacity status|plan`; `evacuate` is a one-shot WS scale-in.
- Depth labels → [contents.md](./contents.md) § Depth labels.
