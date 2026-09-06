# ESI collections — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
No Go surfaces are in scope, so no `go fix -diff` step applies; SPA work follows
[`../../frontend/technical-rules.md`](../../frontend/technical-rules.md).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Every feature that reads a fetched ESI collection currently builds its own structure out of the raw
rows, with its own traversal, its own joins, and its own idea of the shape. This project replaces
that with **one normalised row collection per resource, produced at the React Query boundary**, that
each consumer filters or walks.

The rule the shape follows: **resolve the expensive relationships once, as fields on the rows, at
the point the data enters the app.** A field that carries a resolved answer turns a recursive walk
or a repeated join into an equality check.

Two collections have their **shape** redesigned, because they resolve each other's fields and share
one corporation access problem:

- **Assets** — a flat list whose parentage is a tree, read by seven features.
- **Blueprints** — a flat list joined against the search index, read by eight.

A third thing is in scope because the shapes cannot be made to pay without it: **how the collections
are fetched at login**. The bootstrap hand-writes eight character queries and six corporation
queries and fires all fourteen for every linked character, so a corporation-scoped collection is
fetched once per character rather than once per corporation. Correcting that means declaring a scope
kind for **all fourteen** collections, including the five whose row shapes stay as they are — their
fetch policy changes, their shapes do not.

The shape convention is intended to carry to those five later. That is **not** in scope here; see
§ Open decisions.

## Starting position

### Who reads assets today

| Consumer | Builds with | Wants |
|----------|-------------|-------|
| Asset library — [`assetsPage`](../../../frontend/src/Components/Assets/Character%20Assets/Standard%20Layout/assetsPage.jsx), character and corporation [`assetLocationFlagPage`](../../../frontend/src/Components/Assets/Character%20Assets/Standard%20Layout/assetLocationFlagPage.jsx), [`officesPage`](../../../frontend/src/Components/Assets/Corporation%20Assets/Standard%20Layout/officesPage.jsx) | `buildAssetMaps`, `buildAssetLocationFlagMaps`, `buildAssetMapsCorpOffices` | a tree |
| Assets dialogue — [`dialogueContent`](../../../frontend/src/Components/Dialogues/Assets/dialogueContent.jsx), character and corporation branches | `buildAssetTypeIDMaps` | a tree filtered to one `type_id`, plus each match's ancestors |
| Shopping list — [`useCharacterAssets`](../../../frontend/src/Components/Dialogues/Shopping%20List/Hooks/useCharacterAssets.js), [`useShoppingListCharacterAssets`](../../../frontend/src/Components/Dialogues/Shopping%20List/Hooks/useShoppingListCharacterAssets.js) | `findAssetsInLocation` + `convertAssetArrayIntoMapByTypeID` + `countAssetQuantityFromMap` | a quantity per `type_id` at one location |
| Shopping list — [`useCorporationAssets`](../../../frontend/src/Components/Dialogues/Shopping%20List/Hooks/useCorporationAssets.js), [`useShoppingListCorporationAssets`](../../../frontend/src/Components/Dialogues/Shopping%20List/Hooks/useShoppingListCorporationAssets.js) | `buildAssetMapsCorpOffices`, then discards everything but `assetsByLocationMap` | the same quantity, per office hangar |
| Job defaults — [`jobSettingsFrame`](../../../frontend/src/Components/Settings/Standard%20Layout/jobSettingsFrame.jsx), [`FirstLoginPlannerSetupStep`](../../../frontend/src/Components/First%20Login/planner-setup/FirstLoginPlannerSetupStep.jsx), shopping list | `getAssetLocationList` | a sorted list of distinct top-level locations |

Seven call sites run the same seven-step pipeline: read cached rows → build maps → collect
unresolved location ids → `getAssetLocationNames` + `getWorldData` → sort → write `worldData` →
five `setState` calls. Three of those steps are network, done seven times.

There are three hand-rolled traversals of the same parent/child relation:
`findParentAsset`/`findChildAssets` in `Functions/Assets/helpers/assetTraversal.js`, the office walk
inside `buildAssetMapsForCorporationOffices`, and `retrieveAssetLocation` in
`Functions/Assets/getAssetLocations.js`. Each calls `assetList.find()` or `.filter()` inside
recursion, so each is quadratic in the number of rows, and each disagrees with the others about what
counts as a parent.

