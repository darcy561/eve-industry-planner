# admintool — ops tool source (CLI + TUI)

Go module for Eve Industry Planner deployment management.

**Technical docs:** [docs/admintool/](../docs/admintool/) ([TUI](../docs/admintool/TUI.md) · [MESSAGING](../docs/admintool/MESSAGING.md) · [VARIABLES](../docs/admintool/VARIABLES.md) · [ENGINEERING](../docs/admintool/ENGINEERING.md)).  
**Agent rules:** [`.cursor/rules/admintool-tui.mdc`](../.cursor/rules/admintool-tui.mdc), [`.cursor/rules/admintool-templates.mdc`](../.cursor/rules/admintool-templates.mdc) (apply under `admintool/**`).

| Layer | Name |
|-------|------|
| **Source folder / module** | `admintool/` (`eve-industry-planner/admintool`) |
| **CLI command / binary** | `eip` / `eip.exe` |
| **TUI** | Same binary — **Eve Industry Planner / Management Tool** |
| **Swarm stack / networks** | `eip` / `eip-core` / `eip-obs` |

| Path | Role |
|------|------|
| [`cmd/commands/`](cmd/commands/) | Cobra CLI verbs (`eip <verb>`) |
| [`internal/kit/templates/`](internal/kit/templates/) | `.env` / `eip.config.yaml` registries + write-missing + docs gate |
| [`internal/config/`](internal/config/) | Live YAML load/validate/sync/apply |
| [`tui/`](tui/) | Desktop UI (child-process CLI; see TUI.md) |
| [`main.go`](main.go) | Interactive + no args → TUI; otherwise CLI |

```text
cd admintool; go test ./...          # unit tests (no Docker required)
./scripts/admintool/build-host.sh    # or build-host.ps1 on Windows
./eip                                # TUI
./eip ui                             # force TUI
./eip doctor                         # CLI verb
./eip init                           # write-missing operator docs
EIP_FROM_TUI=1 ./eip …               # force CLI path (same flag TUI sets on children)
```

CI: [`.github/workflows/admintool.yml`](../.github/workflows/admintool.yml) — test + build on Ubuntu / Windows / macOS when `admintool/` changes.

**TUI-first:** one console — TUI runs there; quit closes the window (double-click) or returns to the shell (terminal). No post-quit pause.

**TUI policy:** user actions run `eip <args>` as a child with `EIP_FROM_TUI=1`. Background refresh polls `eip probe` (chips only). Home menu is plain-language (`tui/ops`); Setup / More → Secrets & Settings edit files; Persist can auto-run `secrets`/`sync`. Quit with `esc` / ctrl+c from Main.

**Host-tool update:** `eip update-binary` (GitHub Releases when published).

**Not in this package:** Public chicken-egg bootstrap (curl Makefile / `update-files`) — still Make/`scripts/bootstrap/`. Make `release` / advertise / `update-data` are legacy — use `eip up` / `dev` / `rebuild`.
