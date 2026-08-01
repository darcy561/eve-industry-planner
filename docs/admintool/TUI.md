# eip TUI — technical design

Source: [`admintool/tui/`](../../admintool/tui/). Entry: `tui.Run()` → `screens/home`.

**Child ↔ TUI messaging** (why two processes, `EIPMSG` on stdout, channels vs IPC): [MESSAGING.md](./MESSAGING.md).

## Goals

- **TUI-first** host management UI. Double-click / run `eip` with no args is the normal path.
- Same binary as CLI for scripts (`eip doctor`, …). Interactive + no args → TUI; `EIP_FROM_TUI=1` (child of TUI) or non-TTY → CLI help/verbs.
- Started from an existing terminal: TUI uses that window; quit returns to the shell prompt.
- Guided Setup / Secrets / Settings for `.env` and `eip.config.yaml`; stack ops via child CLI (Start/Dev/…). Make remain a legacy parallel path for Public bootstrap and some scripts.

## Hard rules

1. **Child-process ops only** — every Docker / stack action runs `eip <args>` as a **child** with `EIP_FROM_TUI=1` and detached stdin (Windows: `CREATE_NO_WINDOW`). Never run Cobra or Docker **in-process** from the TUI. Engine access belongs in CLI verbs via `internal/docker.NewClient`.
2. **Two streams from the child** — **stdout:** `EIPMSG` (`chip.*` → chips; `pane.text` / `pane.status` → OUTPUT). **stderr:** real errors → OUTPUT. Non-protocol stdout discarded. **Probe:** chip types only (never `pane.*`).
3. **TUI stays open** — exit on `esc` / ctrl+c from the main menu (no Quit row).
4. **TUI styles ≠ Cobra styles** — per-command OUTPUT formatters in `tui/output/<verb>/`; CLI dumps in `internal/*` (`status.FormatPlain`).
5. **Keyboard-only** — enable mouse cell motion so the wheel is not ↑/↓, then **swallow all `MouseMsg`**.
6. **Reuse `theme` + `ui`** — and home helpers in `screens/home/{nav,docs,pickers}.go`.
7. **Locked binary builds** — if the binary is locked (TUI still running), **alert and stop**. Do not invent alternate binary names.
8. **Config SoT stays files** — builders read/write `.env` and `eip.config.yaml` in place. Day-2 apply: Persist auto-queues child `eip secrets` / `eip sync` when Health is up; otherwise Start/Dev; manual via Command or CLI.
9. **Dynamic lists / one SoT** — CLI verbs in `catalog`; home menu copy/gating in `tui/ops`. See [VARIABLES.md](./VARIABLES.md).

## Package layout

```text
admintool/
  internal/kit/           # Home, Channel/KitBranch, SelfUpdate, UpdateStacks, templates/, obs/
  internal/catalog/       # eip verb SoT + expected Swarm services / fragments
  internal/config/        # live eip.config.yaml load/validate/sync/apply
  internal/deploy/        # Inspect / Source / Run (eip up / eip dev)
  internal/status/        # status report + WriteReport
  internal/docker/        # SDK Probe + StackSnapshot
  internal/process/       # FromTUI, ChildEnv, HoldOnError
  internal/msg/           # EIPMSG envelope + pane + chip.* helpers
  tui/
    run.go               # tui.Run()
    theme/ ui/ brand/ exec/
    ops/                 # home menu: Entries / MoreEntries / SetupNeeded / Allowed
    pane/                # OUTPUT Buffer + AppendMsg
    builder/             # reusable full-body wizard (section nav | form)
    output/<verb>/       # per-command OUTPUT formatters
    status/              # chips + ApplyEvent / poll
    screens/home/        # ops dashboard
      model.go           # Update / menu / command line
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
2. **Status bar** — **Docker** · **Health** lights + unlabeled **StatusMsg** (marquee when long). `commandRunning` is TUI-local (not a chip). Docker: green = engine + swarm active; amber = engine up, swarm not active; red = unreachable. Health: live stack rollup; off when Docker is not swarm-active. StatusMsg from user CLI `chip.stack` only. Auto-polls `eip probe` every 3s (chips only; public CLI name remains `eip doctor`).

**Menu gating (Docker light):**

| Docker | Visible |
|--------|---------|
| Off / red | Setup (if docs or stacks missing) + More |
| Amber | above + Status, Start, Dev |
| Green | full main list; More → Logs also |

3. **Body** — **COMMANDS** | **OUTPUT**. Outer gutters (`theme.HMargin`). OUTPUT history follows latest unless PgUp.

**Main COMMANDS:** Setup (until `.env`, `eip.config.yaml`, and `docker-stack*.yml` exist) · Status · Start (`up`) · Dev · Restart · Rebuild · Stop (`shutdown`) · Update (`update`) · **More**.

**More submenu:** Secrets · Settings · Logs · Command. Esc on More → Main. Closing a child (builder cancel/finish, Logs, Command, post-Persist apply DoneMsg) returns to **More**, not Main.

**Setup flow:** env panels (incl. `cli.env_backup_path`) → PersistEnv → **Use defaults** or **Advanced** (config panels). Does not start the stack. Esc on the choice skips further Setup (env already saved).

**Secrets / Settings:** day-2 builders. Finish → Persist; if Health up and Docker green → child apply (`secrets` then `sync`, or `sync` only). Autogen (space), bool fields (space), **ctrl+r** Roll (not Locked DB passwords). Form scrolls with pgup/pgdn.

4. **Footer** — key hints (builder has its own line while open).
5. **Command line** — `:` from Main, or More → Command. Typed `setup` / `edit` / `settings` open builders without `fromMore` (return to Main). Typed `secrets` / `sync` run CLI apply.

### Layout math

- Lipgloss borders sit outside `Width`/`Height` (±2).
- Subtract chrome (header + status + footer [+ cmd line]) before `ui.CalcSplit`.
- Resize → `layout()`.

## List / selection UX

- Full-width blue selection bars; helpers readable on the bar.
- Long helpers: ellipsis when unselected; selected row marquees (`ui.MarqueeDelegate`).
- Generic rows: `ui.NewItem` / `ui.NewList`; home catalog rows: `ops` `Entry` / `row`.

## Theme

MUI-dark inspired blue primary (`theme.Primary` ≈ ANSI 33). Terminal default background — no grey header panel.

## Keys (home)

| Key | Action |
|-----|--------|
| ↑ / ↓ | Select |
| Enter | Run / open |
| `:` | Command box (Main) |
| PgUp / PgDn | Scroll OUTPUT (works while a command runs) |
| esc / q | Quit (Main); back (More / pickers); cancel command box → More or Main |
| ctrl+c | Quit |
| Builder: space | Autogen / bool toggle |
| Builder: ctrl+r | Pending Roll |
| Builder: ctrl+enter | Finish / Persist |

## Build

```text
# Windows
.\scripts\admintool\build-host.ps1

# Linux / macOS
./scripts/admintool/build-host.sh
```

Writes repo-root `eip.exe` / `eip` only (no `dist/`). Locked binary → alert, stop running `eip`, retry — never a differently named binary.

**Linux launch:** real terminal (`./eip` or `./eip ui`). No-TTY may open an external terminal or fall back to CLI help.
