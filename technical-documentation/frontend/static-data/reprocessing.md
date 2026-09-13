# Reprocessing data (`frontend/src/Functions/Static/reprocessing.js`)

Live SoT for how the SPA reads what an ore, ice, moon ore or gas yields when it is reprocessed:
[`frontend/src/Functions/Static/reprocessing.js`](../../../frontend/src/Functions/Static/reprocessing.js).

The calculation that uses those yields — skills, structure bonuses, ore selection — belongs to
[`Functions/Reprocessing`](../../../frontend/src/Functions/Reprocessing) and is not documented here;
this topic covers the file and the two views taken from it.

## One owner, two views

`REPROCESSING_DATA` is a map keyed by type id, each entry carrying `{id, name, materials, batchSize,
itemType, reprocessingSkill}`. Both directions of the reprocessing page read it, and each wants a
different view, so the views are built once here rather than walked again on every calculation:

| Read | Wanted by |
|---|---|
| `selectableItems()` | choosing ore to produce the minerals a player asked for |
| `reprocessableByName(name)` | reading a list of ore the player pasted |
| `readReprocessingItems()` | the whole map, for a caller that needs it |

There is no hook. Both callers are already async functions running outside a render — the page
calculates on a submitted input rather than while drawing — so `primeReprocessing` is awaited by
whichever direction runs, and every read after that is a plain lookup.

`readReprocessingItems` answers `null` rather than an empty map before the file has loaded, so a
caller can tell "has not arrived" from "carries nothing".

## What selection may choose

`selectableItems()` admits **ore, unrefined ore, moon ore and ice**, and leaves out **gas**. Gas
reprocesses into gas rather than into minerals, so it is never a source for producing them —
`reprocessingFormulas` and `combineMinerals` treat it apart for the same reason.

That exclusion applies only to *choosing what to buy*. `reprocessableByName` matches gas like
anything else, because a player pasting gas is telling the page what they hold, which is a different
question from what it should recommend. The asymmetry is deliberate.

## Matching a pasted name

Through a name-keyed map built on first use, not a scan. A pasted list is matched a line at a time,
so a scan per line is a scan of every reprocessable item per line — the cost the item list's own
parsers were freed from, and the reason this owner exists at all rather than each caller reaching for
the file.

## Dropping what was primed

`resetReprocessing` forgets the file and both views built from it, so the next prime reads it again.
The app refreshes its static data on a timer and a new SDE build is a different file behind the same
key, so
[`useFetchStaticDataFiles`](../../../frontend/src/Hooks/App/useFetchStaticDataFiles.js) calls it when
the build has moved. The views are dropped with the file rather than separately: a `selectable` array
left behind would outlive the entries it was built from.