### Who reads blueprints today

| Consumer | Reads via | Wants |
|----------|-----------|-------|
| [`BlueprintLibrary`](../../../frontend/src/Components/Blueprint%20Library/BlueprintLibrary.jsx) | cache readers + `blueprintFiltering` | all rows grouped by `type_id`, filtered and paginated |
| [`LibrarySearch`](../../../frontend/src/Components/Blueprint%20Library/LibrarySearch.jsx) | both `useGetAll*` hooks | loading state only |
| [`manufacturingLayout`](../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Blueprint%20Options/manufacturingLayout.jsx), [`reactionLayout`](../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Blueprint%20Options/reactionLayout.jsx) | both `useGetAll*` hooks | rows for one `type_id`, grouped by owner, with active-job state |
| [`setupHelpers`](../../../frontend/src/Functions/Job%20Build/setupHelpers.js) (two functions) | cache readers | best ME/TE for a `type_id`; count of owned originals |
| [`getAvailableBlueprints`](../../../frontend/src/Functions/Helper/getAvailableBlueprints.js) | cache readers | a `Set` of owned blueprint ids; a `Set` of producible item ids |
| [`findBlueprintType`](../../../frontend/src/Functions/Shared/findBlueprintType.js) | cache readers | `"bp"` or `"bpc"` for one `item_id` |
| [`virtualisedRecipeSearch`](../../../frontend/src/Styled%20Components/autocomplete/virtualisedRecipeSearch.jsx) | `getAvailableBlueprints` | the recipe list filtered to what can be built |
| Asset library `assetsPage` | `getCachedCharacterBlueprints` | `Map<item_id, blueprint>` to choose icon art |

### What triggers the fetches today

`runAppLogin` → `applyClientSessionAfterAppTokens` prefetches the main character, then
`runPostLoginAccountSync` calls `prefetchMultipleCharacters` for every linked character.
`Functions/Auth/appLoginFlow.js` and `Components/Auth/runPostLoginAccountSync.js` are the two entry
points; `Components/Accounts/AdditionalAccounts.jsx` uses the same path when a character is added.

`Hooks/React Query/useCharacterHooks.js` then runs, per character, eight character queries and six
corporation queries with `Promise.allSettled`, batching three characters at a time — up to
forty-two concurrent ESI requests. Assets are on neither list: they are fetched on demand when a
page or dialogue mounts.

### Defects the current structures produce

Each has a stage that closes it.

#### Assets

| # | Defect | Where |
|---|--------|-------|
| A1 | `useQuery` is called after an early return, so the hook count changes when a character hash arrives late | `Hooks/EveEsi/Character/useGetCharacterAssets.js` |
| A2 | `assetsByLocationMap.get(locationID)[0]` is unguarded — an office location holding nothing throws. Reached by the Offices tab **and** both shopping-list corporation hooks | `Functions/Assets/helpers/assetMaps.js` |
| A3 | `Object.values(corporationBlueprints[selectedCorporation])` is unguarded — a corporation with no cached blueprints throws | both corporation asset pages |
| A4 | `findChildAssets` recurses only in its `else` branch, so the first child placed in a new bucket is never descended into; nested container contents go missing | `assetTraversal.js` |
| A5 | `findParentAsset`'s "already included" test looks for the parent's `item_id` in a bucket that only ever holds children, so it never fires: the walk repeats and duplicate rows (and duplicate React keys) result | `assetTraversal.js` |
| A6 | The character location-flag page omits the query's loading state from its effect dependencies and guards, so it can build from an empty list and never rebuild. Reproduce by switching character while on Deliveries | character `assetLocationFlagPage.jsx` |
| A7 | `sort()` runs during render on arrays owned by component state, mutating them in place and re-sorting every render | `topLevelFolder.jsx`, `parentFolder.jsx`, `officesParentFolder.jsx` |
| A8 | None of the build effects cancel, so switching character or corporation twice quickly leaves whichever chain resolves last | all four asset library pages, both dialogue effects |
| A9 | The parent row hardcodes the item icon URL instead of calling `findAssetImageURL`, so a blueprint container renders the wrong art and the URL exists in two places | `parentFolder.jsx` |

#### Blueprints

