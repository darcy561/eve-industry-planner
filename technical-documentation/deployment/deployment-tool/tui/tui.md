# Deployment Tool — TUI

Source: [`deployment-tool/tui/`](../../../../deployment-tool/tui/). Entry: `tui.Run()` → `screens/home`.

Charm stack: `charm.land/bubbletea/v2`, `charm.land/bubbles/v2`, `charm.land/lipgloss/v2`. Root models return `tea.View` (alt-screen / mouse mode / window title / optional terminal OSC `ProgressBar` via `tui/ui.NewProgramView`).

Sibling topics → [contents.md](./contents.md). Child protocol → [messaging.md](../cli/messaging.md). Verbs → [verbs.md](../cli/verbs.md).

## Goals

- **TUI-first** host management UI. Double-click / run `eip` with no args is the normal path.
- Same binary as CLI for scripts (`eip doctor`, …). Interactive + no args → TUI; `EIP_FROM_TUI=1` (child of TUI) or non-TTY → CLI help/verbs.
- Started from an existing terminal: TUI uses that window; quit returns to the shell prompt.
- Guided Setup / Secrets / Settings for `.env` and `eip.config.yaml`; stack ops via child CLI. Host ops are the Deployment Tool only.

## Hard rules

1. **Child-process ops only** — every Docker / stack action runs `eip <args>` as a **child** with `EIP_FROM_TUI=1` and detached stdin (Windows: `CREATE_NO_WINDOW`). Never run Cobra or Docker **in-process** from the TUI. Engine access belongs in CLI verbs via `internal/docker.NewAPIClient`.
2. **Child I/O** — stdout/stderr contract and EIPMSG types → [messaging.md](../cli/messaging.md).
3. **TUI stays open** — exit on `esc` / ctrl+c from the main menu (no Quit row).
4. **TUI styles ≠ Cobra styles** — per-command OUTPUT formatters in `tui/output/<verb>/`; CLI dumps in `internal/*` (`status.FormatPlain`).
5. **Mouse via zones** — all-motion on; `bubblezone/v2` ids through `tui/ui` (`Mark`/`Scan`/`Hit`). Hover highlights list rows; **left release** activates (= Enter). Wheel scrolls OUTPUT / form / logview only (not list rows). Keyboard remains complete. Detail → [input.md](./input.md).
6. **Reuse `theme` + `ui`** — and home helpers in `screens/home/{nav,docs,pickers,mouse}.go`.
7. **Locked binary builds** — if the binary is locked (TUI still running), **alert and stop**. Do not invent alternate binary names. Build → [engineering.md](../cli/engineering.md).
8. **Config SoT stays files** — builders read/write `.env` and `eip.config.yaml` in place. Persist / apply policy → [builders.md](./builders.md).
9. **Dynamic lists / one SoT** — CLI verbs in `catalogue`; home menu copy/gating in `tui/ops`. Registries → [variables.md](../cli/variables.md).

## TUI package map

```text
tui/
  run.go               # tui.Run()
  theme/ ui/ brand/ exec/
  ops/                 # home menu: Entries / MoreEntries / SetupNeeded / Allowed
  pane/                # Buffer, AppendMsg, ProgressMsg
  builder/             # reusable wizard: section nav | huh/v2 form + Finish
  output/<verb>/       # per-command OUTPUT formatters
  status/              # chips + ApplyEvent / poll
  screens/home/        # ops dashboard (nav, docs, pickers, mouse, view)
  screens/init/        # EnvSections / ConfigSections + PersistEnv / PersistConfig
  screens/logview/     # thin follow window for eip logs -f --ui
```

When adding or moving TUI packages, update this map and [home.md](./home.md) / [builders.md](./builders.md) as needed. Full module tree → [engineering.md](../cli/engineering.md).
