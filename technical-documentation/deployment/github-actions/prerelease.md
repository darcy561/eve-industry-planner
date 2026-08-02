# Prerelease publish (GitHub Actions)

CI SoT for **staging and feature-branch** publish via [`publish-prerelease.yml`](../../../.github/workflows/publish-prerelease.yml). Builds from a chosen git ref and pushes artefacts onto the same **channel names** the Deployment Tool uses for bootstrap / `eip update` / `.env` `APP_VERSION`.

Operator knobs and tracks → [release-channels.md](../deployment-tool/cli/release-channels.md). Public ships → [public.md](./public.md).

## Channels ↔ Deployment Tool

Publish writes the floating tags and Release names that map 1:1 to Deployment Tool channel strings (`kit.Channel` / bootstrap `--release` / floating `APP_VERSION`):

| CI publish (this workflow) | Deployment Tool use |
|----------------------------|---------------------|
| Release + image float **`prerelease`** | Staging track — `--release prerelease`; Setup may preset `APP_VERSION=prerelease` when binary channel is that float |
| Release + image float **`prerelease-<slug>`** | Feature track — e.g. `--release prerelease-swarm-my-feature`; `APP_VERSION=prerelease-swarm-my-feature` |
| Image/Release also **`prerelease-development`** (when ref is `Development`) | Same commit as generic `prerelease`; alternate float name |
| Pin **`0.0.0-prerelease.<slug>.<sha7>`** | Immutable publish artefact (image tag / Release asset version) — not a bootstrap / Setup floating default |
| Baked **`kit.Channel=prerelease-<slug>`** | `eip update` binary channel when no override |
| Baked **`kit.KitBranch=<branch>`** | `eip init` / Setup / `eip update --stacks-only` fetch stack YAML from that branch tip |

Public track (`cli` / `cli-v*` / semver `APP_VERSION`) is owned by [public.md](./public.md), not this workflow.

## What a run produces

Manual `workflow_dispatch` only (not on every push). Input `publish` selects the artefact set:

| `publish` | Result |
|-----------|--------|
| **`binary`** (default) | GitHub Release(s) with Deployment Tool CLI assets (`eip-*`, checksums), marked `prerelease: true`, tagged with the channel floats above. |
| **`containers`** | GHCR app images (api, websocket, worker, core, frontend, ws-router) tagged with the pin + channel floats (generic `prerelease` only when the ref is `PRERELEASE_BRANCH`). |
| **`both`** | Binary + containers from the same commit. |

```bash
gh workflow run "Publish prerelease" --ref swarm/my-feature -f publish=binary
gh workflow run "Publish prerelease" --ref Development -f publish=containers
```

Containers need **`GHCR_TOKEN`**. Repo association uses OCI `org.opencontainers.image.source`.

## Tag layout

Slug = branch name lowercased with `/` → `-` (e.g. `swarm/my-feature` → `swarm-my-feature`).

### Staging branch (`Development`)

Repo var `PRERELEASE_BRANCH` (default **`Development`**) is the only ref that moves the **generic** floating channel:

| Kind | Value | Deployment Tool |
|------|--------|-----------------|
| Generic floating | `prerelease` | `--release prerelease` / `APP_VERSION=prerelease` |
| Branch floating | `prerelease-development` | Same commit; channel `prerelease-development` |
| Pin | `0.0.0-prerelease.development.<sha7>` | Pin only (not a floating channel default) |

### Feature branch (e.g. `swarm/my-feature`)

| Kind | Value | Deployment Tool |
|------|--------|-----------------|
| Branch floating | `prerelease-swarm-my-feature` | `--release prerelease-swarm-my-feature` / matching `APP_VERSION` |
| Pin | `0.0.0-prerelease.swarm-my-feature.<sha7>` | Pin only |
| Generic `prerelease` | unchanged | Staging channel stays on `PRERELEASE_BRANCH` publishes |
