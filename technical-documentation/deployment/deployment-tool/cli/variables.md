# Deployment Tool — SoT registries & conventions

Do not hardcode parallel copies of these values in screens or menus. Change the SoT, then rebuild lists from helpers.

Conventions → [engineering.md](./engineering.md). Verbs / menu map → [verbs.md](./verbs.md). Channels → [release-channels.md](./release-channels.md). TUI → [../tui/contents.md](../tui/contents.md).

## Product strings

| Value | SoT |
|-------|-----|
| Product name, tagline, CLI name, stack name | [`internal/kit/product.go`](../../../../deployment-tool/internal/kit/product.go) |
| Module / binary folder | [`deployment-tool/`](../../../../deployment-tool/) (`go.mod`, `main.go`) |

## Operator command list

| Value | SoT |
|-------|-----|
| CLI verbs (id, title, short for `--help`) | [`internal/catalog/verbs.go`](../../../../deployment-tool/internal/catalog/verbs.go) |
| Home TUI menu titles / helpers / gating | [`tui/ops`](../../../../deployment-tool/tui/ops/) (`Entries`, `MoreEntries`, `SetupNeeded`, `Allowed`) — plain-language; `Args` keep CLI ids |

When adding a **CLI** verb: update `catalog` first, wire Cobra under `cmd/commands/`, keep Cobra `Short` aligned with `catalog.Verb.Short`. TUI may omit the verb from `tui/ops`, remap the title (e.g. Start → `up`), or nest it under **More** — catalog order ≠ home menu order.

Full **TUI row → CLI verb** map → [verbs.md](./verbs.md). Health gating UX → [home.md](../tui/home.md).

## Document registries (`.env` / `eip.config.yaml`)

| Value | SoT |
|-------|-----|
| `.env` key schema | [`kit/templates/env`](../../../../deployment-tool/internal/kit/templates/env/) (`EnvFields`); secrets apply → [stack/secrets.md](../../../stack/secrets.md); YAML sync surface → [stack/config.md](../../../stack/config.md) |
| `.env` Autogen / Locked / Roll | Same package: **Autogen** under its field, only while unset. Once set: Mongo/Redis usernames+passwords, Grafana password, Authz HMAC lock (no Roll). Rollable: S3 secret + refresh-token AES. AES Roll also bumps hidden `REFRESH_TOKEN_AES_KEY_VERSION` and stashes prior material in `REFRESH_TOKEN_AES_LEGACY_KEYS`. |
| EVE SSO | Required; blank after WriteMissing; ensure / Ready require real values (not empty) |
| `.env` key renames | `EnvField.PreviousKeys` — load migrates old names; Emit writes current keys + preserved unknown section |
| `.env` backups | `cli.env_backup_path` in `eip.config.yaml` (default stem `backups/env/env`): `stem-current.txt` + up to 3 timestamped copies before replace |
| Operator YAML defaults | [`yamldefaults.DefaultConfig`](../../../../deployment-tool/internal/kit/templates/yamldefaults/default.go) |
| Operator YAML edit knobs | [`yamldefaults.ConfigFields`](../../../../deployment-tool/internal/kit/templates/yamldefaults/fields.go) (TUI Settings / Setup Advanced). `cli.env_backup_path` is edited on the env Operator section (Setup writes it first) |
| Write-missing facade | [`kit/templates`](../../../../deployment-tool/internal/kit/templates/) (`WriteMissingEnv` / `WriteMissingConfig` / `CheckOperatorDocs`) |
| Live YAML load / validate / sync / apply | [`internal/config`](../../../../deployment-tool/internal/config/) |
| Deploy-home stack filenames | [`kit.StackFiles`](../../../../deployment-tool/internal/kit/stackupdate.go) (`docker-stack.yml` / `.data.yml` / `.obs.yml`) — init/`eip update` always; `kit.Require` omits obs (addon-gated) |
| Stack YAML fetch / refresh | [`kit.UpdateStacks`](../../../../deployment-tool/internal/kit/stackupdate.go) (`MissingOnly` for init/Setup; full compare for `eip update`) |
| Binary Release channel / kit git branch | [`kit.Channel`](../../../../deployment-tool/internal/kit/channel.go) / `kit.KitBranch` (ldflags); `BinaryChannel()` / `ResolveKitBranch()` — operator narrative → [release-channels.md](./release-channels.md) |
| Required/optional Swarm secret keys from `.env` | [`internal/swarm`](../../../../deployment-tool/internal/swarm/) (`RequiredKeys` / `OptionalKeys`) |
| Per-service secret attach lists | [`docker-stack.yml`](../../../../docker-stack.yml) `secrets:` (discovered by `swarm.DiscoverAttach` / `stack.SecretAttaches`) |
| Expected Swarm service groups + fragments | [`internal/catalog/services.go`](../../../../deployment-tool/internal/catalog/services.go) |
| Dataplane ensure registry / bucket names / mongo specs | [`dataplane.ServiceEnsures`](../../../../deployment-tool/internal/dataplane/), [`s3.AppBuckets`](../../../../deployment-tool/internal/dataplane/s3/), [`mongo.IndexSpecs`](../../../../deployment-tool/internal/dataplane/mongo/) — behaviour → [deploy.md](./deploy.md) |
| Swarm stack / network IDs | `kit.StackName`; external nets from fragment YAML via `stack.ExternalNetworks` (today `eip-core`) — [stack/network.md](../../../stack/network.md) |

