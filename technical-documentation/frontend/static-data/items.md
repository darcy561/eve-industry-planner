# The item list (`frontend/src/Hooks/Static/useItems.js`)

Live SoT for how the SPA reads what an EVE type *is* — its name, its category, the market group it
sits in, and whether it can be built. Two static files answer that, and both are read through one
pair of owners:

- React layer:
  [`frontend/src/Hooks/Static/useItems.js`](../../../frontend/src/Hooks/Static/useItems.js)
- Synchronous layer:
  [`frontend/src/Functions/Static/items.js`](../../../frontend/src/Functions/Static/items.js)

Where the files come from, how they are versioned and cached at the edge belongs to
[`Functions/Helper/getCachedData.js`](../../../frontend/src/Functions/Helper/getCachedData.js); this
topic covers turning a type id into what a surface shows.

## Two files, never one name

They are different shapes for different questions, and nothing hands them to a caller under one
name — "item list" meaning either of them is what this consolidation was for.

| File | Shape | Answers |
|---|---|---|
| `FULL_ITEM_LIST` | map keyed by type id → `{name, type_id, category_id, market_group_id}` | what this type is |
| `SEARCH_INDEX` | array of `{itemID, name, blueprintID}` | which items can be built, and what makes them |

A view indexes the first; a reader searches the second. `useItemList` / `itemRecord` read the
records, `useItemSearchIndex` / `searchEntryByName` read the index.

## One entry for the file, reads on top

Both live in one React Query entry each — `["static", "FULL_ITEM_LIST"]` and
`["static", "SEARCH_INDEX"]` — rather than one entry per type. A type's record never changes while
the app is open and the whole set arrives in a single download, so there is nothing for a per-id
entry to fetch: it would slice an object already in memory. The per-id cache next door in
[location-names.md](../esi-collections/location-names.md) exists because each name there is its own
network lookup; this is the same shape [`useSolarSystemNames`](../../../frontend/src/Hooks/useSolarSystemNames.js)
already uses for the solar system table.

What a consumer takes is narrowed rather than the whole map: `useItemNames(ids)` gives the names for
the ids a view holds, so a component drawing a dozen rows does not carry every type in the game.
Those hooks key their memo on the ids themselves, because callers build the list in render — `rows`,
`data?.items ?? []` — and the array is new every time while the ids are not.

## What an unnameable item reads as

One label everywhere: **`Unknown Item - <type id>`**. A type the list has no record for is still
shown, never dropped — the figures beside it mean something against the id, and a row vanishing
reads as the item not existing.

`useItemNames` gives back nothing at all while the file is still arriving, rather than that label. An
id the list has not been read for yet is not an id it has no name for, and naming it early would show
the fallback for a frame and then replace it.

## Reading without a hook

Some callers cannot subscribe: a shopping list is priced from a class method, a pasted fit is parsed
from clipboard text, and material pricing walks the market group tree per material on every row of
every job. For them, reading is separate from loading — `primeItems` (or `primeItemSearchIndex`) is
awaited once by whatever can wait, and every read after that is a plain lookup that reports absence
rather than blocking.

The two files prime separately. Pricing a row should not wait on the file the fit importer reads, and
only the fit importer needs the index.

`readItemRecords` answers `null` rather than an empty map before the file has loaded, so a caller can
tell "has not arrived" from "carries nothing" — a lookup against an empty map answers nothing for
every type, which reads as the list disagreeing with what was asked of it.

Matching a name against the search index goes through a name-keyed map built on first use, not a scan
of the array. The callers matching names match a whole pasted fit at once, so a scan per line is a
scan of every buildable item per line.

## Dropping what was primed

`resetItems` forgets both files, so the next prime reads them again. The app refreshes its static
data on a timer and a new SDE build is a different file behind the same key, so what is held
synchronously has to be droppable without a reload —
[`useFetchStaticDataFiles`](../../../frontend/src/Hooks/App/useFetchStaticDataFiles.js) calls it
after each refresh.

Anything priming the records beside its own state has to guard on both halves. `primeMarketGroupData`
holds the market group tree itself but reads an item's group from here, so its early return asks
`readItemRecords()` as well as its own tree: guarding on the tree alone would short-circuit on a tree
whose items had been dropped independently, and every group would answer undefined while the tree
looked loaded.

## Seeding one in a test

[`frontend/src/tests/seedItems.js`](../../../frontend/src/tests/seedItems.js) writes the query entry
a reader would have written — `seedItemRecords(queryClient, {34: "Tritanium"})` takes a name or a
whole record, and `seedItemSearchIndex` takes the array. It is the counterpart to
`tests/seedLocationNames.js`, and the reason a test wanting named items seeds the cache rather than
mocking the hook.
