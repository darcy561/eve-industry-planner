# What the static data payloads cost

Two sources, and they are not interchangeable. **Published sizes and heap figures** are from the
worker's local `tmp/sde/live_data`, a **dev** conversion, measured 2026-09-23. **Wire sizes** are from
live production the same day, via `https://www.eveindustryplanner.com`, build `3539543_v1`. The two
agree within a few percent where they overlap, so the dev sample is representative of scale — but it is
not the live figure, and live was serving only five of the seven file keys.

## Published, compact, and on the wire

| File | Published (dev) | Compact JSON | gzip | Live, brotli |
|---|---|---|---|---|
| `recipeList.json` | 10,125,957 | 4,849,131 | 422 KB | **226 KB** |
| `fullItemList.json` | 1,669,849 | 1,298,728 | 242 KB | **192 KB** |
| `searchIndex.json` | 493,529 | 366,508 | 58 KB | **45 KB** |
| `reprocessingData.json` | 97,896 | — | 7.8 KB | **6 KB** |
| `inventionModifiers.json` | 2,045 | — | 484 B | **0.4 KB** |
| **Cold load total** | **~12.4 MB** | | | **~470 KB** |

The first conclusion is that **the wire is not where the cost is**. A cold reader transfers under half
a megabyte for the whole table. What they pay it to is origin, every time, because none of it is edge
cached — see [cloudflare.md](./cloudflare.md).

## Indentation

`addJSONFile` writes every output through `jsoncodec.MarshalIndent`. Compacting halves
`recipeList.json` and removes about a quarter of `fullItemList.json`. Against the ~470 KB the reader
actually transfers, compression absorbs most of it — roughly 16%, about 75 KB per cold load. The real
saving is on the other side of the wire: the browser decompresses and parses 12.4 MB rather than
6.5 MB, and holds that much in the Cache API.

## Parse and heap

Measured with Node on desktop; a mid-range phone should be taken as several times slower.

| | Bytes | `JSON.parse` | Parsed heap |
|---|---|---|---|
| `recipeList.json`, parsed and keyed into its Map | 10.13 MB | 70 ms | 8.0 MB |
| `fullItemList.json` as published, `id → {type_id, name}` | 1.30 MB compact | 15 ms | **2.5 MB** |
| the same as `id → name` | 0.81 MB | — | **0.7 MB** |
| `searchIndex.json` | 0.49 MB | 3 ms | — |

`fullItemList` is the surprise: 19,537 tiny objects, each repeating the id that is already its key, cost
more heap per byte than the file eight times its size. Flattening the entry is a larger proportional
win than anything available on the recipe file.

## What is inside the recipe file

| | |
|---|---|
| Recipes | 4,234 |
| Mean entry, compact | 1,144 B |
| Median | 945 B |
| p95 | 2,254 B |
| Max | 2,668 B |
| Share of bytes in `activities` | **79%** |
| A 40-item job tree at the median | **~37 KB** |

The non-`activities` fields — `name`, `volume`, `basePrice`, `marketGroupID`, `portionSize` — are
identity data that `fullItemList` and `searchIndex` already carry for the same 4,234 items, and `_key`
repeats `itemID` in every row. `searchIndex` covers exactly the same 4,234 members in 367 KB compact.

## Who reads each file

| File | Read by | When |
|---|---|---|
| `RECIPE_LIST` | **one call site** — `buildJob.js` via `getItemRecipes(ids)` | only when a job is created |
| `FULL_ITEM_LIST` | everything that shows an item, narrowed through `useItemNames(ids)` | continuously |
| `SEARCH_INDEX` | the item picker and the fit parser | when picking or pasting |
| `REPROCESSING_DATA` | the reprocessing page | on that page |
| `MARKET_GROUPS` | the pricing ladder | any priced surface |
| `SOLAR_SYSTEMS` | system name lookups | occasional |
| `INVENTION_MODIFIERS` | invention figures | occasional |

`cacheAllStaticData` downloads all of them at page load regardless, serially. Parsing is lazy; the
download is not. A reader who opens the app to look at an existing job downloads the recipe table, the
search index and the reprocessing file and reads none of them — and an existing job does not need the
recipe table at all, because the job document stores the recipe snapshot it was built from.

`POST /api/v1/blueprints { idArray }` already answers recipes by id from a Mongo collection keyed by
`itemID`, and `getItemRecipes` already calls it when the file cannot answer.
