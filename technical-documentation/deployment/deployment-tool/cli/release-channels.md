# Release channels (bootstrap & operator)

Operator SoT for prerelease vs Public tracks. How CI **publishes** those channel names → [prerelease.md](../../github-actions/prerelease.md) / [public.md](../../github-actions/public.md).

Three isolated tracks. Pick them with **two knobs** (different stores):

| Knob | Selects |
|------|---------|
| Bootstrap `--release` / `-Release` | Host **binary** GitHub Release tag |
| `.env` **`APP_VERSION`** | App **images** on GHCR (and, when it is a floating `prerelease*`, can also steer `eip update` binary) |

## Channels ↔ CI publish

| You choose (Deployment Tool) | Published by | Artefacts |
|------------------------------|--------------|-----------|
| `--release prerelease` / `APP_VERSION=prerelease` | [prerelease.md](../../github-actions/prerelease.md) from **`Development`** (`PRERELEASE_BRANCH`) | Release + GHCR float `prerelease` (+ `prerelease-development`) |
| `--release prerelease-<slug>` / matching `APP_VERSION` | [prerelease.md](../../github-actions/prerelease.md) from that feature branch | Release + GHCR float `prerelease-<slug>` only |
| Baked `kit.Channel` / `kit.KitBranch` on a prerelease binary | Same prerelease workflow (`binary` / `both`) | ldflags set at publish; stacks from `KitBranch` tip |
| `--release cli` (default) / semver `APP_VERSION` / `:latest` | [public.md](../../github-actions/public.md) from **`Public`** | Floating Release `cli` + `cli-v*`; GHCR semver / `:latest` |

Immutable pins `0.0.0-prerelease.<slug>.<sha7>` are CI publish tags only — use the floating channel names above for bootstrap / Setup defaults.

| Track | Branch | App tag (`APP_VERSION`) | Binary Release tag | Use when |
|-------|--------|-------------------------|--------------------|----------|
| **Staging (generic)** | **`Development`** | `prerelease` | `prerelease` (+ also `prerelease-development`) | Integration queue before Public |
| **Feature** | e.g. `swarm/my-feature` | `prerelease-<slug>` | `prerelease-<slug>` only | Branch-local soak |
| **Public** | **`Public`** | `X.Y.Z` / `:latest` | `cli` / `cli-v*` | Live |

## Containers vs binary (same track idea, different stores)

| What | Store | Knob |
|------|--------|------|
| App images | GHCR `…-<svc>:${APP_VERSION}` | `.env` **`APP_VERSION`** (Setup default = baked prerelease channel only) |
| Deployment Tool CLI binary | GitHub Release assets | Baked **`kit.Channel`** → `eip update`; stacks from baked **`kit.KitBranch`** |
| Stack YAML | Git branch tip (raw) | `eip update` (not on Releases) |

Prerelease publish bakes `kit.Channel=prerelease-<slug>` and `kit.KitBranch=<branch>`. Public CLI publish bakes `Channel=cli` and `KitBranch=Public` — Setup does **not** preset `APP_VERSION` from `cli`.

## Bootstrap release tag

Bootstrap downloads **only** the host binary. Stack YAML is fetched later by **`eip init`** / TUI Setup from the binary’s baked **`kit.KitBranch`**.

```bash
# Public (default) — binary from Release tag cli
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip

# Named prerelease (KitBranch is baked into that binary)
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip \
  --release prerelease-swarm-my-feature

# Development staging
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip --release prerelease
```

Windows: `.\eip-bootstrap.ps1 -Path D:\eip -Release prerelease-swarm-my-feature` (`-Force` to switch binary).

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

Full public bring-up narrative: [guide.md](../../guide.md). Day-2 ship verbs: [verbs.md](./verbs.md).

## Knob outcomes

| You set | You get |
|---------|---------|
| `APP_VERSION=prerelease` | Development images only |
| `APP_VERSION=prerelease-swarm-…` | That branch only |
| `APP_VERSION=1.2.3` / major.minor | Public images only |
| baked / default binary channel | Release tag `cli` (Public) or `prerelease*` (staging / feature) |
