# Item watchlist (`frontend/src/Components/Dashboard/Components/ItemWatch`)

Live SoT for the dashboard's watchlist panel — the tracked items and groups a
reader has chosen to keep prices on.

## Prices

`WatchlistContainer` asks for prices through `useMarketPricesQuery` (see
[../pricing/contents.md](../pricing/contents.md) for callers beyond this one),
keyed on the set of type ids currently on the watchlist. The panel waits for
that first fetch before drawing rows; if the fetch fails, the rows are drawn
anyway, without prices, rather than staying on the loading state.

Because the query is keyed on the id set rather than run per row, two
watchlist panels open at once — or a watchlist re-rendering while another
price consumer is already fetching the same ids — ask for prices once between
them rather than once each.

## Rows and groups

Rows and groups are drawn from `state.jobData.userWatchlist`; grouped items
render under their `WatchlistGroup`, ungrouped items render as a flat
`WatchListRow` list. Adding an item, adding a group, and editing a group's
settings each go through the panel's own dialogues, built on the SPA's shared
dialogue shell (see [../technical-rules.md](../technical-rules.md) §
Dialogues).
