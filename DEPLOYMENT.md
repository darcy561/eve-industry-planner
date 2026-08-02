# Deployment Guide

Preferred host tool: **`eip`**. Bootstrap installs the binary; then `eip init` → edit `.env` → `eip up`. Make / `scripts/` remain a **legacy** escape until Public file refresh no longer depends on them — see [docs/swarm/MAKE.md](docs/swarm/MAKE.md) and [docs/admintool/ENGINEERING.md](docs/admintool/ENGINEERING.md).

Channels / prerelease tags: [docs/admintool/PRERELEASE.md](docs/admintool/PRERELEASE.md).

## Requirements

### System Requirements

- **Docker**: Version 20.10 or higher, with Swarm available (`docker swarm init` on first bring-up if needed)
- **Operating System**: **Linux** is typical for production. **Windows**: Docker Desktop (often WSL2) + PowerShell for bootstrap, or Git Bash. **macOS**: Docker Desktop
- **curl** (or PowerShell `irm`): download bootstrap / Release assets
- **Disk Space**: At least 5GB free (images, volumes, data)
- **RAM**: Minimum 2GB, recommended 4GB+
- **CPU**: 2+ cores recommended

Make / Git Bash are **not** required. The Makefile was removed — use **`eip`** only.

### Network Requirements
**For Production with Custom Domain:**
- **Domain name**: A registered domain name (e.g., `example.com`)
- **DNS access**: Ability to create DNS A records pointing to your server
- **Public IP**: Server must have a public IP address
- **Port 80**: Must be accessible from the internet (for HTTP traffic)
- **Port 443**: Must be accessible from the internet (for HTTPS traffic, if SSL is configured)

## Overview

Public / VPS bring-up uses published GHCR images via **`eip up`**. Local development (full git clone + bake) uses **`eip dev`**. Internals: [docs/swarm/MAKE.md](docs/swarm/MAKE.md) (legacy Make map), [docs/admintool/ENGINEERING.md](docs/admintool/ENGINEERING.md).

## Quick Start

### Step 1: Bootstrap the host `eip` binary

Creates an empty deploy directory and downloads only the host tool from the GitHub Release floating tag **`cli`** (Public). Stack YAML and `.env` are **not** in the bootstrap — they come from `eip init` / TUI Setup.

**Linux / macOS:**

```bash
curl -fsSL \
  "https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/eip-bootstrap.sh" \
  | bash -s -- ~/eip
cd ~/eip
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/eip-bootstrap.ps1 -OutFile $env:TEMP\eip-bootstrap.ps1
& $env:TEMP\eip-bootstrap.ps1 -Path D:\eip
cd D:\eip
```

Prerelease / staging release tags: see [PRERELEASE.md](docs/admintool/PRERELEASE.md) (`--release` / `-Release`).

### Step 2: Initialize config

```bash
./eip init
# or open the TUI: ./eip
```

Writes missing stack YAML, `.env`, and `eip.config.yaml` from Go defaults (`kit/templates`). Auto-generates database/redis secrets where needed. You may be prompted to type **`YES`** after backing up **`AUTHZ_HMAC_KEY`**—use an **interactive** terminal.

Docker containers **do not start** until you run `eip up` / `eip dev`.

### Step 3: Configure `.env`

Edit `.env` with your real values (SSO, domains, optional Sentry, Grafana passwords, etc.). Variable schema is Go SoT in [`admintool/internal/kit/templates/env`](admintool/internal/kit/templates/env/) (`EnvFields`). **`.env` holds secrets** (and `APP_VERSION`); non-secret scale/ports/paths live in **`eip.config.yaml`**. Apply procedures: [docs/swarm/ENV.md](docs/swarm/ENV.md).

Firebase Admin JSON files are **not** mounted by default. For one-off Firestore migration tasks, mount credentials yourself and set `GOOGLE_APPLICATION_CREDENTIALS`, or pass flags as documented in the migration tooling.

### Step 4: Bring up the stack

```bash
./eip up
```

Deploys the **Swarm data fragment** (mongo/redis/nats/SeaweedFS/Prometheus) and **app stack** (Traefik, api, websocket, worker, ws-router, core, frontend), then runs data-plane Ready (`EnsureS3` ‖ `EnsureMongo`). Network: [docs/swarm/NETWORK.md](docs/swarm/NETWORK.md).

