# Deployment Tool — TUI documentation

## Owns (SoT)

TUI screens and UX under [`deployment-tool/tui/`](../../../../deployment-tool/tui/): hard rules, home chrome/gating, builders, input/theme.

## Does not own

- CLI verb behaviour / menu↔verb map → [../cli/verbs.md](../cli/verbs.md)
- EIPMSG wire protocol → [../cli/messaging.md](../cli/messaging.md)
- Field registries / process flags → [../cli/variables.md](../cli/variables.md)
- Module package tree / build-host → [../cli/engineering.md](../cli/engineering.md)

## Task map

| I need to… | Read |
|------------|------|
| Goals, hard rules, TUI package map | [tui.md](./tui.md) |
| Home chrome, menu gating, Command, progress overlay | [home.md](./home.md) |
| Setup / Secrets / Settings builders | [builders.md](./builders.md) |
| Keys, mouse, list UX, theme | [input.md](./input.md) |
