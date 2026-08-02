# eip TUI — technical design

Source: [`admintool/tui/`](../../admintool/tui/). Entry: `tui.Run()` → `screens/home`.

Charm stack: `charm.land/bubbletea/v2`, `charm.land/bubbles/v2`, `charm.land/lipgloss/v2`. Root models return `tea.View` (alt-screen / mouse mode / window title / optional terminal OSC `ProgressBar` via `tui/ui.NewProgramView`). Marquee ticks run through `list` `ItemDelegate.Update`. Viewport soft-wrap is on by default for OUTPUT/form panes. Live `pane.progress` keeps a multi-line text board in OUTPUT (styled with `theme.Primary` / Muted via `ui.StyleProgressOverlay` — not bubbles’ purple progress widget); optional `fraction` (0..1) drives the host OSC progress strip (indeterminate when omitted; no lipgloss on OSC).

**Child ↔ TUI messaging** (why two processes, `EIPMSG` on stdout, channels vs IPC): [MESSAGING.md](./MESSAGING.md).

## Goals

- **TUI-first** host management UI. Double-click / run `eip` with no args is the normal path.
- Same binary as CLI for scripts (`eip doctor`, …). Interactive + no args → TUI; `EIP_FROM_TUI=1` (child of TUI) or non-TTY → CLI help/verbs.
- Started from an existing terminal: TUI uses that window; quit returns to the shell prompt.
- Guided Setup / Secrets / Settings for `.env` and `eip.config.yaml`; stack ops via child CLI (Start/Dev/…). Make remain a legacy parallel path for Public bootstrap and some scripts.

## Hard rules

1. **Child-process ops only** — every Docker / stack action runs `eip <args>` as a **child** with `EIP_FROM_TUI=1` and detached stdin (Windows: `CREATE_NO_WINDOW`). Never run Cobra or Docker **in-process** from the TUI. Engine access belongs in CLI verbs via `internal/docker.NewAPIClient`.
2. **Two streams from the child** — **stdout:** `EIPMSG` (`chip.*` → chips; `pane.text` / `pane.status` → OUTPUT; `pane.progress` → live overlay + optional ProgressBar). **stderr:** real errors → OUTPUT. Non-protocol stdout discarded. **Probe:** chip types only (never `pane.*`).
3. **TUI stays open** — exit on `esc` / ctrl+c from the main menu (no Quit row).
4. **TUI styles ≠ Cobra styles** — per-command OUTPUT formatters in `tui/output/<verb>/`; CLI dumps in `internal/*` (`status.FormatPlain`).
5. **Mouse via zones** — all-motion on; `bubblezone/v2` ids through `tui/ui` (`Mark`/`Scan`/`Hit`). Hover highlights list rows; **left release** activates (= Enter). Wheel scrolls OUTPUT / form / logview only (not list rows). Keyboard remains complete.
6. **Reuse `theme` + `ui`** — and home helpers in `screens/home/{nav,docs,pickers,mouse}.go`.
7. **Locked binary builds** — if the binary is locked (TUI still running), **alert and stop**. Do not invent alternate binary names.
8. **Config SoT stays files** — builders read/write `.env` and `eip.config.yaml` in place. Day-2 apply: Persist auto-queues child `eip secrets` / `eip sync` when Health is up; otherwise Start/Dev; manual via Command or CLI.
9. **Dynamic lists / one SoT** — CLI verbs in `catalog`; home menu copy/gating in `tui/ops`. See [VARIABLES.md](./VARIABLES.md).

## Package layout

