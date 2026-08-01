# admintool — variables & lists (single source of truth)

Do not hardcode parallel copies of these values in screens or menus. Change the SoT, then rebuild lists from helpers.

## Product / naming (code)

| Value | SoT |
|-------|-----|
| Product name, tagline, CLI name, stack name | [`admintool/internal/kit`](../../admintool/internal/kit/product.go) |
| Binary / module folder names | [README.md](./README.md) |
| Expected Swarm service groups + fragments | [`admintool/internal/catalog/services.go`](../../admintool/internal/catalog/services.go) |
| Deploy source / inspect / up-dev recipe | [`admintool/internal/deploy`](../../admintool/internal/deploy/) (`Source`, `Inspect`, `Run`) |
| Dataplane Swarm-task wait/poll | [`admintool/internal/dataplane/task`](../../admintool/internal/dataplane/task/) (`ContainerID`, `Running`, `Wait`, `Retry`) — shared poller; ready probes stay in s3/mongo |
| S3 ensure caller entry (Ready / ensure-s3 / init) | [`admintool/internal/dataplane`](../../admintool/internal/dataplane/) (`EnsureS3`) → implementation `s3.Ensure` |
| S3 app bucket names | [`admintool/internal/dataplane/s3`](../../admintool/internal/dataplane/s3/) (`AppBuckets`: `static-data`, `static-data-test`) — keep in sync with `objectstore` / stack `S3_BUCKET` |
| Mongo ensure caller entry (Ready / ensure-mongo / init) | [`admintool/internal/dataplane`](../../admintool/internal/dataplane/) (`EnsureMongo`) → implementation `mongo.Ensure` |
| Mongo preimage collections + application index specs | [`admintool/internal/dataplane/mongo`](../../admintool/internal/dataplane/mongo/) (`PreimageCollections`, `IndexSpecs`) — ensured via `EnsureMongo`; not on core boot |
| Kit file names / `Require` / project home | [`admintool/internal/kit`](../../admintool/internal/kit/) — `Home()` is the directory of the running binary |
| Path writability preflight | [`admintool/internal/kit/writable.go`](../../admintool/internal/kit/writable.go) (`EnsureFileWritable` / `EnsureDirWritable` / `Check*`) |
| Operator docs gate | [`admintool/internal/kit/templates`](../../admintool/internal/kit/templates/) (`CheckOperatorDocs` → env usable + config Validate) |
| Operator YAML Load/Validate/SyncEnv / Sync / WriteYAML | [`admintool/internal/config`](../../admintool/internal/config/) |
| Swarm stack / network IDs | `kit.StackName` / `engine.NetworkName` (`eip-core`); not redefined in TUI |

## Operator command list (code)

| Value | SoT |
|-------|-----|
| `eip` CLI verbs (id, title, short for `--help`) | [`admintool/internal/catalog/verbs.go`](../../admintool/internal/catalog/verbs.go) |
| Home TUI menu titles / helpers / gating | [`admintool/tui/ops`](../../admintool/tui/ops/) (`Entries`, `MoreEntries`, `SetupNeeded`, `Allowed`) — plain-language; `Args` keep CLI ids (`up`, `shutdown`, …) |

When adding a **CLI** verb: update `catalog` first, wire Cobra under `cmd/commands/`, keep Cobra `Short` aligned with `catalog.Verb.Short`. TUI may hide the verb (`tuiHiddenVerbs`), remap the title (e.g. Start → `up`), or nest it under **More** — do not assume the catalog order is the home menu order.

**TUI menu (current):**

| Surface | Rows |
|---------|------|
| Main | **Setup** (if `.env`, `eip.config.yaml`, or `docker-stack*.yml` missing) · Status · Start · Dev · Restart · Rebuild · Stop · Update · **More** |
| More | Secrets · Settings · Logs · Command |
| Hidden from TUI | `doctor`/`probe`, `add-path`, `ensure-mongo`, `ensure-s3`, `restore-mongo-keyfile`, `rekey-mongo` (CLI-only) |
| Not on menu | `secrets` / `sync` apply — Persist auto-queues them; typed Command or CLI for manual |

## TUI theme / layout (code)

| Value | SoT |
|-------|-----|
| Colors, gutters (`HMargin`, `ColGap`) | [`admintool/tui/theme`](../../admintool/tui/theme/) |
| List/panel helpers | [`admintool/tui/ui`](../../admintool/tui/ui/) |
| Home nav / pane helpers | [`admintool/tui/screens/home/nav.go`](../../admintool/tui/screens/home/nav.go) |
| Document Persist / Setup choice | [`admintool/tui/screens/home/docs.go`](../../admintool/tui/screens/home/docs.go) + [`screens/init`](../../admintool/tui/screens/init/) |

## Deploy config (files / registries)

