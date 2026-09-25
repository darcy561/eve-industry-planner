# Price entry dialogue (`frontend/src/Components/Dialogues/Price Entry`)

Live SoT for pricing what is left of an item — the rows offered by the price
entry dialogue, reachable from the group page and the job planner.

## What a row offers

`ItemPriceRow` offers a price box sized to however much of that item's
required quantity is not yet priced (its **remaining quantity**: required
quantity minus the sum of confirmed entries). The box is withdrawn once
nothing is left. A partly filled-in box is left alone unless the remaining
quantity itself changes — typing in it does not retrigger the row.

## Where a row's default price comes from

The dialogue asks for prices at whichever market the reader has picked, through
`useMarketPricesQuery` (see [../market-data/contents.md](../market-data/contents.md) for what that
query holds and how it stays current). It asks for its own list rather than reading whatever the
planner's own fetch had already warmed, because a reader who switches markets inside the dialogue
must see that market's figures rather than the ones last fetched at another.

Nothing re-renders a row on its own when the fetch lands, because nothing re-renders when a cache
entry is written — a priced surface reads figures synchronously rather than subscribing to one. The
dialogue hands each row a `pricesSettled` flag that flips once that market's fetch has landed, and a
row's default price re-reads on that flag rather than on any store update.

**A value the reader has typed away from the default is left alone.** The row tracks whether its
current figure still matches the default it was given; once a reader edits it, a later `pricesSettled`
flip or a changed remaining quantity does not overwrite what they typed.

## Confirm All

Confirm All builds a new price-entry list — and, for each item it prices, a
new `priceEntries` array — rather than writing into the existing arrays. Rows
pick this up because they follow the remaining-quantity figure, not because
Confirm All tells them anything happened.
