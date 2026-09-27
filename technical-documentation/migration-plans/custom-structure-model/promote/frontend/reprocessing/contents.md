# Frontend — reprocessing

## Owns (SoT)

Behaviour of the reprocessing page's settings panel and its structure panel under
[`frontend/src/Components/Reprocessing`](../../../frontend/src/Components/Reprocessing):
the calculation knobs, when the settings panel opens itself over the exempt-ore list, the structure a
reader tries yields under, and reprocessing's own rig and structure bonus calculations.

## Does not own

- The reprocessing calculation itself → not yet documented here
- Reading the static file of ore and ice yields → [../static-data/reprocessing.md](../static-data/reprocessing.md)
- Market/tax figures shown alongside reprocessing output → [../pricing/contents.md](../pricing/contents.md)
- A custom structure's stored shape, its field map, and the rig-conflict rule →
  [../settings/custom-structures.md](../settings/custom-structures.md)

## Task map

| I need to… | Read |
|------------|------|
| Change the reprocessing calculation knobs, or when the settings panel opens itself | [settings.md](./settings.md) |
| Read ore and ice yields, or change which items ore selection may choose from | [../static-data/reprocessing.md](../static-data/reprocessing.md) |
| Change the structure panel, or how the page seeds the structure it tries yields under | [structure-panel.md](./structure-panel.md) |
| Change reprocessing's own rig or structure bonus calculations | [structure-panel.md](./structure-panel.md) § Feeding reprocessing's own calculations |
