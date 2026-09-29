# settings — tests

Live SoT for test depth under
[`frontend/src/Components/Settings`](../../../frontend/src/Components/Settings). Behaviour →
[frontend/settings/contents.md](../../frontend/settings/contents.md). Module entrypoints →
[contents.md](./contents.md).

## Coverage map

**Depth:** Strong across the Market Locations tab — the registry, the panel's rows, adding, editing,
saving and validation, and what a failed read shows — each with its own file beside the module it
tests, plus two end-to-end suites over the write and the read-outcome paths together. Also strong
across the Custom Structures tab — the shape and its field map, the form driven by it, and what a job
setup takes from a saved structure. What a rig or a structure gives, and the declared rules a place
puts a structure or a setup under, are covered from
[industry-facilities.md](./industry-facilities.md), not from this file.

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
| `Functions/Custom Structures/customStructure.js` | What each kind carries, ids, name and tax settling, the round trip, and that a row's own keys are exactly what it stores |
| `Functions/Custom Structures/customStructuresFromServer.js` | Reading either stored shape — the array, or the four keyed lists |
| `Functions/Custom Structures/addCustomStructure.js` | The system index a new structure asks for, and that adding one announces itself once |
| `Functions/Custom Structures/customStructureSetup.js` | Whether a setup's structure is gone, and what a setup takes from one and gives back |
| `Functions/Helper/coerceTaxPercentage.js` | The tax percentage rule: finite, never below zero |
| `Hooks/useRigSlots.js` | Taking a rig, refusing the same rig, refusing a competing rig, clearing a slot, naming the slot asked about |
| `Zustand/applicationSettings/structures.js` | Adding, defaulting and deleting a saved structure scoped to its own kind, and what the document carries |
| `Custom Structures/CustomStructuresForm.jsx`, `structureKindSelection.jsx`, `structureForm.jsx`, `structureFields.jsx`, `currentStructures.jsx` | The kind picker offering every build kind, the field map deciding which controls appear, every field the form offers having a setter that works, the declared place rules narrowing and fixing a field, and the saved list filtering to the selected kind |

### Little / none

- Keyboard reachability of `ExplainerTooltip`'s focusable mode is exercised generically where that
  component is tested, not specifically through a market row

## Topic-only detail

What a rig or a structure gives, the published bonus catalogue, and where a job may legally run →
[industry-facilities.md](./industry-facilities.md). Server-side composition, validation and
release-step tests → [../services/core.md](../services/core.md), [../services/api.md](../services/api.md),
[../services/shared.md](../services/shared.md).