| # | Defect | Where |
|---|--------|-------|
| B1 | The hook and the cache reader return **different shapes** for the same value: the hook's combine assigns the query wrapper `{ data, characterHash }`, the cache reader assigns the array. Consumers are split across both, and moving one between accessors fails silently — `getAvailableBlueprints`' `Array.isArray` guard would return an empty `Set`, leaving the recipe search with nothing buildable | `useGetAllCharacterBlueprints.js`, against `manufacturingLayout` / `reactionLayout` on one side and `BlueprintLibrary` / `setupHelpers` / `findBlueprintType` on the other |
| B2 | Corporation blueprints are fetched once per tracked director and concatenated with no deduplication, so every row appears N times. Three call sites carry a private workaround: `uniqueOutput`, `seenItemIds`, and the icon `Map`. Counts that do not dedupe — pagination totals, owned-original counts before their filter — are inflated | `useGetAllCorporationBlueprints.js` |
| B3 | `BlueprintLibrary` calls the cache readers during render, so its `useMemo` inputs are new objects every render and the filter and sort re-run every time. It also holds no subscription to blueprint data, and only picks up newly arrived rows because sibling queries re-render it | `BlueprintLibrary.jsx` |
| B4 | `virtualisedRecipeSearch` computes its available-blueprint filter in a `useMemo` whose only relevant dependency is the stable `queryClient`, so blueprints arriving after first render never reach it | `virtualisedRecipeSearch.jsx` |
| B5 | `reactionLayout` writes `owner_id` onto cached rows inside a `useMemo`, mutating React Query's cached objects | `reactionLayout.jsx` |
| B6 | Four of the six library filters run `itemList.some(...)` inside `allBlueprints.filter(...)`, scanning the whole search index per row on every filter change | `blueprintFiltering.js` |
| B7 | `sortBlueprints` orders by `a.quantity.toString().localeCompare(...)`; it happens to place originals before copies, undocumented and fragile | `blueprintFiltering.js` |
| B8 | Dead code: `Hooks/EveEsi/Corporation/useGetCorporationBlueprints.js` has no caller for either export; `allBlueprints` inside `groupBlueprintsByCorporation` is computed and unused; `manufacturingLayout` re-stamps `is_corporation`, which the fetch layer already sets | as listed |

#### Login and call path

| # | Defect | Where |
|---|--------|-------|
| L1 | All six corporation collections fan out per character, so a corporation-scoped collection is fetched once per member instead of once per corporation | `useCharacterHooks.js` |
| L2 | The main character is prefetched from two entry points — directly during session apply, and again via the account sync's character list | `appLoginFlow.js`, `runPostLoginAccountSync.js` |
| L3 | Concurrency is capped by character count, not request budget: three characters at fourteen queries each. The rate-limit status the queries consult in `retryDelay` is never consulted before firing | `useCharacterHooks.js` |
| L4 | Every prefetched query is forced `enabled: true`, overriding `isQueryExecutionEnabled()` — so login fetches for every character even when Tranquility is offline | `useCharacterHooks.js` |
| L5 | No phasing: collections the first screen needs compete with ones only read on the accounting surfaces | `useCharacterHooks.js` |
| L6 | Assets are prefetched nowhere, which is a defensible policy arrived at by omission rather than decision — and is why the asset pages carry their own load-state machinery | `useCharacterHooks.js` |
| L7 | `createTrackedQuery` takes a query name and character hash, ignores both, and returns the factory unchanged; fourteen are constructed per character | `useCharacterHooks.js` |
| L8 | `prefetchCharacterData` and `prefetchCorporationData` are two ninety-line copies differing only in their query list | `useCharacterHooks.js` |

Neither area has tests: nothing under `Components/Assets`, `Functions/Assets`, `Functions/Helper/blueprintFiltering.js` or the blueprint hooks, and the only blueprint tests are in the archive dialogue.

## The design

### One shape per collection

**Assets.**

```js
AssetNode = {
  itemId, typeId, quantity,
  flag,        // location_flag exactly as ESI gives it
  parentId,    // holding asset's item_id, or null when held by a location
  childIds,    // [] for leaves
  locationId,  // resolved: the station, structure or system it ultimately sits in
  rootFlag,    // resolved: the flag of its top-most ancestor at that location
  depth,       // distance from that location
}
```

`locationId` is what `retrieveAssetLocation`, `findParentAsset` and the office walk each recompute
today, three different ways. Resolved once, "the assets at location L" is an equality check.

