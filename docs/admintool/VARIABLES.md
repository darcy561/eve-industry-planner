# admintool — variables & lists (single source of truth)

Do not hardcode parallel copies of these values in screens or menus. Change the SoT, then rebuild lists from helpers.

## Product / naming (code)

| Value | SoT |
|-------|-----|
| Product name, tagline, CLI name, stack name | [`admintool/internal/kit`](../../admintool/internal/kit/product.go) |
| Binary / module folder names | [README.md](./README.md) |
| Expected Swarm service groups + fragments | [`admintool/internal/catalog/services.go`](../../admintool/internal/catalog/services.go) |
| Deploy source / inspect / up-dev recipe | [`admintool/internal/deploy`](../../admintool/internal/deploy/) (`Source`, `Inspect`, `Run`) |
| Kit file names / `Require` / project home | [`admintool/internal/kit`](../../admintool/internal/kit/) — `Home()` is always process cwd |
| Operator YAML Load/Validate/SyncEnv / Sync | [`admintool/internal/eipconfig`](../../admintool/internal/eipconfig/) |
| Swarm stack / network IDs | `kit.StackName` / `engine.NetworkName` (`eip-core`); not redefined in TUI |

## Operator command list (code)

| Value | SoT |
|-------|-----|
| `eip` verbs (id, title, short) | [`admintool/internal/catalog`](../../admintool/internal/catalog/verbs.go) |
| Home TUI menu | built dynamically via `ops.Entries()` ← `catalog.Verbs()` + UI-only rows (Command…, Quit) |

When adding a verb: **update `catalog` first**, wire Cobra under `cmd/commands/`, keep Cobra `Short` aligned with `catalog.Verb.Short`. Do not paste a new row only into `ops/menu.go`.

## TUI theme / layout (code)

| Value | SoT |
|-------|-----|
| Colors, gutters (`HMargin`, `ColGap`) | [`admintool/tui/theme`](../../admintool/tui/theme/) |
| List/panel helpers | [`admintool/tui/ui`](../../admintool/tui/ui/) |

## Deploy config (files / existing docs)

| Value | SoT |
|-------|-----|
| `.env` key schema | embedded [`admintool/internal/kit/templates/env.example`](../../admintool/internal/kit/templates/env.example); apply rules in [docs/swarm/ENV.md](../swarm/ENV.md) |
| Operator YAML | [`admintool/internal/kit/templates/eip.config.yaml`](../../admintool/internal/kit/templates/eip.config.yaml) example / `eip.config.yaml` |
| Required/optional `.env` secret keys | [`admintool/internal/swarm`](../../admintool/internal/swarm/) (`RequiredKeys` / `OptionalKeys`) |
| Per-service secret attach lists | [`docker-stack.yml`](../../docker-stack.yml) `secrets:` (discovered by `swarm.DiscoverAttach` / `stack.SecretAttaches`) |

TUI settings/init screens must read/write those files — do not invent a third key list in the UI without updating the SoT above.

## Process flags vs `.env`

| Term | Meaning | Examples |
|------|---------|----------|
| **Process flag** | Set by the TUI on `os/exec` `Cmd.Env` for that child only. Not persisted. Not operator config. | `EIP_FROM_TUI=1` |
| **`.env` / config files** | Operator/deployment SoT on disk **in project home**. | `POSTGRES_PASSWORD`, `eip.config.yaml`, `docker-stack.yml` |

| Value | SoT |
|-------|-----|
| Process flags / process helpers | [`admintool/internal/process`](../../admintool/internal/process/) |

Never document process flags as `.env` keys; never add them to the embedded `env.example`. `msg` emit helpers gate on `process.FromTUI()` — do not redefine `EIP_FROM_TUI` elsewhere.

**Docker CLI env** (`DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`) is owned by Docker, not EIP. `internal/docker.NewClient` honors it the same way the `docker` CLI does; do not mirror those keys into `.env` / the embedded `env.example`.

## `eip` / `EIP_` prefix convention

| Surface | Prefix? | Why |
|---------|---------|-----|
| **OS-facing / outside the running tool** | **Yes** (`eip` / `EIP_`) | Shell, process table, foreign env dumps should show ownership. |
| **Internal to the binary** (already inside `eip`) | **No** | Context is already EIP. |

**Prefix:** host binary/CLI (`eip doctor`), process flags (`EIP_FROM_TUI`), stdout wire prefix (`EIPMSG `).  
**No prefix:** Go packages (`msg`, `kit`, `status`), message type strings (`pane.status`, `chip.docker`), TUI model fields.

## Project home

Public install and local dev share one rule: **the folder you run `eip` from is the project home** (stack files, `.env`, later service configs). Setup drops the kit into that folder with the binary. Dev: run from the repo root. Resolution SoT: `internal/kit.Home()` → cwd.

Deploy source (`live` / `dev`) is **not** a project-home file. Deploy stamps Swarm label `eip.deploy.source` (`deploy.LabelDeploySource`); `ResolveSource` reads that label only.

## Dynamic lists (pattern)

```text
SoT package/func  →  helper builds []Item / []Entry  →  ui.NewList(...)
```

Examples: service pickers, settings sections, wizard steps — define once, map with a helper, never duplicate string tables per screen.
