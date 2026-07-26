# Replica identity contract (#2)

> Part of [ROADMAP.md](./ROADMAP.md). Stable per-process IDs for JetStream durables, OTLP
> `service.instance.id`, and `ws_instance_id` metrics. Applies to the live hybrid stack.

## Resolution order (code)

[`services/shared/core/instanceid.Replica`](../../services/shared/core/instanceid/replica.go):

1. `OTEL_SERVICE_INSTANCE_ID`
2. `WS_CONSUMER_NAME`
3. `DOCKER_CONTAINER_NAME`
4. `CONTAINER_NAME`
5. `HOSTNAME`
6. `os.Hostname()`
7. `"local"`

Values are sanitized (`[^a-zA-Z0-9_-]` → `_`), trimmed, max 64 chars.

**Do not** set the same `OTEL_SERVICE_INSTANCE_ID` on two live replicas of the same role — JetStream
durables would collide (`doc-live-updates-<suffix>`, `doc-lock-<suffix>`).

## Naming convention

| Service | Swarm identity |
|---------|----------------|
| api | `api-{{.Task.Slot}}` → e.g. `api-1` |
| websocket | `websocket-{{.Task.Slot}}` → e.g. `websocket-1` |
| worker | `worker-{{.Task.Slot}}` → e.g. `worker-1` |
| ws-router | `ws-router-{{.Task.Slot}}` → e.g. `ws-router-1` |
| core | fixed `core` on Swarm (`replicas: 1`) |

Swarm stack ([`docker-stack.yml`](../../docker-stack.yml)):

```yaml
environment:
  OTEL_SERVICE_INSTANCE_ID: "websocket-{{.Task.Slot}}"
```

After `service scale` or recreate, the same slot must reuse the same suffix so durables/metrics stay
continuous (`doc-live-updates-websocket-1`, …). See [STACK.md](./STACK.md).

## Compose pins (data plane)

Swarm api/websocket/worker/ws-router/core are **not** Compose services — identity comes only from the Swarm stack (core: fixed `core`). Traefik does not set a slot instance id (edge only).

## Acceptance

| Check | When |
|-------|------|
| Singletons keep stable OTel/instance labels across recreate | Swarm core (fixed `core`) |
| Slot env on stack (`api-1`, `websocket-1`/`2`, `ws-router-1`) | Verified local smoke |
| After Swarm `service scale` / recreate, durables reuse `*-websocket-<slot>` | Still to confirm (STACK.md checklist) |
| Manual scale up/down does not explode Grafana instance series | When observability addon / Prom is in use |

## Related

- [NETWORK.md](./NETWORK.md) — shared `eip` network  
- [STACK.md](./STACK.md) — slot templates  
- [WS_ROUTER.md](./WS_ROUTER.md) — placement stores **slot ids** (`websocket-N`), not raw IPs  
- ROADMAP backlog **#2**, **#4**, capacity-controller build-up (per-slot WS utilisation)  
