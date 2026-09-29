# reprocessing — tests

Live SoT for test depth under
[`frontend/src/Components/Reprocessing`](../../../frontend/src/Components/Reprocessing) and
[`frontend/src/Functions/Reprocessing`](../../../frontend/src/Functions/Reprocessing). Behaviour →
[frontend/reprocessing/contents.md](../../frontend/reprocessing/contents.md). Module entrypoints →
[contents.md](./contents.md).

## Coverage map

**Depth:** Tested for the settings panel's calculation knobs, the structure panel's rig slots, the
page's seed, and reprocessing's own rig and structure bonus reading — including a corpus test proving
the current yield formula against every combination live could hold. Reprocessing's own calculation
beyond that is not covered from this file — see § Topic-only detail.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `reprocessingSettingsPanel.test.jsx` | The calculation knobs, and the panel opening itself over an exempt ore |
| `reprocessingStructurePanel.test.jsx` | The panel's rig slots and their conflict handling, and the dropdown handing the page a fresh copy of the structure it selects |
| `Hooks/useReprocessingReducer.test.js` | The page opening on a copy of the saved default structure, that editing the copy leaves the saved row alone, and the blank fallback for a reader with none saved |
| `Functions/Reprocessing/reprocessingBonuses.test.js` | `rigBonusFor`, `rigSecurityFor` and `structureBonusFor` against every reprocessing item type |
| `Functions/Reprocessing/liveParity.corpus.test.js` | The current yield formula against a transcription of the formula live runs, over every saved structure live can hold — every structure type, security band, and rig pairing in both slots, against every item type and skill/implant combination |

## Topic-only detail

The structure's stored shape, the field map, and the rig-conflict rule shared with every other editor
→ [settings.md](./settings.md). What a rig or a structure gives, the published bonus catalogue, and
the shared rig field → [industry-facilities.md](./industry-facilities.md).
