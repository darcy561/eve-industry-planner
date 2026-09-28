# reprocessing — tests

Live SoT for test depth under
[`frontend/src/Components/Reprocessing`](../../../frontend/src/Components/Reprocessing) and
[`frontend/src/Functions/Reprocessing`](../../../frontend/src/Functions/Reprocessing). Behaviour →
[frontend/reprocessing/contents.md](../../frontend/reprocessing/contents.md). Module entrypoints →
[contents.md](./contents.md).

## Coverage map

**Depth:** Tested for the settings panel's calculation knobs, the structure panel's rig slots, and the
page's seed. Reprocessing's own calculation is not covered from this file — see § Topic-only detail.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `reprocessingSettingsPanel.test.jsx` | The calculation knobs, and the panel opening itself over an exempt ore |
| `reprocessingStructurePanel.test.jsx` | The panel's rig slots and their conflict handling, and the dropdown handing the page a fresh copy of the structure it selects |
| `Hooks/useReprocessingReducer.test.js` | The page opening on a copy of the saved default structure, that editing the copy leaves the saved row alone, and the blank fallback for a reader with none saved |
| `Functions/Reprocessing/structureBonuses.test.js` | `rigBonusFor` and `structureBonusFor` against every reprocessing item type |

## Topic-only detail

The structure's stored shape, the field map, the rig combining rule and the rig-conflict rule shared
with every other editor → [settings.md](./settings.md).