TUI **Setup** / **Secrets** build from `EnvFields` + `cli.env_backup_path`; **Settings** / Setup Advanced from `ConfigFields` — do not invent parallel key lists in the UI.

Import direction: `kit` ← `config` ← `templates/env` and `templates/yamldefaults`. Package `config` must not import templates.

## Process flags vs `.env`

| Term | Meaning | Examples |
|------|---------|----------|
| **Process flag** | Set by the TUI on `os/exec` `Cmd.Env` for that child only. Not persisted. Not operator config. | `EIP_FROM_TUI=1`, `EIP_UPDATE_RESUME=1` (TUI relaunch after binary install) |
| **`.env` / config files** | Operator/deployment SoT on disk **in project home**. | `MONGO_PASSWORD`, `eip.config.yaml`, `docker-stack.yml` |

| Value | SoT |
|-------|-----|
| Process flags / process helpers | [`internal/process`](../../../../deployment-tool/internal/process/) |

Never document process flags as `.env` keys; never add them to `EnvFields`. `msg` emit helpers gate on `process.FromTUI()` — do not redefine `EIP_FROM_TUI` elsewhere.

**Docker CLI env** (`DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`) is owned by Docker, not the Deployment Tool. `internal/docker.NewAPIClient` honors it the same way the `docker` CLI does; do not mirror those keys into `.env` / `EnvFields`.

Optional host env (not `.env` / not TUI process flags):

| Env | Role |
|-----|------|
| `EIP_VERBOSE` / `VERBOSE` | docker binary stream for stack deploy / bake |
| `EIP_PULL_PARALLEL` | live image pull concurrency (default `4`, max `16`) |
| `EIP_KIT_BRANCH` | override baked kit git branch for stack YAML fetch |
| `EIP_UPDATE_TAG` | override GitHub Release tag for `eip update` binary |
| `EIP_UPDATE_REPO` | override `owner/name` for Releases / raw stack fetch |

## `eip` / `EIP_` prefix convention

| Surface | Prefix? | Why |
|---------|---------|-----|
| **OS-facing / outside the running tool** | **Yes** (`eip` / `EIP_`) | Shell, process table, foreign env dumps should show ownership. |
| **Internal to the binary** (already inside `eip`) | **No** | Context is already the Deployment Tool. |

**Prefix:** host binary/CLI (`eip doctor`), process flags (`EIP_FROM_TUI`), stdout wire prefix (`EIPMSG `).  
**No prefix:** Go packages (`msg`, `kit`, `status`), message type strings (`pane.status`, `chip.docker`), TUI model fields.

## Project home

**Rule:** project home is the directory that contains the running `eip` / `eip.exe` binary (`internal/kit.Home()`). Stack YAML, `.env`, and `eip.config.yaml` live beside it. Bootstrap installs the binary into that folder on purpose.

A Windows shortcut (or double-click) that targets `…\home\eip.exe` uses that folder as home regardless of shortcut **Start in** / shell cwd. Do not move the binary out of the home.

**`go test` / `go run`:** those tools put the executable under a temp `go-build` tree (or a `*.test` binary). That is not a deploy home, so `Home()` falls back to the process working directory (unit tests `t.Chdir` into a temp root). Installed / `build-host` binaries always use the executable directory.

Optional bare `eip` on PATH: run **`eip add-path`** (symlink; home still resolves via the real binary). `eip add-path --remove` undoes it. Not required for `./eip up` from the home folder.

Local: `.\scripts\deployment-tool\build-host.ps1` writes `eip.exe` at the repo root, so home is the repo root.

Deploy source (`live` / `dev`) is **not** a project-home file. Deploy stamps Swarm label `eip.deploy.source` (`deploy.LabelDeploySource`); `ResolveSource` reads that label only.

Day-2 ship / cold start verbs → [verbs.md](./verbs.md); bring-up → [deploy.md](./deploy.md); channel presets → [release-channels.md](./release-channels.md).

## Dynamic lists (pattern)

```text
SoT package/func  →  helper builds []Item / []Entry  →  ui.NewList(...)
```

Examples: service pickers, document builder sections, More submenu — define once, map with a helper, never duplicate string tables per screen.
