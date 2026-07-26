# admintool — ops tool source (CLI + TUI)

Go module for Eve Industry Planner deployment management.

**Technical docs:** [docs/admintool/](../docs/admintool/) ([TUI](../docs/admintool/TUI.md) · [MESSAGING](../docs/admintool/MESSAGING.md) · [VARIABLES](../docs/admintool/VARIABLES.md) · [ENGINEERING](../docs/admintool/ENGINEERING.md)).  
**Agent rule:** [`.cursor/rules/admintool-tui.mdc`](../.cursor/rules/admintool-tui.mdc) (applies under `admintool/**`).

| Layer | Name |
|-------|------|
| **Source folder / module** | `admintool/` (`eve-industry-planner/admintool`) |
| **CLI command / binary** | `eip` / `eip.exe` |
| **TUI** | Same binary — **Eve Industry Planner / Management Tool** |
| **Swarm stack / networks** | `eip` / `eip-core` / `eip-obs` |

| Path | Role |
|------|------|
| [`cmd/commands/`](cmd/commands/) | Cobra CLI verbs (`eip <verb>`) |
| [`tui/`](tui/) | Desktop terminal UI (child-process CLI; see TUI.md) |
| [`main.go`](main.go) | Interactive + no args → TUI; otherwise CLI |

```text
cd admintool; go test ./...          # unit tests (no Docker required)
.\scripts\admintool\build-host.ps1
.\eip.exe                 # TUI (also: double-click / run from folder)
.\eip.exe ui              # force TUI
.\eip.exe doctor          # CLI verb (scripts / power users)
$env:EIP_FROM_TUI='1'; .\eip.exe   # force CLI path (same flag TUI sets on children)
```

CI: [`.github/workflows/admintool.yml`](../.github/workflows/admintool.yml) — test + build on Ubuntu / Windows / macOS when `admintool/` changes.

**TUI-first:** one console — TUI runs there; quit closes the window (double-click) or returns to the shell prompt (started from Terminal). No post-quit “use PowerShell” pause.

**TUI policy:** user actions run `eip <args>` as a child with `EIP_FROM_TUI=1`. Background Docker refresh polls `eip probe` (chip EIPMSG only). OUTPUT: `pane.*` EIPMSG + stderr → `tui/pane`; structured verbs render via `tui/output/<verb>/`. Quit with `esc` / ctrl+c.