`rootFlag` is the one the current code gets wrong. An item inside a container inside Deliveries
carries `location_flag: "Unlocked"`, not `"Deliveries"` — which is why the location-flag pages filter
by flag and then re-walk children to recover the rest, and why that walk carries defect A4. With the
compartment resolved to the top of the chain, "everything under Deliveries" is
`n.rootFlag === "Deliveries"`, and a corporation hangar is `n.rootFlag === "CorpSAG3"` rather than a
second value type.

**Blueprints.**

```js
BlueprintRow = {
  itemId, typeId,
  me, te, runs,
  isCopy,          // quantity === -2, decided once instead of at six call sites
  ownerType,       // "character" | "corporation"
  ownerId,         // CharacterHash or corporation_id
  locationId, flag,
  productTypeId,   // resolved: what this blueprint builds
  jobType,         // resolved: manufacturing | reaction
}
```

`productTypeId` and `jobType` are the blueprint equivalents of `locationId`/`rootFlag`: the search
index joins that four filter modes and `getAvailableBlueprintsByMaterialID` redo at call time.
Resolved once, defect B6's nested scan becomes `r.jobType === "manufacturing"`, and
`getAvailableBlueprintsByMaterialID` stops being async — it is only async because it awaits the
search index to perform that join.

The fetch layer already does a partial version of this: `Functions/EveESI/Character/getBlueprints.js`
stamps `CharacterHash`, `is_corporation` and `character_id`, and the corporation fetcher stamps
`corporation_id`. This finishes what those lines start, and gives `manufacturingLayout` no reason to
re-stamp ownership itself.

### What each consumer becomes

| Consumer | Assembly |
|----------|----------|
| Location tree | `nodes.filter(n => !n.parentId)` grouped by `locationId`; descend `childIds` |
| Deliveries / Asset Safety | `nodes.filter(n => n.rootFlag === flag)` |
| Corporation office hangar | `n.locationId === office && n.rootFlag === hangarRef` |
| Shopping list at a location | `n.locationId === L`, group by `typeId`, sum `quantity` |
| Dialogue "where is my X" | `n.typeId === X`, then walk `parentId` up for the path |
| Location dropdowns | distinct `locationId` |
| Asset search | filter on name, then walk `parentId` to expand the path to each hit |
| Blueprint library group | group rows by `typeId` |
| Library filters | `r.jobType === …`, `r.isCopy`, `!r.isCopy`, or a join to industry jobs on `itemId` for "active" |
| Owned-blueprint set | `new Set(rows.map(r => r.typeId))` |
| Producible-item set | `new Set(rows.map(r => r.productTypeId))` |
| `findBlueprintType` | `byItemId.get(id)?.isCopy` |
| Job setup ME/TE and original counts | filter `typeId`, sort on `isCopy`, `me`, `te` |
| Asset icon art | the blueprint collection keyed by `itemId` |

No consumer builds a tree, a map, or a traversal.

### Corporation scope: the two collections do not share an access model

This is the correction that shaped the project, and getting it backwards would be expensive.

- **Corporation blueprints are a single access point.** Any character with the required access
  returns the corporation's whole blueprint list. The current query is keyed by `characterHash`, so
  a corporation with three tracked directors makes three identical ESI calls, spends the rate budget
  three times, and produces the triplication behind defect B2. **The query is re-keyed by
  corporation**, using one authorised character's token to make the call. Deduplication is not the
  fix — the second and third fetches should not happen.

- **Corporation assets are visibility-limited per character.** Roles divide access to offices,
  hangars and divisions, and ESI returns only what the requesting character can see. The account's
  view of a corporation's assets is therefore the **union** of what each of its characters can see.
  The existing per-member fan-out in `useGetSingleCorporationAssets` is correct and stays; what it
  produces is merged and deduplicated by `item_id` into **one asset list per corporation**, which is
  what every consumer works from.

A direct consequence: a merged corporation asset set can be genuinely partial, so the node builder
must tolerate a row whose holder is referenced but absent. That rule is stated below and is not
defensive padding — it is the normal case for corporations.

### Rules the asset builder must hold

- **A parent that is not in the set is a location.** Resolution stops there and treats that holder
  as the `locationId`. The three current walks each handle this differently, which is where several
  of the defects above live.