**Local bake (git clone):** use `./eip dev` instead of `eip up`.

## Environment Configuration

In practice you will configure:

- **Frontend / client**: EVE Online SSO, optional Google Analytics, and build-time options (SPA runs on Swarm as `eip_frontend`)
- **Backend**: MongoDB and Redis credentials, NATS, auth and JWT settings, optional Sentry, optional Grafana admin user/password
- **Observability**: `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` (and similar) under the Grafana section in `EnvFields`

Always review secrets before production use.

### Day-2 changes (stack already running)

Do **not** use full bring-up only to apply config. Details and dry-run: [docs/swarm/ENV.md](docs/swarm/ENV.md).

| You changed | Run |
|-------------|-----|
| Secrets used by Swarm apps (SSO, HMAC, S3 keys, app DB passwords, …) | **`eip secrets`** |
| Operator YAML (`eip.config.yaml` — replicas, capacity, ports/paths, concurrency, client cutoff) | **`eip sync`** |
| Data-plane secrets (mongo/redis root, …) | Update `.env`, then **`eip secrets`**. Mongo keyfile recovery: `eip restore-mongo-keyfile` / `eip rekey-mongo`. After index SoT changes without full up/dev: **`eip ensure-mongo`**. |
| Host binary / stack YAML / image reconcile | **`eip update`** (or `--binary-only` / `--stacks-only` / `--images-only`) |

Former Make verb map (retired): [MAKE.md](docs/swarm/MAKE.md).

## Access

- **Site:** `http://yourdomain.com` (or `https://yourdomain.com` if SSL is configured)

**SSL configuration**

If you want to use HTTPS, you must set up the domain and SSL certificates yourself. Traefik will route traffic on port 443 once certificates are configured, but no automatic certificate setup is performed.

You have two options:

