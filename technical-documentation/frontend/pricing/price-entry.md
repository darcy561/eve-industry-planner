# Price entry dialogue (`frontend/src/Components/Dialogues/Price Entry`)

Live SoT for pricing what is left of an item — the rows offered by the price
entry dialogue, reachable from the group page and the job planner.

## What a row offers

`ItemPriceRow` offers a price box sized to however much of that item's
required quantity is not yet priced (its **remaining quantity**: required
quantity minus the sum of confirmed entries). The box is withdrawn once
nothing is left. A partly filled-in box is left alone unless the remaining
quantity itself changes — typing in it does not retrigger the row.

The row's default price and quantity come from `defaultPrice`, read from
stored market data for the selected market and listing side; a market data
update while the row's price still matches the previous default replaces it,
but a value the reader has typed away from that default is left in place.

## Confirm All

Confirm All builds a new price-entry list — and, for each item it prices, a
new `priceEntries` array — rather than writing into the existing arrays. Rows
pick this up because they follow the remaining-quantity figure, not because
Confirm All tells them anything happened.
