# Pricing defaults test depth

What is covered for the resolution ladder, the account's two sides, and the market group defaults
beneath them. The behaviour itself is
[frontend/pricing/defaults.md](../../frontend/pricing/defaults.md).

## Where the depth is

| Covered | By |
|---|---|
| The ladder itself — job, account, global, independently per axis, and which rung answered | [`Functions/MarketData/defaults/pricingSide.test.js`](../../../frontend/src/Functions/MarketData/defaults/pricingSide.test.js) |
| The group walk — nearest ancestor wins, per axis, capped depth | [`Functions/MarketData/defaults/pricingSide.test.js`](../../../frontend/src/Functions/MarketData/defaults/pricingSide.test.js) |
| The one place outside render every caller resolves through | [`Functions/MarketData/defaults/priceResolution.test.js`](../../../frontend/src/Functions/MarketData/defaults/priceResolution.test.js) |
| A row's own override against the panel default, and the group rung's `beneathTheJob` rule | [`Functions/MarketData/defaults/materialPricing.test.js`](../../../frontend/src/Functions/MarketData/defaults/materialPricing.test.js) |
| Dropping a job override once it matches the account, judged per side, and the selling side's route-derived default | [`Hooks/Planner/useStripRedundantJobMarketHubOverrides.test.jsx`](../../../frontend/src/Hooks/Planner/useStripRedundantJobMarketHubOverrides.test.jsx) |
| A job's stored override normalised on load, both sides, legacy and split shapes | [`Classes/jobPricingOverride.test.js`](../../../frontend/src/Classes/jobPricingOverride.test.js) |
| The selling context reading its market from its own side rather than a buying-side prop | [`Components/Edit Job/Edit Job Components/Planning/Standard Layout/Cost Breakdown/useJobEconomics.sellingMarket.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Cost%20Breakdown/useJobEconomics.sellingMarket.test.jsx>) |
| The account-wide controls — all four corners of market and order type/exit route, on both sides | [`Components/Settings/Standard Layout/Market Locations/pricedAgainst.test.jsx`](<../../../frontend/src/Components/Settings/Standard%20Layout/Market%20Locations/pricedAgainst.test.jsx>) |
| The market group pricing panel and its picker — adding, editing, clearing a row, browsing and searching the tree | [`Components/Settings/Standard Layout/Job Settings/marketGroupPricing.test.jsx`](<../../../frontend/src/Components/Settings/Standard%20Layout/Job%20Settings/marketGroupPricing.test.jsx>), [`.../marketGroupPicker.test.jsx`](<../../../frontend/src/Components/Settings/Standard%20Layout/Job%20Settings/marketGroupPicker.test.jsx>) |
| The store action that merges one group entry without replacing the table | [`Zustand/applicationSettings/groupPricing.test.js`](../../../frontend/src/Zustand/applicationSettings/groupPricing.test.js) |
| The market group tree and item-group lookup, primed and read synchronously | [`Functions/MarketData/defaults/marketGroupData.test.js`](../../../frontend/src/Functions/MarketData/defaults/marketGroupData.test.js) |
| A market link with no market of its own resolving through the account's default for its side | [`Functions/MarketData/registry/marketLinkTarget.test.js`](../../../frontend/src/Functions/MarketData/registry/marketLinkTarget.test.js) |
| Watchlist rows pricing both sides at once, through the panel that resolves them | [`Components/Dashboard/Components/ItemWatch/itemWatchContainer.test.jsx`](<../../../frontend/src/Components/Dashboard/Components/ItemWatch/itemWatchContainer.test.jsx>) |

## What is not covered

`useWatchlistPricing` has no test of its own; it is exercised only through its caller, the watchlist
panel, so a mistake in it is caught only if that panel happens to render a value depending on it.
