# Frontend — settings

## Owns (SoT)

Behaviour of the Settings page's Market Locations tab under
[`frontend/src/Components/Settings/Standard Layout/Market Locations`](../../../frontend/src/Components/Settings/Standard%20Layout/Market%20Locations):
the markets a reader has saved and the ones an organisation shares with them, managing and reading
either, where each side of a job is priced by default, and the registry every priced surface across
the SPA reads a market from — and its Job Settings tab's per-market-group pricing table under
[`.../Job Settings`](../../../frontend/src/Components/Settings/Standard%20Layout/Job%20Settings).

## Does not own

- The stored shape, server-side composition, and release steps that moved a market onto its own lane
  → [../../backend/api/market-locations.md](../../backend/api/market-locations.md)
- The account's stored pricing shape, the schema upgrader's seed, and wire compatibility for the
  fields it retired → [../../backend/shared/pricing-defaults.md](../../backend/shared/pricing-defaults.md)
- The resolution ladder a market or order type is read through, and which side a surface asks for →
  [../pricing/defaults.md](../pricing/defaults.md)
- The Settings page's other frames — asset location, market character, custom system indexes, custom
  extras, blueprint settings, the four build kinds' custom structures form, layout settings — not yet
  documented here
- Linking or re-authorising a character → [../accounts/characters.md](../accounts/characters.md)

## Task map

| I need to… | Read |
|------------|------|
| Change what markets a priced surface may choose from, or how the composed set is read and cached | [market-locations.md](./market-locations.md) § The registry |
| Change the Market Locations tab, its table, or the priced-against controls | [market-locations.md](./market-locations.md) § The panel |
| Change what a row says about when it was last read, or why it is not answering | [market-locations.md](./market-locations.md) § What a market says about itself right now |
| Change how a market is added, edited, saved, or which document a write lands on | [market-locations.md](./market-locations.md) § Adding, editing and saving a market |
| Change the market group pricing panel, its picker, or how a group default is added or cleared | [job-settings.md](./job-settings.md) § Market group pricing |
