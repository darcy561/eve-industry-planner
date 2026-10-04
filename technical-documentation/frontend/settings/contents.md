# Frontend — settings

## Owns (SoT)

Behaviour of the Settings page's Market Locations tab under
[`frontend/src/Components/Settings/Standard Layout/Market Locations`](../../../frontend/src/Components/Settings/Standard%20Layout/Market%20Locations):
the markets a reader has saved and the ones an organisation shares with them, managing and reading
either, where each side of a job is priced by default, and the registry every priced surface across
the SPA reads a market from; its Job Settings tab's per-market-group pricing table under
[`.../Job Settings`](../../../frontend/src/Components/Settings/Standard%20Layout/Job%20Settings);
and its Custom Structures tab under
[`.../Custom Structures`](../../../frontend/src/Components/Settings/Standard%20Layout/Custom%20Structures):
describing and saving the four places a job is built in and the field map that decides what a kind
carries.

## Does not own

- The stored shape, server-side composition, and release steps that moved a market onto its own lane
  → [../../backend/api/market-locations.md](../../backend/api/market-locations.md)
- The account's stored pricing shape, the schema upgrader's seed, and wire compatibility for the
  fields it retired → [../../backend/shared/pricing-defaults.md](../../backend/shared/pricing-defaults.md)
- The resolution ladder a market or order type is read through, and which side a surface asks for →
  [../pricing/defaults.md](../pricing/defaults.md)
- A custom structure's stored shape, the decode-time fold, and the accessors that read it →
  [../../backend/shared/custom-structures.md](../../backend/shared/custom-structures.md)
- What a rig or a structure gives, the shared rig field, and where a job may legally run →
  [../industry-facilities/contents.md](../industry-facilities/contents.md)
- The Reprocessing page's own structure panel, which edits a copy of the reader's saved default →
  [../reprocessing/structure-panel.md](../reprocessing/structure-panel.md)
- The Settings page's other frames — asset location, market character, custom system indexes, custom
  extras, blueprint settings, layout settings — not yet documented here
- Linking or re-authorising a character → [../accounts/characters.md](../accounts/characters.md)

## Task map

| I need to… | Read |
|------------|------|
| Change what markets a priced surface may choose from, or how the composed set is read and cached | [market-locations.md](./market-locations.md) § The registry |
| Change the Market Locations tab, its table, or the priced-against controls | [market-locations.md](./market-locations.md) § The panel |
| Change what a row says about when it was last read, or why it is not answering | [market-locations.md](./market-locations.md) § What a market says about itself right now |
| Change how a market is added, edited, saved, or which document a write lands on | [market-locations.md](./market-locations.md) § Adding, editing and saving a market |
| Change the market group pricing panel, its picker, or how a group default is added or cleared | [job-settings.md](./job-settings.md) § Market group pricing |
| Change the field map, a kind's form fields, or which kinds the picker offers | [custom-structures.md](./custom-structures.md) § A structure is a row, described by a field map, § One form, driven by the field map |
| Change how two rig slots combine, or the rig-conflict rule | [custom-structures.md](./custom-structures.md) § Rig slots |
| Change what a rig or a structure gives, or which rigs a structure size may fit | [../industry-facilities/bonuses.md](../industry-facilities/bonuses.md) |
| Change where a job may legally run, or what a place fixes about a structure described here | [../industry-facilities/constraints.md](../industry-facilities/constraints.md) |
| Change what a job setup takes from a saved structure, or whether a setup's structure reads as gone | [custom-structures.md](./custom-structures.md) § What a job setup takes from a saved structure |
| Change how a structure is added, defaulted or deleted | [custom-structures.md](./custom-structures.md) § What a screen reads |
