# Static data test depth

What is covered for the static EVE data files, their owners and the layer that delivers them. The
behaviour itself is [frontend/static-data/](../../frontend/static-data/contents.md).

## Where the depth is

| Covered | By |
|---|---|
| Holding a file: prime once, share one load, never remember a failure, drop views with the file | [`Functions/Static/staticFile.test.js`](../../../frontend/src/Functions/Static/staticFile.test.js) |
| Item records and the search index, priming separately | [`Functions/Static/items.test.js`](../../../frontend/src/Functions/Static/items.test.js) |
| The React reads over those files | [`Hooks/Static/useItems.test.jsx`](../../../frontend/src/Hooks/Static/useItems.test.jsx) |
| What ore selection may choose from, and matching a pasted ore name | [`Functions/Static/reprocessing.test.js`](../../../frontend/src/Functions/Static/reprocessing.test.js) |
| Recipes by id, either form, and when the API is asked instead | [`Functions/Static/recipes.test.js`](../../../frontend/src/Functions/Static/recipes.test.js), [`Functions/Job Build/getItemRecipes.test.js`](../../../frontend/src/Functions/Job%20Build/getItemRecipes.test.js) |
| The parsers that read what a player pasted | [`Functions/Reprocessing/parseOreInput.test.js`](../../../frontend/src/Functions/Reprocessing/parseOreInput.test.js), [`Functions/Reprocessing/toMinerals.test.js`](../../../frontend/src/Functions/Reprocessing/toMinerals.test.js) |

## Mocking a static file

Mock the whole delivery module through
[`frontend/src/tests/cachedDataMock.js`](../../../frontend/src/tests/cachedDataMock.js), overriding
only the readers a test cares about:

```js
vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({ getRecipeListFromCache: () => [ /* … */ ] });
});
```

**Naming only the readers a subject uses does not work.** Vitest throws on any export a factory
leaves out, so a hand-written mock fails on setup the moment its subject reaches for one more file —
and it fails complaining about the mock rather than about the code, which reads as an unrelated
breakage. The shared mock names every export, and its own test compares that list against the real
module rather than a copy, so it cannot fall behind as static files ship.

## Seeding rather than mocking

A test whose subject reads through a hook seeds the query entry instead, with
[`frontend/src/tests/seedItems.js`](../../../frontend/src/tests/seedItems.js) —
`seedItemRecords(queryClient, {34: "Tritanium"})` takes a name or a whole record, and
`seedItemSearchIndex` takes the array. It is the counterpart to `tests/seedLocationNames.js`, and it
writes what a reader would have written, so nothing has to mock the hook itself.

## What is not covered

`marketGroupData`'s own tests cover the market group tree, but the delivery layer in
`Functions/Helper/getCachedData.js` has no test for the build-version check or for what a changed
build drops — the behaviour is exercised only through the owners that consume it.
