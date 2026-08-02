# Public publish (GitHub Actions)

CI SoT for **live Public** ships from the **`Public`** branch. Two manual workflows bump semver from the live tip and publish the channel names the Deployment Tool uses for default bootstrap / `eip update` / semver `APP_VERSION`.

Operator knobs and tracks → [release-channels.md](../deployment-tool/cli/release-channels.md). Staging / feature publish → [prerelease.md](./prerelease.md).

## Channels ↔ Deployment Tool

| CI publish (this doc) | Deployment Tool use |
|-----------------------|---------------------|
| Floating Release **`cli`** | Default `--release` / baked `kit.Channel=cli` → `eip update` binary |
| Pin Release **`cli-vX.Y.Z`** | Immutable CLI asset tag for that ship |
| Baked **`kit.KitBranch=Public`** | `eip init` / Setup / `eip update --stacks-only` fetch stack YAML from Public tip |
| GHCR **`X.Y.Z`**, **`X.Y`**, **`X`**, **`:latest`** | `.env` `APP_VERSION` for app images (usually full semver or `latest`) |
| Notes Release **`app-vX.Y.Z`** | Changelog only — not a binary channel and not an image pull tag |

Setup does **not** preset `APP_VERSION` from `Channel=cli` (unlike prerelease floats).

## What a run produces

Manual `workflow_dispatch` only. App and CLI are **separate** workflows (bump independently). Both resolve the next version from **live** tags at run time (`patch` / `minor` / `major`), checkout **Public**, and require non-empty release notes (cleared on Public after success).

| Product | Workflow | Result |
|---------|----------|--------|
| **App images** | [`publish-containers-public.yml`](../../../.github/workflows/publish-containers-public.yml) | GHCR images for api, websocket, worker, core, frontend — tags `X.Y.Z`, `X.Y`, `X`, `latest`. Notes-only GitHub Release `app-vX.Y.Z`. Requires Sentry DSN on the Public environment. Optional **confirm overwrite** if that semver already exists on GHCR. |
| **CLI binary** | [`deployment-tool.yml`](../../../.github/workflows/deployment-tool.yml) → **Run workflow** bump | Builds `eip-{os}-{arch}` + `SHA256SUMS`; uploads pin `cli-vX.Y.Z` and refreshes floating **`cli`** (`make_latest: false`, `prerelease: false`). Bakes `kit.Channel=cli` and `kit.KitBranch=Public`. First ship with no `cli-v*` history → **`1.0.0`**. |

```bash
# Actions UI: run on Public, or:
gh workflow run "Publish Public containers" --ref Public -f bump=patch
gh workflow run "deployment-tool" --ref Public -f bump=patch
```

**Local check (no publish):** `bash .github/scripts/semver-bump_test.sh` — fixture tags / mocked GHCR; no docker pull, no Release upload.

Containers need **`GHCR_TOKEN`**. Repo association uses OCI `org.opencontainers.image.source`. **New container packages need a one-time GitHub UI “Public”** (REST PATCH visibility 404s — GitHub limitation).

## Tag layout

### App (GHCR)

| Kind | Value | Deployment Tool |
|------|--------|-----------------|
| Full semver | `X.Y.Z` | Typical `APP_VERSION` |
| Minor / major aliases | `X.Y`, `X` | Optional float pulls |
| Floating | `latest` | `APP_VERSION=latest` |
| Notes Release | `app-vX.Y.Z` | Changelog only |

### CLI (GitHub Releases)

| Kind | Value | Deployment Tool |
|------|--------|-----------------|
| Floating | `cli` | Default bootstrap / `eip update` |
| Pin | `cli-vX.Y.Z` | Immutable binary ship |
| Bake | `Channel=cli`, `KitBranch=Public` | Binary channel + stack branch |
