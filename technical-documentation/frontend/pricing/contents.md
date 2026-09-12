# Frontend — pricing

## Owns (SoT)

Behaviour of the SPA's shared pricing surfaces — the price history chart and
the price entry dialogue — reached from several pages rather than owned by
any one of them.

## Does not own

- Market data fetching and the shared `useMarketPricesQuery` hook, and the
  dashboard watchlist that is its main caller → [../dashboard/watchlist.md](../dashboard/watchlist.md)
- Reprocessing's own calculation settings → [../reprocessing/contents.md](../reprocessing/contents.md)
- The SPA's shared dialogue shell → [../technical-rules.md](../technical-rules.md) § Dialogues

## Task map

| I need to… | Read |
|------------|------|
| Change the price history chart's visible window, or when it resets | [price-history.md](./price-history.md) |
| Change what a price entry row offers, or how Confirm All fills prices in | [price-entry.md](./price-entry.md) |