```text
admintool/
  internal/kit/           # Home, Channel/KitBranch, SelfUpdate, UpdateStacks, templates/, obs/
  internal/catalog/       # eip verb SoT + expected Swarm services / fragments
  internal/config/        # live eip.config.yaml load/validate/sync/apply (Moby ServiceUpdate)
  internal/deploy/        # Inspect / Source / Run (eip up / eip dev)
  internal/swarm/         # hashed secrets/configs via Moby Secret*/Config*
  internal/status/        # status report + WriteReport
  internal/docker/        # Moby NewAPIClient, Probe, StackSnapshot
  internal/docker/enginetest/  # httptest Engine stand-in for unit tests
  internal/dockercli/     # docker binary: stack deploy only (+ Verbose/LookPath)
  internal/process/       # FromTUI, ChildEnv, HoldOnError, TimeoutSignalContext, EnsureTUIConsoleSize
  internal/msg/           # EIPMSG envelope + pane + chip.* helpers
  tui/
    run.go               # tui.Run()
    theme/ ui/ brand/ exec/
    ops/                 # home menu: Entries / MoreEntries / SetupNeeded / Allowed
    pane/                # OUTPUT Buffer + AppendMsg
    builder/             # reusable wizard: section nav | huh/v2 form + Finish
    output/<verb>/       # per-command OUTPUT formatters
    status/              # chips + ApplyEvent / poll
    screens/home/        # ops dashboard
      model.go           # Update / menu / command line
      mouse.go           # zone click / wheel + activate*
      nav.go             # Main/More navigation, pane helpers
      docs.go            # Setup / Secrets / Settings Persist + auto-apply
      pickers.go         # Restart / Logs pickers
      view.go keys.go
    screens/init/        # EnvSections / ConfigSections + PersistEnv / PersistConfig
    screens/logview/     # thin follow window for eip logs -f --ui
```

Full `internal/` tree: [ENGINEERING.md](./ENGINEERING.md) § Folder structure.

## Home screen layout

1. **Header** — EIP ASCII mark (`brand`) + product name / “Management Tool” / deployed **app** version (`APP_VERSION` via `chip.app`). Shows `—` until a probe sees a stack.
2. **Status bar** — **Docker** · **Health** lights + unlabeled **StatusMsg** (marquee when long). `commandRunning` is TUI-local (not a chip). Docker: green = engine + swarm active; amber = engine up, swarm not active; red = unreachable. Health: live stack rollup; off when swarm is inactive or no stack is deployed; amber/red when a stack is present but unhealthy. StatusMsg from user CLI `chip.stack` only. Auto-polls `eip probe` every 3s (chips only; public CLI name remains `eip doctor`).

**Menu gating (Docker + Health):**

| Docker | Health | Visible |
|--------|--------|---------|
| Off / red | — | Setup (if docs or stacks missing) + More |
| Amber | — | above + Status, Start, Dev |
| Green | Off (no stack; swarm active) | Status · **Start** · Dev · Restart · Rebuild · Stop · Update · More (+ Logs in More) |
| Green | Amber / red | Status · **Repair** · Dev · Restart · Rebuild · Stop · Update · More |
| Green | Green | Status · Dev · Restart · Rebuild · Stop · **Update** · More (Start/Repair hidden) |

3. **Body** — **COMMANDS** | **OUTPUT**. Outer gutters (`theme.HMargin`). OUTPUT history follows latest unless PgUp.

**Main COMMANDS:** Setup (until `.env`, `eip.config.yaml`, and `docker-stack*.yml` exist) · Status · Start (`up`) or Repair (`repair`) by Health · Dev · Restart · Rebuild · Stop (`shutdown`) · Update (`update`) · **More**.

**More submenu:** ← Back · Command · Secrets · Settings · Logs. Same list highlight/click/Enter as Main. Back / Esc on More → Main. Nested pickers (Restart / Logs) already include ← Back. Closing a child (builder cancel/finish, Logs, Command, post-Persist apply DoneMsg) returns to **More**, not Main. Builders expose **[ ← Back ]** (form → sections; sections → leave) beside Finish.

**Command (host + core):** More → Command or `:` from Main opens one session like other More tools: left pane becomes **COMMAND** with ← Back, right pane prompt on the last row (viewport shrinks by one; footer help stays). Scroll/wheel only moves the log region above the prompt. Host verbs (`status`, `init`, `secrets`, `sync`, …) run as child `eip <verb>…` (`init` = headless file gen, same as CLI). Core tasks: `cli list`, `tasks list`, or bare `list` → `eip cli …`. Typed `setup` / `edit` / `settings` open builders (guided Setup/Secrets/Settings are also on the menus). Empty Enter stays open; Esc or ← Back leaves. Interactive core shell is terminal-only (`eip cli` outside the TUI).

