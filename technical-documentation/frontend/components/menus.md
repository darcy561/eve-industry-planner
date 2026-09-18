# The overflow action menu (`Styled Components/Menu/ActionMenu.jsx`)

Live SoT for `ActionMenu`, the app-shell design's overflow menu.

## What it draws

`ActionMenu`
([`Styled Components/Menu/ActionMenu.jsx`](../../../frontend/src/Styled%20Components/Menu/ActionMenu.jsx))
takes its actions as data — `{label, onClick, disabled, disabledReason, destructive}` per item —
behind one icon button, so adding an action to whatever carries the menu is a table entry rather
than a change to the menu itself. It draws nothing when it is given no items.

A disabled item renders its `disabledReason` as visible secondary text under the label rather than
in a tooltip: a disabled `MenuItem` takes no pointer events, so a tooltip on one never opens. An
item marked `destructive` is coloured for it and sits last — the menu is where an occasional or
destructive action belongs, and a reader about to remove something should see that they are.

A panel renders this for its own `enableMenu` / `menuItems` — `AppShellPanel`, on the app-shell
surface (see [surfaces.md](./surfaces.md)), and `ContentPanel` — and a row built on
[`EntityRow`](./rows.md) passes one through `actions` for the actions on that row. Each menu carries
its own ids from `useId`, so two menus on one page — a panel's and a row's — never collide.
