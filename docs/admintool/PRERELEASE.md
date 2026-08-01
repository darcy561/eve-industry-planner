# Prerelease channel (Development staging)

Three isolated tracks — you choose one with `APP_VERSION` / bootstrap `-Release`. Nothing crosses unless you set it.

| Track | Branch | GHCR / eip tag | Use when |
|-------|--------|----------------|----------|
| **Staging (generic)** | **`Development`** | `prerelease` (+ also `prerelease-development`) | Integration queue before Public |
| **Feature / swarm** | e.g. `swarm/hard-cutover` | `prerelease-<slug>` only | Branch-local soak |
| **Public** | **`Public`** | App: `X.Y.Z` / `:latest`; CLI: Release `cli` / `cli-v*` | Live |

Public publish never writes `prerelease*`. Prerelease publish never writes `:latest` / semver aliases or Release tag `cli`.

## Containers vs binary (same channel idea, different stores)

| What | Store | Knob |
|------|--------|------|
| App images | GHCR `…-<svc>:${APP_VERSION}` | `.env` **`APP_VERSION`** (Setup default = baked prerelease channel only) |
| Host `eip` tool | GitHub Release assets | Baked **`kit.Channel`** → `eip update`; stacks from baked **`kit.KitBranch`** |
| Stack YAML | Git branch tip (raw) | `eip update` (not on Releases) |

Prerelease CI sets `-ldflags … kit.Channel=prerelease-<slug> kit.KitBranch=<branch>`. **Public** CLI builds bake `Channel=cli` and `KitBranch=Public` — Setup does **not** preset `APP_VERSION` from `cli`.

Prerelease GitHub Releases use **`prerelease: true`**. Public CLI uses tags `cli-v*` + floating **`cli`** (`make_latest: false`). App changelog Releases are **`app-vX.Y.Z`** (notes only).

## Tag layout

Push **`Development`** (repo var `PRERELEASE_BRANCH`, default `Development`):

| Kind | Value |
|------|--------|
| Generic floating | `prerelease` |
| Branch floating | `prerelease-development` |
| Pin | `0.0.0-prerelease.development.<sha7>` |

Push **`swarm/my-feature`**:

| Kind | Value |
|------|--------|
| Branch floating | `prerelease-swarm-my-feature` |
| Pin | `0.0.0-prerelease.swarm-my-feature.<sha7>` |
| Generic `prerelease` | **unchanged** |

## Publish

[publish-prerelease.yml](../../.github/workflows/publish-prerelease.yml) is **manual only** (`workflow_dispatch`). Choose what to publish:

| `publish` | Builds |
|-----------|--------|
| **`binary`** (default) | Host `eip` Release assets only |
| **`containers`** | GHCR app images only |
| **`both`** | Binary + containers |

```bash
gh workflow run "Publish prerelease" --ref swarm/hard-cutover -f publish=binary
gh workflow run "Publish prerelease" --ref Development -f publish=containers
```

### Public ships (manual bump)

Both resolve the **live** base at run time (never a hardcoded version), then apply `patch` (default) / `minor` / `major`.

| Product | Workflow | Base | First / next |
|---------|----------|------|----------------|
| **App** | [Publish Public containers](../../.github/workflows/publish-containers-public.yml) → bump | highest `app-v*` else GHCR `…-api:latest` label | e.g. live `0.8.23` + patch → `0.8.24` + Release `app-v0.8.24` |
| **CLI** | [admintool](../../.github/workflows/admintool.yml) → **Run workflow** bump | highest `cli-v*` | empty history → **`1.0.0`** once; then bump from that pin + refresh floating `cli` |

Require non-empty [`APP_RELEASE_NOTES.md`](../../APP_RELEASE_NOTES.md) / [`CLI_RELEASE_NOTES.md`](../../CLI_RELEASE_NOTES.md); CI clears the matching file on Public after success. Workflows must be on **Public** before dispatch (release jobs checkout Public tip).

**Local check (no publish):** `bash .github/scripts/semver-bump_test.sh` — fixture tags / mocked GHCR; no docker pull, no Release upload. Can move into a broader CI test workflow later.

Containers need **`GHCR_TOKEN`**. Repo association uses OCI `org.opencontainers.image.source`. **New container packages need a one-time GitHub UI “Public”** (REST PATCH visibility 404s — GitHub limitation).

## Bootstrap release tag

Bootstrap downloads **only** the host binary. Stack YAML is fetched later by **`eip init`** / TUI Setup from the binary’s baked **`kit.KitBranch`**.

```bash
# Public (default) — binary from Release tag cli
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip

# Named prerelease (KitBranch is baked into that binary)
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip \
  --release prerelease-swarm-hard-cutover

# Development staging
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip --release prerelease
```

Windows: `.\eip-bootstrap.ps1 -Path D:\eip -Release prerelease-swarm-hard-cutover` (`-Force` to switch binary).

## Operator — after bootstrap

```bash
./eip init                # missing stacks + .env + eip.config.yaml
./eip                     # or TUI Setup (same; prerelease presets APP_VERSION)
./eip up
./eip update              # binary → stacks → images/reconcile
./eip update --binary-only
./eip update --stacks-only
./eip update --images-only
```

## No crossover (unless you choose it)

| You set | You get |
|---------|---------|
| `APP_VERSION=prerelease` | Development images only |
| `APP_VERSION=prerelease-swarm-…` | That branch only |
| `APP_VERSION=1.2.3` / major.minor | Public images only |
| baked / default binary channel | Release tag `cli` (Public) or `prerelease*` (staging) |
