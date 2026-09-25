# Frontend — pricing

## Owns (SoT)

Behaviour of the SPA's shared pricing surfaces — the price history chart and
the price entry dialogue — reached from several pages rather than owned by
any one of them; and where a figure resolves by default when nothing nearer
has said — the resolution ladder, the account's two sides, and the market
group defaults beneath them.

## Does not own

- Market price fetching, caching, freshness and the shared `useMarketPricesQuery` hook →
  [../market-data/contents.md](../market-data/contents.md)
- The dashboard watchlist, which is that hook's main caller → [../dashboard/watchlist.md](../dashboard/watchlist.md)
- Reprocessing's own calculation settings → [../reprocessing/contents.md](../reprocessing/contents.md)
- The SPA's shared dialogue shell → [../technical-rules.md](../technical-rules.md) § Dialogues
- The Settings page controls that set the account's defaults and its market
  group table → [../settings/contents.md](../settings/contents.md)
- The account's stored pricing shape and the schema upgrader's seed →
  [../../backend/shared/pricing-defaults.md](../../backend/shared/pricing-defaults.md)

## Task map

| I need to… | Read |
|------------|------|
| Change the price history chart's visible window, or when it resets | [price-history.md](./price-history.md) |
| Change what a price entry row offers, or how Confirm All fills prices in | [price-entry.md](./price-entry.md) |
| Change which market or order type a figure resolves against by default, or which rung answers it | [defaults.md](./defaults.md) |
| Change which side a surface prices against | [defaults.md](./defaults.md) § Which side each surface asks for |
| Change how a market group default is walked or applied | [defaults.md](./defaults.md) § Market group defaults |
