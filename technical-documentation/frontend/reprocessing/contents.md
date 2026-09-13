# Frontend — reprocessing

## Owns (SoT)

Behaviour of the reprocessing page's settings panel under
[`frontend/src/Components/Reprocessing`](../../../frontend/src/Components/Reprocessing):
its calculation knobs and when the panel opens itself over the exempt-ore list.

## Does not own

- The reprocessing calculation itself → not yet documented here
- Reading the static file of ore and ice yields → [../static-data/reprocessing.md](../static-data/reprocessing.md)
- Market/tax figures shown alongside reprocessing output → [../pricing/contents.md](../pricing/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Change the reprocessing calculation knobs, or when the settings panel opens itself | [settings.md](./settings.md) |
| Read ore and ice yields, or change which items ore selection may choose from | [../static-data/reprocessing.md](../static-data/reprocessing.md) |
