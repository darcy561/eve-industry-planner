# Frontend — static data

## Owns (SoT)

How the SPA gets the static EVE data files and reads them: the delivery layer beneath all of them —
the Cache API, build versioning and the check that keeps them current — and the one owner each file
is read through.

| File | Owner | Topic |
|---|---|---|
| `FULL_ITEM_LIST` | [`Functions/Static/items.js`](../../../frontend/src/Functions/Static/items.js), [`Hooks/Static/useItems.js`](../../../frontend/src/Hooks/Static/useItems.js) | [items.md](./items.md) |
| `SEARCH_INDEX` | the same pair | [items.md](./items.md) |
| `REPROCESSING_DATA` | [`Functions/Static/reprocessing.js`](../../../frontend/src/Functions/Static/reprocessing.js) | [reprocessing.md](./reprocessing.md) |
| `RECIPE_LIST` | [`Functions/Static/recipes.js`](../../../frontend/src/Functions/Static/recipes.js) | [recipes.md](./recipes.md) |
| `MARKET_GROUPS` | [`Functions/MarketData/marketGroupData.js`](../../../frontend/src/Functions/MarketData/marketGroupData.js) | not yet written |
| `SOLAR_SYSTEMS` | [`Hooks/useSolarSystemNames.js`](../../../frontend/src/Hooks/useSolarSystemNames.js) | not yet written |

Nothing outside an owner reaches for a static file or builds its query key.

## Does not own

- Which files the server publishes and what goes in them → [`services/shared/core/sde/`](../../../services/shared/core/sde/)
- What the pricing ladder does with an item's market group → [../pricing/contents.md](../pricing/contents.md)
- What the reprocessing page does with the yields → [../reprocessing/contents.md](../reprocessing/contents.md)
- Turning a location or container id into a name → [../esi-collections/location-names.md](../esi-collections/location-names.md)

## Task map

| I need to… | Read |
|------------|------|
| Know how a file reaches the browser, or when it is fetched again | [delivery.md](./delivery.md) |
| Change what happens when a new SDE build ships | [delivery.md](./delivery.md) § The build is what decides whether there is work |
| Add a static file, or hold one for reading without awaiting | [staticFile.md](./staticFile.md) |
| Derive a value from a file without it outliving the file | [staticFile.md](./staticFile.md) § A view is registered, not held beside the file |
| Match a name a player pasted against a file | [staticFile.md](./staticFile.md) § Matching what a player pasted |
| Turn a type id into a name, a category or a market group | [items.md](./items.md) |
| Find which items can be built, or match a pasted name to an item | [items.md](./items.md) § Two files, never one name |
| Read item data outside a render — a class method, a parser, a pricing walk | [items.md](./items.md) § Reading without a hook |
| Show an item the list has no record for | [items.md](./items.md) § What an unnameable item reads as |
| Read what an ore or ice yields, or match a pasted ore name | [reprocessing.md](./reprocessing.md) |
| Know which items ore selection may choose from | [reprocessing.md](./reprocessing.md) § What selection may choose |
| Read how an item is made, or change when the API is asked instead | [recipes.md](./recipes.md) |
| Seed item names in a test | [items.md](./items.md) § Seeding one in a test |