- **Children are ordered once, in the builder**, not in a render pass.
- **The build is pure and synchronous.** No ESI, no store reads, no MUI. Quantity consumers must not
  wait on a station-name round trip, which today they do.
- **Cycles terminate.** A malformed chain must not recurse forever; resolution tracks the ids it has
  already walked.

### Where the collections are built

One hook per collection, one entry point each:

```js
useAssetIndex({ scope: "character",    id: hash })
useAssetIndex({ scope: "characters" })            // every character — the dialogue's "allUsers"
useAssetIndex({ scope: "corporation",  id })      // the merged union described above

useBlueprintIndex({ scope: "character" | "characters" | "corporation" | "all", id })
```

Each build is memoised on the identity of its source array with a module-level
`WeakMap<Row[], Normalised[]>`. React Query keeps `data` referentially stable until a refetch
replaces it, so a collection is built once per data version however many components ask, and is
collected when the cache entry is replaced. Consumers subscribe through the hook rather than reading
the cache during render, which is what closes defects B3 and B4.

**Departed from: storing the normalised rows as query data.** A derived query keyed
`["assetIndex", …]` would also share the result, and the SPA configures no persister so
serialisation is not a blocker. It was not taken because such a query has no real `queryFn`, its
invalidation has to be cascaded from the source query by hand, and React Query's structural sharing
does not apply to the derived value anyway. The `WeakMap` gives the same sharing with none of that.

### The two collections resolve each other

- A blueprint's `location_id` is frequently a container's `item_id`, so **where a blueprint is** can
  only be answered through the asset collection — which is why the library shows no location today.
  Giving `BlueprintRow` the same resolved `locationId` treatment makes it free.
- The asset tree needs blueprints to choose icon art, which is why `assetsPage` builds a blueprint
  `Map` of its own. It reads the blueprint collection instead.

Neither direction is a build-time dependency: each collection is built from its own rows, and the
cross-reads happen where the two are displayed together.

### What stays out of the shapes

- **Location and container names.** Resolution is async and access-dependent —
  `getAssetLocationList` deliberately retries missing ids against each character because access
  differs per character. It becomes one shared query, used by the consumers that render locations
  and skipped by the ones that only count.
- **Blueprint art rules.** `isCopy` is a field; which image URL that implies is a render concern.
- **Corporation hangar names.** `assetLocationRef` and its label live on the corporation object.
  The node carries the `rootFlag`; the label is looked up where it is displayed.
- **Repeated `type_id` lookups.** Filtering is O(n) per query, which is sub-millisecond at realistic
  row counts for every consumer except the shopping list checking hundreds of material types in a
  loop. That consumer does one grouping pass into a `typeId → rows` map first. It stays a
  consumer-local detail rather than something the shared shape carries.

## Wire compatibility

**None affected.** This is client-side derivation only: no stored document shape changes and no
backend or deployment surface is touched.

Two client-side changes are not additive and are called out so they are not made by accident:

- The corporation blueprints query key changes from the character hash to the corporation id.
  Nothing persists that key, so the cost is a one-time refetch after deploy, but every reader of
  that key moves in the same change.
- Any other corporation collection that Stage C settles as a single access point takes the same
  re-key, with the same all-readers-together rule.

## Phases

Phase 1 is this folder. Later stages run only after that gate.

### Stage A — the shapes and their builders

`buildAssetNodes(rows)` and `buildBlueprintRows(rows, searchIndex)` as pure modules, with the
resolution rules above, plus their tests. No consumer changes.

Done when: both builders exist with unit tests — for assets, nested containers, corporation offices
and hangars, Deliveries and Asset Safety compartments, a holder outside the set, a cyclic chain, an
empty list; for blueprints, originals and copies, both owner types, and a blueprint whose product is
missing from the search index. Closes A4 and A5 by construction, and B7 by making `isCopy` a field.

### Stage B — the query surface

`useAssetIndex` and `useBlueprintIndex` over the existing queries, with the `WeakMap` memo and their
scopes. Re-keys the corporation blueprints query by corporation and moves its readers together.
Keeps the corporation assets fan-out and merges its members' views into one list.

Done when: every scope returns a normalised collection, loading and error states are distinguishable
by callers, one shape exists per collection rather than two, and the hooks are covered. Closes A1,
B1, B2 and B8.

