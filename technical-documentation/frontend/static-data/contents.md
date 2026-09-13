# Frontend — static data

## Owns (SoT)

How the SPA reads the static EVE data files it downloads and caches — the item records, the
buildable-item search index, what can be reprocessed and how each item is made, through their owners
under
[`frontend/src/Hooks/Static`](../../../frontend/src/Hooks/Static) and
[`frontend/src/Functions/Static`](../../../frontend/src/Functions/Static): which file answers which
question, how a consumer narrows to the ids it holds, what an unnameable item reads as, and how a
caller that cannot use a hook reads synchronously.

## Does not own

- Where the files come from, how they are versioned, and the Cache API beneath them →
  [`frontend/src/Functions/Helper/getCachedData.js`](../../../frontend/src/Functions/Helper/getCachedData.js)
- Turning a location or container id into a name → [../esi-collections/location-names.md](../esi-collections/location-names.md)
- The market group tree and the pricing rung that walks it → [../pricing/contents.md](../pricing/contents.md)
- What the reprocessing page does with the yields → [../reprocessing/contents.md](../reprocessing/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Turn a type id into a name, a category or a market group | [items.md](./items.md) |
| Read what an ore or ice yields, or match a pasted ore name | [reprocessing.md](./reprocessing.md) |
| Read how an item is made, or change when the API is asked instead | [recipes.md](./recipes.md) |
| Know which items ore selection may choose from | [reprocessing.md](./reprocessing.md) § What selection may choose |
| Find which items can be built, or match a pasted name to an item | [items.md](./items.md) § Two files, never one name |
| Read item data outside a render — a class method, a parser, a pricing walk | [items.md](./items.md) § Reading without a hook |
| Show an item the list has no record for | [items.md](./items.md) § What an unnameable item reads as |
| Seed item names in a test | [items.md](./items.md) § Seeding one in a test |
