# eip TUI — technical design

Source: [`admintool/tui/`](../../admintool/tui/). Entry: `tui.Run()` → `screens/home`.

**Child ↔ TUI messaging** (why two processes, `EIPMSG` on stdout, channels vs IPC): [MESSAGING.md](./MESSAGING.md).

## Goals

- **TUI-first** host management UI (not a Docker oneshot). Double-click / run `eip.exe` with no args is the normal path.
- Same binary as CLI for scripts (`eip doctor`, …). Interactive + no args → TUI; `EIP_FROM_TUI=1` (child of TUI) or non-TTY → CLI help/verbs.
- Started from an existing terminal: TUI uses that window; quit returns to the shell prompt (no extra pause or second window).
- Replace / wrap Make bring-up over time (`init` wizard, `up`, settings) without forcing operators to hand-edit `.env` first.

## Hard rules

1. **Child-process ops only** — every ops action runs `eip <args>` as a **child** with process flag `EIP_FROM_TUI=1` and detached stdin (Windows: `CREATE_NO_WINDOW`). Never run Cobra or Docker **in-process** from the TUI (console lifetime on Windows). Docker Engine access belongs in CLI verbs via `internal/docker.NewClient` (`ResolveDockerEndpoint` + SDK Ping/Info).
2. **Two streams from the child** — **stdout:** `EIPMSG` envelopes (`chip.*` → chips; `pane.text` / `pane.status` → OUTPUT; TUI formats status with lipgloss). **stderr:** real errors → OUTPUT append. Non-protocol stdout discarded. **Probe:** chip types only (never `pane.*`).
3. **TUI stays open** — exit on `esc` / ctrl+c (no Quit menu row).
4. **TUI styles ≠ Cobra styles** — per-command OUTPUT formatters live in `tui/output/<verb>/` (e.g. `output/status.Render`); CLI dumps stay in `internal/*` (`status.FormatPlain`).
5. **Keyboard-only** — enable mouse cell motion so the terminal does not turn the wheel into ↑/↓, then **swallow all `MouseMsg`**. No click/wheel navigation.
6. **Reuse `theme` + `ui`** — new screens must use shared helpers; do not copy panel/list styling into each screen.
7. **Locked binary builds** — if `eip.exe` is locked (TUI still running), **alert and stop**. Do not invent alternate binary names (`eip-tui9.exe`, etc.).
8. **Config SoT stays files** — guided forms read/write `.env` and `eip.config.yaml` in place. Do not invent a third config store. Day-2 apply is `eip secrets` / `eip sync`.
9. **Dynamic lists / one SoT** — see [VARIABLES.md](./VARIABLES.md) and [ENGINEERING.md](./ENGINEERING.md). Menus build from `internal/catalog`, not hard-coded tables.

## Package layout

```text
admintool/
  internal/kit/           # product strings, Home, envfile, templates/, obs/, SelfUpdate
  internal/catalog/       # eip verb SoT + expected Swarm services / fragments
  internal/deploy/        # Inspect / Source / fragments; Run (eip up / eip dev)
  internal/status/        # status report + WriteReport + outfmt geometry
  internal/docker/        # SDK Probe + StackSnapshot
  internal/process/       # OS process helpers (FromTUI, ChildEnv, HoldOnError)
  internal/msg/           # EIPMSG envelope + pane + chip.* helpers
  tui/
    run.go               # tui.Run()
    theme/               # colors, gutters, shared lipgloss
    ui/                  # Item, lists, panes, viewports
    brand/               # EIP block logo
    exec/                # streaming child eip (chans → WaitCmd)
    ops/                 # home menu builder (← catalog)
    pane/                # OUTPUT Buffer + AppendMsg (any source)
    output/<verb>/       # per-command OUTPUT formatters (status, …)
    status/              # chips + ApplyEvent / poll (header bar — not OUTPUT)
    screens/home/        # main ops dashboard
    screens/settings/    # (planned) env / config forms
    screens/init/        # (planned) first-run wizard
```

## Home screen layout

