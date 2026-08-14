# Deployment Tool — TUI input & list UX

Home keys/mouse, list selection, theme. Hard rules → [tui.md](./tui.md).

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