1. **Use Traefik to manage certificates** (requires manual configuration):
   - Traefik can automatically obtain and renew SSL certificates from Let's Encrypt
   - This requires manual configuration of Traefik's ACME settings
   - See the [Traefik documentation](https://doc.traefik.io/traefik/https/acme/) for detailed setup instructions

2. **Use a third-party SSL provider** (recommended for simplicity):
   - Use a service like **Cloudflare** to handle SSL/TLS termination
   - Point your domain's nameservers to Cloudflare and enable their proxy/CDN service
   - Traffic is encrypted between users and Cloudflare, then forwarded to your server

**Firewall:**

- Port 80: Required for HTTP traffic (must be accessible from internet)
- Port 443: Required for HTTPS traffic (if SSL is configured, must be accessible from internet)

## Architecture

### Application services

- **frontend**: Serves the built SPA (static assets); Traefik routes `/` here
- **api**: Swarm HTTP API on `/api` (port 4000 in the container)
- **websocket**: Swarm service for WebSocket traffic on port 4001; Traefik `/ws` goes via Swarm **ws-router** + Redis placement ([docs/swarm/WS_ROUTER.md](docs/swarm/WS_ROUTER.md)). Sticky `eip_ws_affinity` is fallback only.
- **ws-router**: Swarm singleton; tenant → websocket slot placement + reverse-proxy of `/ws` upgrades
- **worker**: Background jobs (Asynq) consuming Redis queues (Swarm)
- **core**: Swarm control plane (`eip_core`) — schedulers, changestream → JetStream, nested singleton jobs. Primary via Redis `lease:core:primary`; `/ready` on `:19100` is handoff-ready standby (not “holds the lease”). See [docs/swarm/CORE_REBUILD.md](docs/swarm/CORE_REBUILD.md)

### Data and messaging

- **mongo**: Swarm data-fragment MongoDB (single-node replica set `rs0`, auth-first). Desired state via **`eip ensure-mongo`** / Ready — not core boot. See [docs/admintool/ENGINEERING.md](docs/admintool/ENGINEERING.md)
- **redis**: Swarm data-fragment Redis (password-protected; also used by Asynq and the WebSocket layer)
- **nats**: Swarm data-fragment NATS with JetStream (`-js`); monitoring HTTP on `:8222`
- **seaweedfs**: Swarm data-fragment object store (`static-data*` buckets via `EnsureS3` / `objectstore`); S3 API on overlay only

### Edge and operations

- **traefik**: Swarm service `eip_traefik`; publishes `:80` / `:443` / `:81` via **ingress** on overlay `eip` (Docker Desktop localhost OK). See [docs/swarm/TRAEFIK.md](docs/swarm/TRAEFIK.md)
- **asynqmon** (optional UI): Asynq queue browser/metrics; see stack / compose for how ports are published

### Observability stack

These run on the same external `eip` network ([docs/swarm/NETWORK.md](docs/swarm/NETWORK.md)):

- **alloy**: Unified telemetry agent — OTLP logs from Go services → Loki; Docker stdout logs → Loki for frontend/infra via **`alloy-docker-proxy`**. Config embedded in eip (`admintool/internal/kit/obs/alloy/config.alloy`; `LOG_LEVEL` env read at Alloy startup)
- **nats-exporter** / **redis-exporter** / **mongodb-exporter**: Scrapes into Prometheus
- **prometheus**: Metrics TSDB on Swarm **data** fragment (`eip_prometheus`)
- **loki**: Log storage; Alloy pushes container stdout logs with `compose_service` labels
- **grafana**: Dashboards from embedded eip configs; login uses `GRAFANA_ADMIN_*` from `.env`. Local `eip dev`: http://127.0.0.1/grafana via Traefik. Public `eip up`: unpublished by default — use Tailscale/tunnel to `grafana:3000` on `eip`
- **node_exporter**: Host metrics on `:9100`

### Ports

- **80**: HTTP
- **443**: HTTPS (if SSL certificates are configured)

## Updating the Application

```bash
./eip update
```

Typical order: host binary → stack YAML from the binary’s baked kit branch → image reconcile. Narrow flags: `--binary-only`, `--stacks-only`, `--images-only`. Details: [PRERELEASE.md](docs/admintool/PRERELEASE.md).

## Maintenance

### Viewing Logs

```bash
./eip logs                  # interactive / list
./eip logs api -f
```

Prefer **`eip logs`** over raw Docker. Go services log via **OTLP → Alloy → Loki** by default. Stdout mirror is on when `ENVIRONMENT=development` (or `LOG_STDOUT=true`); set `LOG_STDOUT=false` to disable. For filterable JSON logs by service, use **Grafana → Loki** when that stack is running.

**Log Levels:**

Log verbosity in **Loki** (Go services via OTLP) is controlled by **`LOG_LEVEL` on the Alloy container** in your `.env` file. Go apps export all levels; Alloy filters before Loki. Valid values: `debug`, `info` (default), `warn` / `warning`, `error`.

To change what appears in Grafana/Loki, edit `LOG_LEVEL` in `.env` and restart Alloy (Compose observability path) or re-apply via your usual day-2 flow.

### Stopping the stack

```bash
./eip shutdown -y
```

Keeps data volumes. Start again with `./eip up` (or `./eip` TUI → Start).

## Advanced Configuration

### Development Mode

For a **full git clone** (local bake):

```bash
./eip dev
```

Builds local images and deploys the Swarm stack with local tags. Day-2 code rolls: `eip rebuild`. Prefer this over legacy `make dev`.

Prerelease soak / channel pins: [PRERELEASE.md](docs/admintool/PRERELEASE.md).

### Migrating from Make

The Makefile and Make script trees are **gone**. Use **eip-bootstrap** + `eip`. Day-2 refresh: **`eip update`**. Verb map: [MAKE.md](docs/swarm/MAKE.md).

## Support

For issues or questions:

- Check logs: `./eip logs api -f` (or Grafana → Loki)
- Review this deployment guide and [docs/admintool/ENGINEERING.md](docs/admintool/ENGINEERING.md)

## Quick Reference

```bash
# Fresh Public install
curl -fsSL \
  "https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/eip-bootstrap.sh" \
  | bash -s -- ~/eip
cd ~/eip
./eip init          # edit .env after
./eip up

# Day-2
./eip secrets       # .env → Swarm secrets
./eip sync          # eip.config.yaml → capacity / ports / paths
./eip update        # binary / stacks / images
./eip logs api -f
./eip cli list          # core tasks (or interactive: ./eip cli)
./eip shutdown -y

# Local development (git clone)
./eip dev
./eip rebuild
```