| Value | SoT |
|-------|-----|
| `.env` key schema | [`admintool/internal/kit/templates/env`](../../admintool/internal/kit/templates/env/) (`EnvFields`); apply rules in [docs/swarm/ENV.md](../swarm/ENV.md) |
| `.env` Autogen / Locked / Roll | Same package: Autogen checkbox → generate on Finish; Locked (e.g. DB passwords) read-only once set; TUI **ctrl+r** = pending Roll until Finish (not for Locked DB passwords). Defaults for Autogen fields are empty — never write `auto-generate-me` |
| EVE SSO | Required; blank after WriteMissing; ensure rejects empty or legacy placeholders (`your_eve_oauth_*`) |
| `.env` key renames | `EnvField.PreviousKeys` — load migrates old names; Emit writes current keys + preserved unknown section |
| `.env` backups | `cli.env_backup_path` in `eip.config.yaml` (default stem `eip-env-backup`): `stem-current.txt` + up to 3 timestamped copies before replace |
| Operator YAML defaults | [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go) |
| Operator YAML edit knobs | [`yamldefaults.ConfigFields`](../../admintool/internal/kit/templates/yamldefaults/fields.go) (TUI Settings / Setup Advanced). `cli.env_backup_path` is edited on the env Operator section (Setup writes it first) |
| Write-missing facade | [`kit/templates`](../../admintool/internal/kit/templates/) (`WriteMissingEnv` / `WriteMissingConfig`) |
| Deploy-home stack filenames | [`kit.StackFiles`](../../admintool/internal/kit/stackupdate.go) (`docker-stack.yml` / `.data.yml` / `.obs.yml`) — init/`eip update` always; `kit.Require` omits obs (addon-gated) |
| Stack YAML fetch / refresh | [`kit.UpdateStacks`](../../admintool/internal/kit/stackupdate.go) (`MissingOnly` for init/Setup; full compare for `eip update`) |
| Binary Release channel / kit git branch | [`kit.Channel`](../../admintool/internal/kit/channel.go) / `kit.KitBranch` (ldflags); `BinaryChannel()` / `ResolveKitBranch()` |
| Required/optional Swarm secret keys from `.env` | [`admintool/internal/swarm`](../../admintool/internal/swarm/) (`RequiredKeys` / `OptionalKeys`) |
| Per-service secret attach lists | [`docker-stack.yml`](../../docker-stack.yml) `secrets:` (discovered by `swarm.DiscoverAttach` / `stack.SecretAttaches`) |

TUI **Setup** / **Secrets** build from `EnvFields` + `cli.env_backup_path`; **Settings** / Setup Advanced from `ConfigFields` — do not invent parallel key lists in the UI.

Import direction: `kit` ← `config` ← `templates/env` and `templates/yamldefaults`. Package `config` must not import templates.

## Process flags vs `.env`

| Term | Meaning | Examples |
|------|---------|----------|
| **Process flag** | Set by the TUI on `os/exec` `Cmd.Env` for that child only. Not persisted. Not operator config. | `EIP_FROM_TUI=1`, `EIP_UPDATE_RESUME=1` (TUI relaunch after binary install) |
| **`.env` / config files** | Operator/deployment SoT on disk **in project home**. | `MONGO_PASSWORD`, `eip.config.yaml`, `docker-stack.yml` |

| Value | SoT |
|-------|-----|
| Process flags / process helpers | [`admintool/internal/process`](../../admintool/internal/process/) |

Never document process flags as `.env` keys; never add them to `EnvFields`. `msg` emit helpers gate on `process.FromTUI()` — do not redefine `EIP_FROM_TUI` elsewhere.

**Docker CLI env** (`DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`) is owned by Docker, not EIP. `internal/docker.NewClient` honors it the same way the `docker` CLI does; do not mirror those keys into `.env` / `EnvFields`.

## `eip` / `EIP_` prefix convention

| Surface | Prefix? | Why |
|---------|---------|-----|
| **OS-facing / outside the running tool** | **Yes** (`eip` / `EIP_`) | Shell, process table, foreign env dumps should show ownership. |
| **Internal to the binary** (already inside `eip`) | **No** | Context is already EIP. |

**Prefix:** host binary/CLI (`eip doctor`), process flags (`EIP_FROM_TUI`), stdout wire prefix (`EIPMSG `).  
**No prefix:** Go packages (`msg`, `kit`, `status`), message type strings (`pane.status`, `chip.docker`), TUI model fields.

## Project home

**Rule:** project home is the directory that contains the running `eip` / `eip.exe` binary (`internal/kit.Home()`). Stack YAML, `.env`, and `eip.config.yaml` live beside it. Bootstrap installs the binary into that folder on purpose.

A Windows shortcut (or double-click) that targets `…\home\eip.exe` uses that folder as home regardless of shortcut **Start in** / shell cwd. Do not move the binary out of the home.

**`go test` / `go run`:** those tools put the executable under a temp `go-build` tree (or a `*.test` binary). That is not a deploy home, so `Home()` falls back to the process working directory (unit tests `t.Chdir` into a temp root). Installed / `build-host` binaries always use the executable directory.

Optional bare `eip` on PATH: run **`eip add-path`** (symlink; home still resolves via the real binary). `eip add-path --remove` undoes it. Not required for `./eip up` from the home folder.

Local: `.\scripts\admintool\build-host.ps1` writes `eip.exe` at the repo root, so home is the repo root.

Day-2: **`eip update`** (binary → stack YAML → pull + digest reconcile). Cold start / Ready: **`eip up`**. New major.minor line: edit `APP_VERSION`, then update or up.

Deploy source (`live` / `dev`) is **not** a project-home file. Deploy stamps Swarm label `eip.deploy.source` (`deploy.LabelDeploySource`); `ResolveSource` reads that label only.

## Dynamic lists (pattern)

```text
SoT package/func  →  helper builds []Item / []Entry  →  ui.NewList(...)
```

Examples: service pickers, document builder sections, More submenu — define once, map with a helper, never duplicate string tables per screen.
