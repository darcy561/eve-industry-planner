# Prerelease channel (Development staging)

Three isolated tracks — you choose one with `APP_VERSION` / `EIP_UPDATE_TAG`. Nothing crosses unless you set it.

| Track | Branch | GHCR / eip tag | Use when |
|-------|--------|----------------|----------|
| **Staging (generic)** | **`Development`** | `prerelease` (+ also `prerelease-development`) | Integration queue before Public |
| **Feature / swarm** | e.g. `swarm/hard-cutover` | `prerelease-<slug>` only | Branch-local soak |
| **Public** | **`Public`** | `X.Y.Z`, `:latest`, major.minor | Live — [publish-containers-public.yml](../../.github/workflows/publish-containers-public.yml) |

Public publish never writes `prerelease*`. Prerelease publish never writes `:latest` / semver aliases.

## Containers vs binary (same tag name, different stores)

| What | Store | Knob |
|------|--------|------|
| App images | GHCR `…-<svc>:${APP_VERSION}` | `.env` **`APP_VERSION`** → `eip up` |
| Host `eip` tool | GitHub Release assets | Same **`APP_VERSION`** when it is `prerelease` / `prerelease-*` → `eip update-binary` (optional override: `EIP_UPDATE_TAG`) |

Set `APP_VERSION` once in Setup / `.env` (e.g. `prerelease-swarm-hard-cutover`). No shell env needed for Update tool. Public semver `APP_VERSION` still uses `/releases/latest` for the host binary.

Prerelease GitHub Releases use **`prerelease: true`**, so they never become `/releases/latest` (Public’s future binary channel).

## Tag layout

Push **`Development`** (repo var `PRERELEASE_BRANCH`, default `Development`):

| Kind | Value |
|------|--------|
| Generic floating | `prerelease` |
| Branch floating | `prerelease-development` |
| Pin | `0.0.0-prerelease.development.<sha7>` |

Push **`swarm/my-feature`** (or any other non-Development staging branch in the workflow filter):

| Kind | Value |
|------|--------|
| Branch floating | `prerelease-swarm-my-feature` |
| Pin | `0.0.0-prerelease.swarm-my-feature.<sha7>` |
| Generic `prerelease` | **unchanged** |

## Publish

[publish-prerelease.yml](../../.github/workflows/publish-prerelease.yml) is **manual only** (`workflow_dispatch`). Choose what to publish:

| `publish` | Builds |
|-----------|--------|
| **`binary`** (default) | Host `eip` Release assets only (`update-binary` / bootstrap) |
| **`containers`** | GHCR app images only |
| **`both`** | Binary + containers |

```bash
gh workflow run "Publish prerelease" --ref swarm/hard-cutover -f publish=binary
gh workflow run "Publish prerelease" --ref Development -f publish=containers
```

Containers need **`GHCR_TOKEN`**. Repo association uses OCI `org.opencontainers.image.source`. **New container packages need a one-time GitHub UI “Public”** (REST PATCH visibility 404s — GitHub limitation).

## Operator — Development staging (`prerelease`)

```bash
mkdir -p ~/eip && cd ~/eip
curl -fsSL https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Development/eip-bootstrap.sh | bash -s -- .
./eip          # TUI Setup → .env / eip.config.yaml (or: ./eip init)
# .env: EVE SSO; APP_VERSION=prerelease
# optional: ./eip add-path
./eip up
# after another Development publish:
./eip update-binary && ./eip up   # uses APP_VERSION channel
```

## Operator — one feature branch only

```bash
export EIP_KIT_BRANCH=swarm/my-feature
export EIP_CLI_DOWNLOAD_BASE=https://github.com/darcy561/eve-industry-planner/releases/download/prerelease-swarm-my-feature
# bootstrap…
./eip   # Setup: APP_VERSION=prerelease-swarm-my-feature (+ EVE SSO)
./eip up
./eip update-binary   # same APP_VERSION channel — no EIP_UPDATE_TAG needed
```

## No crossover (unless you choose it)

| You set | You get |
|---------|---------|
| `APP_VERSION=prerelease` | Development images only |
| `APP_VERSION=prerelease-swarm-…` | That branch only |
| `APP_VERSION=1.2.3` / live defaults | Public images only |
| `EIP_UPDATE_TAG` unset | `/releases/latest` (Public eip, when published) |
| `EIP_UPDATE_TAG=prerelease` | Development eip only |
