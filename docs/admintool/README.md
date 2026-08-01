# admintool / eip — technical docs

Host ops tool for Eve Industry Planner: one binary (`eip` / `eip.exe`) with **Cobra CLI** + **desktop TUI**.

| Doc | Contents |
|-----|----------|
| [TUI.md](./TUI.md) | TUI architecture, home menu (Setup / More), builder, package map |
| [MESSAGING.md](./MESSAGING.md) | Why child process; EIPMSG wire; Go channels vs IPC |
| [VARIABLES.md](./VARIABLES.md) | SoT for names, verbs, theme, env/config registries, ensure keys |
| [ENGINEERING.md](./ENGINEERING.md) | Package map, deploy Ready, init/docs gate, build, testing |
| [PRERELEASE.md](./PRERELEASE.md) | Development `:prerelease` + per-branch tags; isolated from Public |
| [`admintool/README.md`](../../admintool/README.md) | Build / run quickstart |

**Naming**

| Layer | Name |
|-------|------|
| Source folder / Go module | `admintool/` (`eve-industry-planner/admintool`) |
| CLI / binary | `eip` / `eip.exe` |
| Product TUI title | Eve Industry Planner · Management Tool (`internal/kit`) |
| Swarm stack / networks | stay `eip` / `eip-core` / `eip-obs` |

**Agent rules:** [`.cursor/rules/admintool-tui.mdc`](../../.cursor/rules/admintool-tui.mdc), [`.cursor/rules/admintool-templates.mdc`](../../.cursor/rules/admintool-templates.mdc) (`globs: admintool/**`).

**Project home:** `kit.Home()` is the directory of the running `eip` / `eip.exe` (bootstrap puts the binary there). Details: [VARIABLES.md](./VARIABLES.md#project-home).

**Scope note:** Preferred host path for stack lifecycle is `eip` (up/dev/sync/secrets/rebuild/… + TUI). First-touch: [`eip-bootstrap.sh`](../../eip-bootstrap.sh) / [`eip-bootstrap.ps1`](../../eip-bootstrap.ps1). Host-tool day-2: **`eip update-binary`**. `eip init` / TUI Setup only write operator docs (`.env` / `eip.config.yaml`).
