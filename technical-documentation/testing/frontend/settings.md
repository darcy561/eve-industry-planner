# settings — tests

Live SoT for test depth under
[`frontend/src/Components/Settings`](../../../frontend/src/Components/Settings). Behaviour →
[frontend/settings/contents.md](../../frontend/settings/contents.md). Module entrypoints →
[contents.md](./contents.md).

## Coverage map

**Depth:** Strong across the Market Locations tab — the registry, the panel's rows, adding, editing,
saving and validation, and what a failed read shows — each with its own file beside the module it
tests, plus two end-to-end suites over the write and the read-outcome paths together.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `Functions/MarketData/registry/marketSources.js` | Kind traits, `allMarketSources` composing hubs and saved sources, `citadelsInRegion` and `savedCitadels` filtering |
| `Functions/MarketData/registry/marketLocations.js` | The composed-set cache entry surviving session collection, seeding from the bootstrap, `marketsToOffer` falling back to the account's own lane, `marketLocationsChanged` / `refreshMarketLocationsAfterWrite` re-reading only once a write lands |
| `Functions/MarketData/registry/marketReadOutcome.js` | Which outcome an error's flags map to, and which outcomes `readerCanAct` marks as worth wording |
| `Hooks/Static/useMarketSources.js` | Redrawing as the composed set or the account's own lane changes |
| `Market Locations/marketLocationsFrame.jsx` | The tab assembling sources into rows, hub filtering, row open/close |
| `Market Locations/marketRows.js` | Row shape, `sharedByLabel`, `placeLabel`, `readProblem` wording the two actionable outcomes and staying silent on the rest |
| `Market Locations/marketSummary.js` | `summariseMarket` and `lastReadMoment` per kind |
| `Market Locations/marketWriter.js` | `addMarket` / `updateMarket` / `removeMarket`, which document a transform lands on, `useMarketIsEditable` |
| `Market Locations/newMarket.js` | Minting a row's id, place and derived fields; parity with the id-prefix table |
| `Market Locations/addMarketForm.jsx`, `marketEditor.jsx`, `marketsTable.jsx`, `marketsNotAnswering.jsx`, `unsavedCitadelFee.jsx`, `pricedAgainst.jsx` | Each surface's own rendering and edit behaviour |
| `savingAMarket.endToEnd.test.js` | Saving a market a reader added reaches the panel once the composed set is re-read after the write lands |
| `readOutcomeReachesTheRow.endToEnd.test.js` | A failed read's outcome reaches the row's "Last read" cell as the wording and offer a reader can act on |
| `market_limits/limits.json` parity | The broker-fee ceiling held between the Go constant and the field that enforces it in the form |

### Little / none

- Keyboard reachability of `ExplainerTooltip`'s focusable mode is exercised generically where that
  component is tested, not specifically through a market row

## Topic-only detail

Server-side composition, validation and release-step tests → [../services/core.md](../services/core.md),
[../services/api.md](../services/api.md).
