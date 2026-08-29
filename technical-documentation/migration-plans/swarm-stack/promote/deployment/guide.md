# Deployment Guide

Public bring-up for a host: bootstrap the **Deployment Tool** CLI → `eip init` → edit `.env` → `eip up`. Bring-up internals → [deploy.md](./deployment-tool/cli/deploy.md). Verbs → [verbs.md](./deployment-tool/cli/verbs.md). Channels → [release-channels.md](./deployment-tool/cli/release-channels.md). CI publish → [prerelease.md](./github-actions/prerelease.md) / [public.md](./github-actions/public.md).

## Requirements

### System

- **Docker** 20.10+ with Swarm (`docker swarm init` on first bring-up if needed)
- **OS:** Linux typical for production; Windows = Docker Desktop (often WSL2) + PowerShell bootstrap; macOS = Docker Desktop
- **curl** (or PowerShell `irm`) for bootstrap / Release assets
- **Disk** ≥ 5GB free; **RAM** 2GB min (4GB+ recommended); **CPU** 2+ cores recommended

### Network (custom domain)

- Domain + DNS A record to the host’s public IP
- Ports **80** / **443** reachable from the internet (HTTPS once certificates are in place)

## Quick Start

### 1. Bootstrap the CLI binary

Creates a deploy directory and downloads the CLI from GitHub Release floating tag **`cli`** (Public). Stack YAML and `.env` come from `eip init` / TUI Setup — not from bootstrap.

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

Other release tags → [release-channels.md](./deployment-tool/cli/release-channels.md) (`--release` / `-Release`).

### 2. Initialise config

```bash
./eip init
# or TUI: ./eip
```

Writes missing stack YAML, `.env`, and `eip.config.yaml` from Go defaults (`kit/templates`). Auto-generates database/redis secrets where needed. You may be prompted to type **`YES`** after backing up **`AUTHZ_HMAC_KEY`** — use an interactive terminal.

Containers start only on `eip up` / `eip dev`.

### 3. Configure `.env` (and operator YAML)

Edit `.env` with real values (SSO, domains, optional Sentry, Grafana passwords, …). Schema: [`EnvFields`](../../deployment-tool/internal/kit/templates/env/). Secrets SoT → [secrets.md](../stack/secrets.md). Non-secret scale/ports/paths → [config.md](../stack/config.md) (`eip.config.yaml`).

### 4. Bring up the stack

```bash
./eip up
```

Deploys the Swarm **data** fragment (mongo / redis / nats / SeaweedFS) and **app** fragment (Traefik, api, websocket, worker, ws-router, core, frontend, capacity-controller), then data-plane Ready (`EnsureS3` ‖ `EnsureMongo`). Optional obs (including Prometheus) via `addons.observability.enabled`. Topology → [stack.md](../stack/stack.md), [network.md](../stack/network.md).

**Local bake** (git clone): `./eip dev` instead of `eip up`.

## Day-2 changes

| You changed | Run |
|-------------|-----|
| Secrets used by Swarm apps (SSO, HMAC, S3 keys, app DB passwords, …) | **`eip secrets`** — [secrets.md](../stack/secrets.md) |
| Operator YAML (`eip.config.yaml`) | **`eip sync`** — [config.md](../stack/config.md) |
| Data-plane secrets / mongo keyfile / indexes | Update `.env` then **`eip secrets`**; keyfile: `eip restore-mongo-keyfile` / `eip rekey-mongo`; indexes without full up: **`eip ensure-mongo`** — [deploy.md](./deployment-tool/cli/deploy.md), [verbs.md](./deployment-tool/cli/verbs.md) |
| Host binary / stack YAML / images | **`eip update`** (`--binary-only` / `--stacks-only` / `--images-only`) — [verbs.md](./deployment-tool/cli/verbs.md), [release-channels.md](./deployment-tool/cli/release-channels.md) |

## Access

- **Site:** `http://yourdomain.com` (or `https://…` once TLS is configured)
- **Host publish:** Traefik only — ports **80** / **443** (/ **81** dashboard) — [traefik.md](../stack/traefik.md)

TLS is operator-owned (Traefik ACME or an upstream terminator such as Cloudflare). Traefik routes `:443` when certificates are in place; this guide does not ship automatic cert setup.

## What runs

Fragments and membership → [stack.md](../stack/stack.md). Overlays → [network.md](../stack/network.md). Edge → [traefik.md](../stack/traefik.md).

| Layer | Services (short) |
|-------|------------------|
| **Data** | mongo, redis, nats, seaweedfs |
| **App** | traefik, frontend, api, websocket, worker, ws-router, core, capacity-controller |
| **Obs** (optional) | prometheus, grafana, loki, alloy, exporters, asynqmon, node_exporter — toggle `addons.observability.enabled` → [config.md](../stack/config.md) |

Service behaviour: [ws-router](../backend/ws-router/ws-router.md), [websocket](../backend/websocket/websocket.md), [worker](../backend/worker/worker.md), [core](../backend/core/core.md), [capacity-controller](../stack/capacity-controller.md).

## Updating

```bash
./eip update
```

Order: host binary → stack YAML from baked `kit.KitBranch` → image reconcile. Flags: `--binary-only`, `--stacks-only`, `--images-only`. Channels → [release-channels.md](./deployment-tool/cli/release-channels.md).

## Maintenance

```bash
./eip logs                  # list / pick
./eip logs api -f
./eip shutdown -y           # keeps volumes; start again with eip up / TUI Start
```

Prefer **`eip logs`**. With the obs addon on, Go services log OTLP → Alloy → Loki; filter in Grafana. Loki verbosity for those pipelines uses Alloy **`LOG_LEVEL`** (restart Alloy after changes) — [config.md](../stack/config.md) / obs fragment.

## Local development (git clone)

```bash
./eip dev       # bake + deploy
./eip rebuild   # day-2 local image roll
```

Channels / soak tags → [release-channels.md](./deployment-tool/cli/release-channels.md).

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
./eip secrets
./eip sync
./eip update
./eip logs api -f
./eip cli list
./eip shutdown -y

# Local development (git clone)
./eip dev
./eip rebuild
```
