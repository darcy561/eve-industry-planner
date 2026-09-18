# Frontend — Components

## Owns (SoT)

The shared app-shell atoms a panel is built from, under
[`frontend/src/Styled Components`](../../../frontend/src/Styled%20Components) and the sx they sit
on under [`frontend/src/Context/appShell`](../../../frontend/src/Context/appShell): the panel and
inset surfaces, the two card atoms, the row anatomy a list of things is built from, the overflow
action menu, the figure and status atoms, labelled-field shells, the scrolling-table behaviour, the
control that assembles an item's market actions, and how a picture from EVE's image server is asked
for and drawn.

## Does not own

- Which screens compose these atoms, and what each screen itself does → that area's own `contents.md`
- The rule that a screen must reach a panel, card or inset surface through its component rather than
  the sx beneath it, and the audit that finds one that doesn't →
  [../technical-rules.md](../technical-rules.md) § The app-shell surface has an owner
- The SPA's shared dialogue shell → [../technical-rules.md](../technical-rules.md) § Dialogues
- Test depth → [../../testing/frontend/contents.md](../../testing/frontend/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Change a panel, a section or a recessed block's surface | [surfaces.md](./surfaces.md) |
| Know which card atom to reach for, or how one is keyboard-activated | [cards.md](./cards.md) |
| Build a list of characters, corporations, planners, saved structures or anything else drawn a row at a time | [rows.md](./rows.md) |
| Add or change an action behind a row's or a panel's overflow menu | [menus.md](./menus.md) |
| Change how a figure, a change or a state is drawn, or how a panel lays several out | [figures.md](./figures.md) |
| Change a labelled control or an on/off row | [forms.md](./forms.md) |
| Make a table fit the panel it sits in | [tables.md](./tables.md) |
| Change an item's market-data, price-history or assets actions | [item-actions.md](./item-actions.md) |
| Ask EVE's image server for a picture, or change what a missing one shows | [avatars.md](./avatars.md) |