### Stage C — the collection table and the login call path

The scope kinds above are only worth having if something reads them. Today the login prefetch does
not: it hand-writes 8 character queries and 6 corporation queries per character and fires all of
them for every linked character.

This stage replaces those two near-identical functions with a **declared table** — one row per
collection, naming its query, its scope kind, and its phase — and a scheduler that computes the work
set from the account's characters and their corporations rather than from a list per character.

```js
{ key: "characterBlueprints",   scope: "character",           phase: "first-paint" }
{ key: "corporationBlueprints", scope: "corporation",         phase: "first-paint" }
{ key: "corporationAssets",     scope: "corporation-union",   phase: "on-demand"   }
```

For an account with five characters across two corporations, a `corporation`-scoped collection goes
from five fetches to two.

**Scope kinds must be settled per endpoint, not assumed.** Corporation blueprints are a single
access point and corporation assets are visibility-limited per character; the remaining five
corporation collections — journal, transactions, market orders, historic market orders, industry
jobs — are all fanned out per character today, and each needs the same question answered before its
row is written. Getting one wrong either wastes N-1 fetches or silently drops what a member could
see, so the table records the answer and why.

**Phase** decides what the first usable screen waits for. Blueprints, skills and industry jobs are
needed to render the planner and the recipe search; journal, transactions and historic orders are
only read on the accounting surfaces and can trail. Assets are the largest collection and are not
prefetched at all today — this stage makes that a recorded decision rather than an omission.

**Scheduling is by request budget, not by character count.** The current limit is three characters
at a time, which is fourteen queries each; the ESI rate-limit status the queries already consult in
their `retryDelay` is never consulted before firing. The scheduler caps concurrent requests and
walks the table in phase order.

Also settled here: the main character is prefetched from two entry points and collapses to one;
`createTrackedQuery` is deleted, being a wrapper that ignores both arguments it takes, with tracking
moved into the scheduler; and the forced `enabled: true` on every prefetched query — which currently
overrides `isQueryExecutionEnabled()` and so floods ESI during login even when Tranquility is
offline — is replaced by an explicit rule.

Scope note: this stage sets the **fetch policy** for all fourteen collections, including the five
whose row shapes are out of scope for this project. Their shapes stay as they are; only how often
and under whose token they are fetched changes.

Done when: one table describes every prefetched collection, the login path has a single entry point,
a corporation-scoped collection is fetched once per corporation, a corporation-union collection is
fetched once per member and merged, and concurrency is bounded by a request budget that consults the
rate-limit status. Closes L1 through L8.

### Stage D — location names as one shared query

`useLocationNames` replacing the seven copies of the resolve-and-write-`worldData` step, keeping the
per-character retry behaviour.

Done when: `worldData` is written from one place, and no consumer resolves names inside a build
effect.

### Stage E — consumer cutover

One consumer at a time, deleting each old helper as its last caller goes: asset library pages, the
assets dialogue, the shopping-list hooks, the location dropdowns, then the blueprint library, the
Edit Job blueprint panels, and the job-setup helpers. Closes A2, A3, A6, A8, B3, B4, B5 and B6.

The shopping list's reducer is **not** restructured here — it is waiting on its own redesign. Its
hooks are re-pointed at the node collection behind the shapes they already pass to the reducer.

Done when: `assetMaps.js`, `assetTraversal.js`, `assetQuantities.js`, the structural half of
`getAssetLocations.js`, the unused `assetFetch.js`, the `assetHelpers.js` facade, `blueprintFiltering.js`
and the dead `useGetCorporationBlueprints.js` are deleted rather than left forwarding.

### Stage F — the renderers

For assets: one node row and one tree component, virtualised with `@tanstack/react-virtual` (already
a dependency, already used by the virtualised autocompletes). Expansion becomes one `Set` owned by
the page rather than `useState` per row, so it survives a refetch. Closes A7 and A9, and deletes the
corporation-specific folder components.

For blueprints: the library group and entry components stop carrying their own deduplication and
owner-stamping workarounds, and blueprint location becomes displayable now that it is resolved.

Done when: the asset library renders every view through one component tree, a deeply nested location
stays responsive, and no component holds a workaround for an upstream shape defect.

Through Stage F both pages render the same rows and controls as they do today; what changes is that
the defects are gone.

