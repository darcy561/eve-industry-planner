# An item's market actions (`Styled Components/Item`)

Live SoT for the control that puts an item's market data, price history and assets actions together —
the only place those three are assembled.

`ItemMarketActions`
([`Styled Components/Item/marketActions.jsx`](../../../frontend/src/Styled%20Components/Item/marketActions.jsx))
takes an item's `typeID` and, optionally, the `children` naming it. Given a name, the three actions
appear in a small card above it while the pointer is on either, or while something inside has focus; a
150ms close delay lets the pointer cross the gap between the name and the card, cancelled if the
pointer arrives on the card itself. Given no name to hover — a card's actions row, a panel header —
there is nothing to appear from, so the actions sit inline as the content itself.

It is built on MUI's `Popper`, not `Popover`: a `Popover` is a `Modal`, whose invisible
viewport-covering backdrop would swallow the pointer leaving the anchor before it could close. `Popper`
only positions, so there is no backdrop to let events through and nothing to dismiss but the pointer
leaving. The wrapper is focusable, giving the actions a keyboard route, and they are not hidden on a
narrow viewport.

`side` (one of `PRICING_SIDE`) decides which default market a link opens — a link beside a sale price
must open the market that price is quoted against rather than the one materials were bought on. The
assets action shows only to a signed-in player, read from the SPA's session store directly rather than
through a prop, so it reflects a sign-in that happens during the same session.

The 150ms close delay is not covered by a test: jsdom has no pointer, so nothing in the suite can
reproduce one travelling between two elements.