**Setup flow:** env panels (incl. `cli.env_backup_path`) → PersistEnv → **Use defaults** or **Advanced** (config panels). Does not start the stack. Esc on the choice skips further Setup (env already saved).

**Secrets / Settings:** day-2 builders. Right pane is `charm.land/huh/v2` (force-dark EIP theme); left section nav unchanged. **Finish** control (tab past last field / click / **ctrl+s**) → Persist; if Health up and Docker green → child apply (`secrets` then `sync`, or `sync` only). **Autogen** checkbox only on first create; day-2 **Roll** for S3 / AES (AES Roll bumps key version + legacy behind the scenes — version is not a TUI field); locked values show as disabled inputs. ↑↓ stay in the active pane (sections **or** fields). Click a form field to focus it; wheel scrolls the form viewport.

4. **Footer** — key hints (builder has its own line while open).
5. **Command line** — `:` from Main and More → **Command** share one window (host verbs + core tasks). Typed `init` runs child `eip init` (files only). Typed `setup` / `edit` / `settings` open builders; if Command was opened from More, cancel/finish returns to More (`:` from Main keeps return-to-Main).

### Layout math

- Lipgloss borders sit outside `Width`/`Height` (±2).
- Subtract chrome (header + status + footer) before `ui.CalcSplit`. Command prompt is inside the right panel (viewport height − 1), not an extra chrome row.
- Resize → `layout()`.

## List / selection UX

- Full-width blue selection bars; helpers readable on the bar.
- Long helpers: ellipsis when unselected; selected row marquees (`ui.MarqueeDelegate`).
- Short panes paginate (bubbles paginator chrome). ↑/↓ and wheel over COMMANDS cross pages; ←/→ jump pages. PgUp/PgDn always scroll OUTPUT, not the menu.
- Generic rows: `ui.NewItem` / `ui.NewList`; home catalog rows: `ops` `Entry` / `row`.

## Theme

MUI-dark inspired blue primary (`theme.Primary` ≈ ANSI 33). Terminal default background — no grey header panel.

## Keys / mouse (home)

| Input | Action |
|-----|--------|
| ↑ / ↓ | Select |
| Click (left release) | Activate (= Enter): run / open / enter form; Finish = Persist |
| Enter | Run / open / confirm |
| `:` | Combined Command window (host verbs + core tasks); same as More → Command; click refocuses while open |
| Wheel | Over COMMANDS: move selection (pages on short panes). Over OUTPUT / builder form: scroll |
| PgUp / PgDn | Scroll OUTPUT (never the menu list) |
| esc / q | Quit (Main); back (More / pickers); cancel command box → More or Main |
| ctrl+c | Quit / cancel (not copy) |
| ctrl+shift+c | **Mouse on:** copy focused field / command line via Windows `Set-Clipboard` (verified read-back; no OSC52 race). **Select-text mode (F6):** eip does not handle this key — **right-click → Copy** the highlight |
| ctrl+v / paste | Into focused text field (OS clipboard, OSC52 fallback) |
| **F6** | Toggle **select text** mode: releases mouse capture, shows a blue banner; drag-highlight then **right-click Copy**. **F6** again restores clicks. Do **not** use ctrl+shift+m — Windows Terminal steals that for its own Mark Mode |
| Shift+drag | While mouse capture is on, some terminals still allow native selection |
| **While a child CLI runs** | **esc / ctrl+c cancel** the child (`tui/exec` interrupt→kill); clears queued apply steps; does not quit the TUI |
| Builder: space | Autogen (first create) / Roll (day-2) checkbox; bool Confirm ←→ |
| Builder: ctrl+r | Pending Roll (rollable secrets only) |
| Builder: **Finish** / **ctrl+s** | Persist (tab past last huh field → Finish, or click Finish) |

## Build

```text
# Windows
.\scripts\admintool\build-host.ps1

# Linux / macOS
./scripts/admintool/build-host.sh
```

Writes repo-root `eip.exe` / `eip` only (no `dist/`). Locked binary → alert, stop running `eip`, retry — never a differently named binary.

**Linux launch:** real terminal (`./eip` or `./eip ui`). No-TTY may open an external terminal or fall back to CLI help.