### Stage G — page reshape (decision pending)

For the asset library: flatten the nested tab bars to a scope picker plus view chips, add a search
box across the tree, and move the surfaces to `AppShellPanel`. For the blueprint library: the same
app-shell move, and whatever the resolved location makes worth showing. This is the only stage that
changes what the pages look like, and it is separable — stopping after Stage F leaves them visually
as they are.

## Open decisions

| Decision | Options | Status |
|----------|---------|--------|
| Is Stage G in scope? | Parity only (stop at F) / include the reshape | Open — asked, not yet answered |
| How far do the dialogue and shopping list move in Stage E? | Full cutover to the normalised collection / re-point behind their current helper signatures, reducers untouched | Open — the plan assumes the second for the shopping list, the first for the dialogue |
| Does the **shape** convention extend to industry jobs, market orders and transactions? | Now, as a later stage here / a separate project citing this one | Open — out of scope as written; their **fetch policy** is already in scope via Stage C |
| What scope kind does each of the five remaining corporation collections take? | `corporation` (single access point) / `corporation-union` (per-member visibility) | Open — settled per endpoint during Stage C; blueprints and assets are already answered |
| Should login prefetch run at all while Tranquility is offline? | Skip and let pages fetch on demand / keep the current override | Open — Stage C replaces the blanket override with an explicit rule |

## Testing

Neither area has tests today, so coverage is written with each stage rather than after.

- **Stage A** carries the weight: fixture row sets exercising the resolution rules, including the
  cases behind A4, A5 and B7.
- **Stage B** covers the scopes and the memo, including that two consumers of the same scope receive
  the same collection, and that a corporation's blueprints are fetched once while its assets are the
  union of its members' views.
- **Stage C** covers the scheduler against a fixture account: how many requests each scope kind
  produces for characters spread across corporations, that phase order is respected, and that the
  budget cap holds.
- **Stage E** covers each consumer's assembly — a tree, a flag view, an office hangar, a quantity at
  a location, a library filter, an owned-original count — against one fixture, which is where a
  shared meaning change between two consumers would otherwise pass unnoticed.
- **Stage F** renders both libraries and checks expansion survives a refetch.

## Defect coverage

Every defect listed under Starting position is closed by exactly one stage. Nothing is left for a
later cleanup wave.

| Stage | Closes |
|-------|--------|
| A — shapes and builders | A4, A5, B7 |
| B — query surface | A1, B1, B2, B8 |
| C — collection table and login call path | L1–L8 |
| D — shared name resolution | none directly; removes the duplicated resolve step the others depend on |
| E — consumer cutover | A2, A3, A6, A8, B3, B4, B5, B6 |
| F — renderers | A7, A9 |
| G — page reshape | none; presentation only |

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — shapes and builders | Not started |
| B — query surface | Not started |
| C — collection table and login call path | Not started |
| D — shared name resolution | Not started |
| E — consumer cutover | Not started |
| F — renderers | Not started |
| G — page reshape | Not started, in-scope decision open |

## Promote map

On go-ahead:

1. The overlay's live-SoT draft promotes into a new topic `frontend/esi-collections/spa.md` — the row
   shapes, their resolution rules, the corporation access models, the index hooks and their scopes,
   the login collection table, and how a consumer assembles a view — with a row added to
   [`../../frontend/contents.md`](../../frontend/contents.md) task map.
2. The coverage this project adds is summarised into
   [`../../testing/frontend/contents.md`](../../testing/frontend/contents.md), which is a placeholder
   today and gains its first depth entries here: the builders and the scheduler as **Tested**, the
   consumer assemblies as **Tested**, the rendered libraries as **Thin**.
3. This folder is then deleted, and its row removed from
   [`../contents.md`](../contents.md). Nothing else cites it — verified with the grep in
   [`../documentation-rules.md`](../documentation-rules.md) § A promoted project folder is deleted.

## Handoff status

Phase 1 complete, no product work started. Start at Stage A: it is self-contained, changes no
consumer, and is where the correctness defects are closed. Stages B, C and D can proceed in any order
once A lands; E depends on B and D. The corporation blueprints re-key in Stage B is the only step
that must move all of its readers at once, and Stage C is what makes that re-key pay — until the
login path stops fanning corporation work over every character, the key change saves nothing.