1. **Header** — EIP ASCII mark (`brand`) + product name / “Management Tool” / deployed **app** version (`APP_VERSION` from live Swarm service env via `chip.app`). Shows `—` until a probe sees a stack. No grey header band; same terminal background as the body. Top padding so the logo is not clipped.
2. **Status bar** — **Docker** · **Health** traffic lights, plus unlabeled **StatusMsg** text (marquee when long). No Job chip; `commandRunning` is a TUI flag only. Docker: green = engine up + swarm active; amber = engine up but swarm not active; red = engine unreachable. Health: live Swarm stack `eip` rollup (worst-wins; `desired==0` ignored); off when Docker is not swarm-active. StatusMsg comes from user CLI `chip.stack` only (prefer `message`). Status **auto-polls** `eip probe` every 3s even while a command runs (not a menu item; public CLI remains `eip doctor`). Probe emits `chip.docker` + `chip.health` + `chip.app` — never `chip.stack` or pane types. Menu gates on Docker light. Red/off: Command… only (app version is in the header). Amber: init / up / dev / status + Command…. Output pane empty until a command runs.

**Swarm vs Health vs StatusMsg:** Swarm is folded into the Docker light. Health = live stack membership/task rollup. StatusMsg = short CLI status phrase (cleared on next command start, or `StatusMsgHold` ≈ 5s after the command ends).
3. **Body** — left **COMMANDS** list, right **OUTPUT** viewport (`ui.RenderPanel` + `ui.JoinPanes`). Outer left/right gutters (`theme.HMargin`). OUTPUT keeps full command history; new pane/stderr lines pin to the latest (`outputFollow`) unless the operator PgUp’s to read back (PgDn to bottom resumes follow). Scroll works while a command is still running.
4. **Footer** — key hints.
5. **Command line** (optional) — `:` or “Command…” focuses `eip ` text input.

### Layout math

- Lipgloss **borders sit outside** `Width`/`Height`. Panel outer sizes must account for ±2 or the body wraps and clips the logo.
- Chrome height (header + status + footer [+ cmd line]) must be subtracted before `ui.CalcSplit`.
- On resize, Bubble Tea sends `WindowSizeMsg` — reflow via `layout()` (responsive).

## List / selection UX

- Full-width **blue selection bars** (not text-only highlights).
- Helper/description on the bar must stay **readable** (light muted on primary — not faint white on blue).
- Long helpers: **ellipsis** when not selected; selected row **marquees in place** (`ui.MarqueeDelegate`) so the layout never reflows.
- Use `ui.NewItem` / `ui.NewList` / `ui.SizeList` / `ui.MarqueeDelegate` for generic rows; `ops` for home CLI catalog rows.

## Theme

MUI-dark inspired blue primary (`theme.Primary` ≈ ANSI 33). Avoid purple glow / cream-serif AI defaults. Terminal default background — do not reintroduce a grey header panel.

## Planned screens (config)

Prefer **guided forms / wizards** over a freeform `.env` editor in the output pane.

| Screen | Role |
|--------|------|
| `screens/init` | First-run: deploy home, auto-gen secrets (+ HMAC backup confirm), SSO / `APP_VERSION`, optional YAML, engine probe, then bring-up |
| `screens/settings` | Day-2 tweak known keys; save to `.env` / `eip.config.yaml`; remind or trigger apply (secrets vs YAML split) |

External `$EDITOR` / Notepad remains acceptable for power users; structured TUI forms are the default path for `make up` replacement.

## Keys (home)

| Key | Action |
|-----|--------|
| ↑ / ↓ | Select command |
| Enter | Run selected |
| `:` | Command box |
| PgUp / PgDn | Scroll **output** pane (not the command list); works during a running command |
| `esc` / ctrl+c | Quit (from menu; `esc` in command box cancels) |

## Build

```text
.\scripts\admintool\build-host.ps1
```

Writes repo-root `eip.exe` / `eip` only (no `dist/`). If the file is locked, the script **alerts**, stops running `eip` processes, waits, and retries — it never writes a differently named binary.
