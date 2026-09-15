# Cards a panel composes (`Styled Components/Paper`)

Live SoT for the app-shell design's two card atoms, and which one a screen reaches for.

## Which card is which

`SelectableCard`
([`Styled Components/Paper/SelectableCard.jsx`](../../../frontend/src/Styled%20Components/Paper/SelectableCard.jsx))
is a card a player **picks**: the whole card carries a `radio` or `checkbox` role (`control`) and a
`selected` state, so the hit area matches what a reader thinks they are clicking. The input inside is
decorative and hidden from assistive technology, because the card itself already carries the role and
the state.

`ActionCard`
([`Styled Components/Paper/ActionCard.jsx`](../../../frontend/src/Styled%20Components/Paper/ActionCard.jsx))
**acts**: an `href` gives it a link role that opens in a new tab, an `onAction` with no `href` gives it
a button role, and neither leaves it inert — plain content with no role, because a control a reader
cannot use should not be announced as one. `muted` dims an inert card whose action is unavailable
rather than hiding it.

Both sit on `appShellNestedCardSx` (see [surfaces.md](./surfaces.md) § The sx underneath), so a card
that acts and a card that is chosen read as the same object.

## Keyboard activation

`activateOnEnterOrSpace` in
[`Styled Components/Paper/cardActivation.js`](../../../frontend/src/Styled%20Components/Paper/cardActivation.js)
is the `onKeyDown` handler both cards use. A `Paper` given a role and a `tabIndex` is reachable by Tab
but does not get a native button's Enter and Space activation on its own — that is the browser's doing
and does not come with the role. Without this handler a card is focusable and does nothing.

Every enabled card carries `tabIndex={0}`, so a set of `SelectableCard`s is reached one card at a
time with Tab. The ARIA radiogroup pattern expects the opposite — one tab stop for the group, moved
between options with the arrow keys — so a row of cards behaves as a set of independently tabbable
controls rather than as a single radio group. Giving the group a roving tab stop means the card
taking its index within the group, which changes every caller as well as the component.
