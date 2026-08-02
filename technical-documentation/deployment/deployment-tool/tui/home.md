# Deployment Tool — TUI home screen

Ops dashboard at `tui/screens/home`. Entry from [tui.md](./tui.md). Menu row → CLI verb map → [verbs.md](../cli/verbs.md).

## Chrome

1. **Header** — logo (`brand`) + product name (`kit.Name`) + **Deployment Tool** (`kit.Tagline`) + deployed **app** version (`APP_VERSION` via `chip.app`). Shows `—` until a probe sees a stack.
2. **Status bar** — **Docker** · **Health** lights + unlabeled **StatusMsg** (marquee when long). `commandRunning` is TUI-local (not a chip).
   - Docker: green = engine + swarm active; amber = engine up, swarm not active; red = unreachable.
   - Health: live stack rollup; off when swarm is inactive or no stack is deployed; amber/red when a stack is present but unhealthy.
   - StatusMsg from user CLI `chip.stack` only.
   - Auto-polls `eip probe` every 3s (chips only; CLI name `eip doctor` — [verbs.md](../cli/verbs.md)).
3. **Body** — **COMMANDS** | **OUTPUT**. Outer gutters (`theme.HMargin`). OUTPUT history follows latest unless PgUp.
4. **Footer** — key hints (builder has its own line while open).
5. **Command** — opened via More → Command or `:` (see below).

## Menu gating (Docker + Health)

SoT: `tui/ops.Allowed` / `VisibleEntries` / `VisibleMoreEntries`. Which rows run which verbs → [verbs.md](../cli/verbs.md).

| Docker | Health | Visible |
|--------|--------|---------|
| Off / red | — | Setup (if docs or stacks missing) + More |
| Amber | — | above + Status, Start, Dev |
| Green | Off (no stack; swarm active) | Status · **Start** · Dev · Restart · Rebuild · Stop · Update · More (+ Logs in More) |
| Green | Amber / red | Status · **Repair** · Dev · Restart · Rebuild · Stop · Update · More |
| Green | Green | Status · Dev · Restart · Rebuild · Stop · **Update** · More (Start/Repair hidden) |

## Main / More

Main shows gated COMMANDS rows (Setup until docs/stacks exist; Start vs Repair by Health; Dev / Restart / Rebuild / Stop / Update / **More**). More: ← Back · Command · Secrets · Settings · Logs.

Same list highlight/click/Enter as Main. Back / Esc on More → Main. Nested pickers (Restart / Logs) include ← Back. Closing a child (builder cancel/finish, Logs, Command, post-Persist apply DoneMsg) returns to **More**, not Main.

Secrets / Settings builders → [builders.md](./builders.md).

## Command (host + core)

More → Command or `:` from Main opens one session: left pane becomes **COMMAND** with ← Back, right pane prompt on the last row (viewport shrinks by one; footer help stays). Scroll/wheel only moves the log region above the prompt.

- Host verbs run as child `eip <verb>…` (`init` = headless file gen). Verb list → [verbs.md](../cli/verbs.md).
- Core tasks: `cli list`, `tasks list`, or bare `list` → `eip cli …`.
- Typed `setup` / `edit` / `settings` open builders.
- Empty Enter stays open; Esc or ← Back leaves.
- Interactive core shell is terminal-only (`eip cli` outside the TUI).
- If Command was opened from More, cancel/finish returns to More; `:` from Main keeps return-to-Main.

## Progress overlay

Live `pane.progress` keeps a multi-line text board in OUTPUT (styled with `theme.Primary` / Muted via `ui.StyleProgressOverlay` — not bubbles’ progress widget). Optional `fraction` (0..1) drives the host OSC progress strip (indeterminate when omitted; no lipgloss on OSC). Wire types → [messaging.md](../cli/messaging.md).

Marquee ticks run through `list` `ItemDelegate.Update`. Viewport soft-wrap is on by default for OUTPUT/form panes.

## Layout math

- Lipgloss borders sit outside `Width`/`Height` (±2).
- Subtract chrome (header + status + footer) before `ui.CalcSplit`. Command prompt is inside the right panel (viewport height − 1), not an extra chrome row.
- Resize → `layout()`.
