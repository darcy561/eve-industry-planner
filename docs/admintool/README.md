# admintool / eip — technical docs

Host ops tool for Eve Industry Planner: one binary (`eip` / `eip.exe`) with **Cobra CLI** + **desktop TUI**.

| Doc | Contents |
|-----|----------|
| [TUI.md](./TUI.md) | TUI architecture, UX/design rules, package map, planned screens |
| [MESSAGING.md](./MESSAGING.md) | Why child process; EIPMSG wire; Go channels vs IPC |
| [VARIABLES.md](./VARIABLES.md) | Single sources of truth for names, verb lists, theme, env keys |
| [ENGINEERING.md](./ENGINEERING.md) | Dynamic lists, helpers, Docker SDK-first, folder hygiene, build, testing/CI |
| [`admintool/README.md`](../../admintool/README.md) | Build / run quickstart |

**Naming**

| Layer | Name |
|-------|------|
| Source folder / Go module | `admintool/` (`eve-industry-planner/admintool`) |
| CLI / binary | `eip` / `eip.exe` |
| Product TUI title | Eve Industry Planner · Management Tool (`internal/kit`) |
| Swarm stack / networks / `.eip-home` | stay `eip` |

**Agent rule:** [`.cursor/rules/admintool-tui.mdc`](../../.cursor/rules/admintool-tui.mdc) (`globs: admintool/**`).
