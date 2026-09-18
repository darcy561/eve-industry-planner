# A row in a list (`Styled Components/Paper/EntityRow.jsx`)

Live SoT for `EntityRow`, the anatomy a list of things is built from — a character, a corporation, a
planner, a saved structure. A list composes it so its rows are learnt once and read everywhere, and
a row supplies only the pieces it has: a row with nothing but a name and its actions is as valid as
one carrying artwork, context and state.

## The anatomy

`EntityRow`
([`Styled Components/Paper/EntityRow.jsx`](../../../frontend/src/Styled%20Components/Paper/EntityRow.jsx))
takes its pieces as props and decides where they go: EVE's own artwork, a name, a line of context
beneath it, status chips, actions, and whatever hangs below the row — usually a `Disclosure` (see
[figures.md](./figures.md)). A caller supplies the pieces; the row is what makes a roster of
characters and a list of planners read as the same kind of object.

It sits on `appShellNestedCardSx` (see [surfaces.md](./surfaces.md) § The sx underneath), outlined
rather than elevated, the same surface `SelectableCard` and `ActionCard` sit on. `selected` marks
the one row in a list that is the one currently being worked in.

It is not a card: [cards.md](./cards.md)'s two atoms are each a single control with a role and a
hit area of their own. `EntityRow` carries several controls of its own — an actions menu among
them — and is not itself pressable.

## Wrapping on a phone

The name and the actions share the row's first line; state chips take a line of their own below
`sm`, because a name and a chip reading a state at once do not fit 360px and shrinking either is
worse than giving the chip its own line.

## Actions

`props.actions` is where a caller passes an [`ActionMenu`](./menus.md), and anything that should
sit beside it.
