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
| App images | GHCR `…-<svc>:${APP_VERSION}` | `.env` **`APP_VERSION`** (Setup default = baked channel) |
| Host `eip` tool | GitHub Release assets | Baked **`kit.Channel`** at build time → `update-binary`; Setup seeds `APP_VERSION` from the same value |

Prerelease CI sets `-ldflags … kit.Channel=prerelease-<slug>` (and `commands.Version` = immutable pin) so Setup and `update-binary` match the channel. **Public** leaves `kit.Channel` empty — operators set `APP_VERSION` manually; host updates use `/releases/latest`.

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

## Bootstrap channels

```bash
# Development staging
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip --channel Development
# or: --channel prerelease

# Feature / swarm branch
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip --channel swarm/hard-cutover
# or: --channel prerelease-swarm-hard-cutover

# Public (latest eip Release + Public stack YAML)
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip --channel Public

# Switch channel later (re-fetch stacks + binary)
bash eip-bootstrap.sh ~/eip --channel Development --force
```

Windows: `.\eip-bootstrap.ps1 -Path D:\eip -Channel swarm/hard-cutover` (`-Force` to switch).

## Operator — after bootstrap

```bash
./eip          # TUI Setup (prerelease builds preset APP_VERSION from baked channel)
./eip up
./eip update-binary   # same baked / APP_VERSION channel
```

## No crossover (unless you choose it)

| You set | You get |
|---------|---------|
| `APP_VERSION=prerelease` | Development images only |
| `APP_VERSION=prerelease-swarm-…` | That branch only |
| `APP_VERSION=1.2.3` / live defaults | Public images only |
| `EIP_UPDATE_TAG` unset | `/releases/latest` (Public eip, when published) |
| `EIP_UPDATE_TAG=prerelease` | Development eip only |
