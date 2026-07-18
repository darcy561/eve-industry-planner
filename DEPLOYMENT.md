# Deployment Guide

## Requirements

Before deploying, ensure you have the following:


### System Requirements

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher (or `docker compose` plugin)
- **Operating System**: **Linux** is typical for production servers. **Windows** is supported for local installs using **Docker Desktop** (often with the WSL2 backend) and **Git Bash** from [Git for Windows](https://git-scm.com/download/win)—the repository `Makefile` explicitly targets `Git Bash` on Windows so `make up` / `make dev` work the same way. You still need a `make` binary available in that environment (e.g. install via [Chocolatey](https://chocolatey.org/) `choco install make`, [Scoop](https://scoop.sh/), or use **WSL2** and follow the Linux steps there). **macOS** usually works with Docker Desktop and the system or Homebrew `make`.
- **Make**: Required for deployment commands. On Linux: `sudo apt-get install make` or `sudo yum install make` / `dnf install make`
- **curl or wget**: Required for downloading files
- **tar**: Required to extract the GitHub branch archive (standard on Linux/macOS; available in Git Bash on Windows)
- **rsync** (optional): If present, `scripts/` and `observability/` are mirrored exactly with `--delete`; otherwise files are copied without removing extras upstream deleted
- **Disk Space**: At least 5GB free (for images, volumes, and data)
- **RAM**: Minimum 2GB, recommended 4GB+
- **CPU**: 2+ cores recommended

### Network Requirements
**For Production with Custom Domain:**
- **Domain name**: A registered domain name (e.g., `example.com`)
- **DNS access**: Ability to create DNS A records pointing to your server
- **Public IP**: Server must have a public IP address
- **Port 80**: Must be accessible from the internet (for HTTP traffic)
- **Port 443**: Must be accessible from the internet (for HTTPS traffic, if SSL is configured)

## Overview

This guide covers deploying the EVE Industry Planner application using Docker Compose. The application supports both localhost development and production deployment.

## Quick Start

### Step 1: Create a directory and download the Makefile

```bash
mkdir -p ~/your_chosen_directory
cd ~/your_chosen_directory

curl -L -f -o Makefile \
  "https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/Makefile"
```

On **Windows (Git Bash)** use a path you can write to (e.g. under your user profile) instead of `~` if that does not resolve as expected.

### Step 2: Run `make up` (bootstrap)

```bash
make up
```

This target chains **`download-setup-scripts`** → **`ensure-keyfile`** → **`ensure-env`** → **`ensure-refresh-token-key`** → **`docker compose up -d`** (see the `Makefile`).

**First-time deploy (no `.env` yet):** `scripts/ensure-env.sh` downloads **`env.example`** from the **Public** branch into `.env`, auto-generates database/redis secrets where needed, then **stops with a non-zero exit** and tells you to edit `.env` and run **`make up` again**. Docker containers **do not start** on that first successful bootstrap pass. You may be prompted to type **`YES`** after backing up **`AUTHZ_HMAC_KEY`**—use an **interactive** terminal for that step.

**If `.env` already exists** (e.g. you restored a backup), `ensure-env` does nothing and **`make up` proceeds straight to `docker compose up -d`**.

### Step 3: Configure `.env` and required files

Edit `.env` with your real values (SSO, domains, optional Sentry, Grafana passwords, etc.). See the comments in `.env` / `env.example`.

Place **Firebase Admin** JSON files where **`docker-compose.yml`** expects them (default: **`adminSDK.json`** and **`adminSDKLive.json`** in the same directory as the Makefile), or change the volume mounts.

### Step 4: Run `make up` again to start the stack

```bash
make up
```

With `.env` in place, this completes **`ensure-*`** and starts **all** services with **`docker compose up -d`**.

## Environment Configuration

For full variable documentation, see `env.example`. In practice you will configure:

- **Frontend / client**: EVE Online SSO, optional Google Analytics, and build-time options described in that file
- **Backend**: MongoDB and Redis credentials, NATS, auth and JWT settings, optional Sentry, optional Grafana admin user/password for the bundled stack
- **Observability**: `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` (and similar) are documented under the Grafana section in `env.example`

`make up` runs `ensure-env` and related scripts so a starting `.env` is created from `env.example` when missing; always review and set secrets before production use.

**Mount files:** `docker-compose.yml` expects Firebase Admin JSON files in the deployment directory (e.g. `adminSDK.json` and `adminSDKLive.json` mounted into **api**, **worker**, and **core**). Provide those files or adjust the volume paths in your override/compose file.

## Access

- **Site:** `http://yourdomain.com` (or `https://yourdomain.com` if SSL is configured)

**SSL configuration**

If you want to use HTTPS, you must set up the domain and SSL certificates yourself. Traefik will route traffic on port 443 once certificates are configured, but no automatic certificate setup is performed.

You have two options:

1. **Use Traefik to manage certificates** (requires manual configuration):
   - Traefik can automatically obtain and renew SSL certificates from Let's Encrypt
   - This requires manual configuration of Traefik's ACME (Automatic Certificate Management Environment) settings
   - You'll need to configure Traefik with your Let's Encrypt account details and DNS/HTTP challenge settings
   - See the [Traefik documentation](https://doc.traefik.io/traefik/https/acme/) for detailed setup instructions
   - This approach gives you full control but requires more configuration

2. **Use a third-party SSL provider** (recommended for simplicity):
   - Use a service like **Cloudflare** to handle SSL/TLS termination
   - Cloudflare provides free SSL certificates and handles all certificate management automatically
   - Simply point your domain's nameservers to Cloudflare and enable their proxy/CDN service
   - Traffic will be encrypted between users and Cloudflare, then forwarded to your server
   - This is the easiest option and requires no certificate management on your server

**Firewall:**

- Port 80: Required for HTTP traffic (must be accessible from internet)
- Port 443: Required for HTTPS traffic (if SSL is configured, must be accessible from internet)

## Architecture

### Application services

- **frontend**: Serves the built SPA (static assets); Traefik routes `/` here
- **api**: HTTP API on `/api` (port 4000 in the container)
- **websocket**: Separate service for WebSocket traffic on `/ws` (port 4001 in the container), with optional sticky sessions for multiple replicas
- **worker**: Background jobs (Asynq) consuming Redis queues
- **core**: Central background processing (e.g. schedulers, change streams, shared data prep); **api** and **websocket** wait for **core** to be healthy before starting

### Data and messaging

- **mongo**: MongoDB (single-node replica set, `rs0` by default)
- **redis**: Redis (password-protected; also used by Asynq and the WebSocket layer)
- **nats**: NATS with JetStream enabled (`-js`) for internal messaging; monitoring HTTP on `:8222`

### Edge and operations

- **traefik**: Reverse proxy and TLS entrypoints (80/443), Docker provider; Prometheus metrics on internal `:8082` (`job=traefik`); admin UI on host `:81` (`/dashboard/`); stdout access/app logs → Alloy → Loki (**Traefik** metrics + **Traefik · logs** Grafana dashboards)
- **asynqmon** (optional UI): Asynq queue browser/metrics; see `docker-compose.yml` for how ports are published (default pattern binds to a specific host IP for internal/VPN access)

### Observability stack

These run on the same `eip` network and are defined in `docker-compose.yml`:

- **alloy**: Unified telemetry agent — OTLP logs from Go services → Loki; Docker stdout logs → Loki for frontend/infra; OTLP metrics → Prometheus. Config: `observability/alloy/config.alloy` (`LOG_LEVEL` env read at Alloy startup)
- **nats-exporter**: Scrapes NATS `:8222` into Prometheus metrics on `:7777` (`-prefix=nats`); powers **NATS Server** / **NATS JetStream** Grafana dashboards
- **redis-exporter**: Scrapes Redis INFO into Prometheus on `:9121`; powers **Redis** Grafana dashboard
- **mongodb-exporter**: Scrapes MongoDB into Prometheus on `:9216` (`--compatible-mode`); powers **MongoDB** Grafana dashboard
- **prometheus**: Metrics TSDB; scrapes asynqmon, nats-exporter, redis-exporter, and mongodb-exporter; receives app OTLP metrics from Alloy remote write
- **loki**: Log storage; Alloy pushes container stdout logs with `compose_service` labels for dashboards such as **Core · logs**, **API · logs**, etc.
- **grafana**: Dashboards from `observability/grafana/provisioning`; login uses `GRAFANA_ADMIN_*` from `.env` (on first bootstrap, `ensure-env.sh` generates `GRAFANA_ADMIN_PASSWORD` like other secrets unless you set it explicitly)
- **node_exporter**: Host CPU/memory/disk/network metrics on `:9100`; scraped by Prometheus (`job=node`); **Host** Grafana dashboard

### Ports

- **80**: HTTP
- **443**: HTTPS (if SSL certificates are configured)


## Updating the Application

To update the application to the latest version:

```bash
# Step 1: Update all files from GitHub (Makefile, compose files, scripts, observability)
make update-files

# Step 2: Restart services to apply updates
make up
```

This will:
1. Update the Makefile from GitHub, then replace `docker-compose.yml`, the entire `observability/` tree (including `observability/alloy/config.alloy`), and `scripts/` from a **single Public branch tarball**
2. Restart **Alloy** when the stack is already running (refreshes Docker log tailers after observability config changes)
3. Pull the latest container images when you run `make up` or `make dev`
4. Restart all services with the updated configuration when you run `make up` or `make dev` (both targets also restart Alloy after bringing services up)

## Maintenance

### Viewing Logs

```bash
docker compose logs -f
```

Stream a single service (examples): `docker compose logs -f core` or `docker compose logs -f api`. Go services log via **OTLP → Alloy → Loki** by default (`LOG_STDOUT=true` mirrors to container stdout). For filterable JSON logs by service (`compose_service`) and other fields, use **Grafana → Loki** when Grafana/Alloy/Loki from `docker-compose.yml` are running.

**Log Levels:**

Log verbosity in **Loki** (Go services via OTLP) is controlled by **`LOG_LEVEL` on the Alloy container** in your `.env` file. Go apps export all levels; Alloy filters before Loki. Valid values:

- `debug` — store all log levels in Loki
- `info` — default; drops debug from Loki ingest
- `warn` or `warning` — warnings and errors only
- `error` — errors only

To change what appears in Grafana/Loki, edit `LOG_LEVEL` in `.env` and restart Alloy:

```bash
docker compose restart alloy
```

No need to restart api, core, worker, or websocket for log level changes.

### Restarting Services

```bash
docker compose restart
```

### Stopping Services

```bash
docker compose down
```

## Advanced Configuration

### Development Mode

For development users with a **full git clone** (not the Makefile-only `make up` layout):

```bash
make dev
```

`docker-compose.dev.yml` lives in the repository alongside the source; it is **not** downloaded by `download-setup-scripts` or `make update-files`. This target runs `download-setup-scripts` first so `docker-compose.yml` and `observability/` match **Public**, then builds local images and applies the dev overlay.

To refresh deploy-related files after upstream changes:

```bash
make update-files
make dev
```

There is no per-file manifest: the archive flow refreshes **whole directories** so new dashboards or config files appear automatically when you merge to **Public**.

## Support

For issues or questions:

- Check logs: `docker compose logs -f`
- Review this deployment guide

## Quick Reference

```bash
# Start services: downloads missing compose/scripts/observability if needed; creates .env on first run
# (first run may exit after creating .env — edit .env, then run again)
make up

# Update all files from GitHub (restarts Alloy if stack is up), then restart services
make update-files
make up

# Development mode (for local development only)
make dev

# Show help
make help
```
