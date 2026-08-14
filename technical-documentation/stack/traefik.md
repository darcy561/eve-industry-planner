# Traefik — Swarm edge

Live SoT for Swarm service `eip_traefik` (app fragment [`docker-stack.yml`](../../docker-stack.yml)): image pins, edge defaults, traffic/discovery wiring, socket-proxy allowlist.

Operator Path / Base URL / Access → [config.md](./config.md). Overlay membership → [network.md](./network.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Traefik image | `traefik:v3` | [`docker-stack.yml`](../../docker-stack.yml) `services.traefik.image` |
| Docker socket proxy image | `tecnativa/docker-socket-proxy:v0.4.2` | same file, `services.traefik-docker-proxy.image` |
| Traefik replicas | `1` | stack YAML `deploy.replicas` |
| Volume | `traefik_data` → `/data` (`eve-industry-planner_traefik_data`) | [`docker-stack.yml`](../../docker-stack.yml) `volumes` / `services.traefik.volumes` |
| `ports.http` / `ports.https` | `80` / `443` | Template: [`yamldefaults.DefaultConfig`](../../deployment-tool/internal/kit/templates/yamldefaults/default.go). Live: `eip.config.yaml` |
| `ports.traefik_dashboard` | `81` | same |
| `paths.traefik_dashboard` | `/dashboard` | same |
| `paths.grafana` | `/grafana` | same — Grafana Path → [config.md](./config.md) |
| `proxy.trusted_ips` / `proxy.trusted_cidrs` | empty | same |

Grafana Access and Base URL → [config.md](./config.md) (not duplicated here).

Full Traefik `command:`, `ports:` (ingress), and dashboard labels → [`docker-stack.yml`](../../docker-stack.yml) `services.traefik`.

## Traffic & discovery

Networks → [network.md](./network.md). Route PathPrefix rules are Swarm `deploy.labels` on the **target** services (and dashboard labels on Traefik itself).

```text
Entrypoints (container; host publish from ports.*)
  web       :80   ← ports.http
  websecure :443  ← ports.https  (TLS enabled on entrypoint)
  dashboard :81   ← ports.traefik_dashboard
  metrics   :8082 (not host-published)

Traffic (host → eip-public via providers.swarm)
  Host ──ingress──► eip_traefik
                      ├─ /api              → eip_api          (web + websecure; CORS; LB :19100/ready)
                      ├─ /ws               → eip_ws-router    (web + websecure; CORS; LB :19100/ready)
                      ├─ /  (priority 1)   → eip_frontend     (web + websecure; LB /health.json)
                      ├─ dashboard path    → api@internal     (entrypoint dashboard only)
                      └─ paths.grafana     → grafana          (obs on + Access Public; web + websecure)

Discovery (Docker API on eip-docker-traefik)
  eip_traefik ──► traefik-docker-proxy:2375
    providers.swarm  → watch eip-public
    providers.docker → watch eip-core

Metrics
  mesh alias traefik:8082  (entrypoint metrics; not host-published)
```

### Grafana on the edge

When Access is **Private**, Grafana keeps Traefik router label templates but `traefik.enable=false` (not discovered). **Public** sets enable true and `traefik.swarm.network` to the edge network name from the obs stack YAML. Knobs → [config.md](./config.md). Membership → [network.md](./network.md).

### Docker socket proxy allowlist

`eip_traefik-docker-proxy` mounts the host sock; Traefik does not. Allowlist: `CONTAINERS` + `SERVICES` + `TASKS` + `NETWORKS` + `NODES` + `EVENTS`, `POST=0`. `NODES` is required for the swarm provider. Overlay islands → [network.md](./network.md).
