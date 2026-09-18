# ESI collections — tests

Live SoT for test depth across the SPA's normalised asset and blueprint collections: the row
builders, the index hooks and their shared cache, the login collection table and scheduler, what the
application holds of a collection for one character or corporation, the shared location-name
resolution, and the consumers that read the collections instead of building their own structure.
Behaviour → [frontend/esi-collections/contents.md](../../frontend/esi-collections/contents.md) for
the task map into the topics; each row below links the specific one it tests. Module entrypoints →
[contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Whole suite | From `frontend/`: `npm test -- --run` | Vitest; no browser, no stack |
| Asset tree | `npx vitest run src/Functions/Assets` | Builder, resolution, and the consumer assemblies |
| Blueprint tree | `npx vitest run src/Functions/Blueprints` | Row builder, consolidation, library filter |
| Prefetch | `npx vitest run src/Functions/EveESI/prefetch` | Collection table, scheduler and collection status |
| Coverage | `npm run coverage` | `vitest run --coverage` |

Fixture rows for both collections live in `frontend/src/tests/assetFixtures.js` and
`frontend/src/tests/blueprintFixtures.js`, so a builder test and a consumer-assembly test read the
same rows — where a shared meaning change between two consumers would otherwise pass unnoticed.

## Coverage map

**Depth:** Strong on the builders, the index hooks and cache, the scheduler, collection status and
location-name resolution, and the pure consumer-side assemblies. Thin on the components that render
the two libraries — the tree, the cards, the scope and filter chrome — which carry targeted tests for
specific behaviours rather than exhaustive coverage of the reshaped page.

### Tested

| Area | Topic | What the tests cover |
|------|-------|----------------------|
| `Functions/Assets/buildAssetNodes.js` | [assets.md](../../frontend/esi-collections/assets.md) | Nested containers, corporation offices and hangar divisions, Deliveries and asset safety, a holder outside the set, a fitted module whose ship is in space, a structure classified by id range, a self-holding row, a cyclic chain with a well-formed row beneath it, order independence, an empty list |
| `Functions/Blueprints/buildBlueprintRows.js` | [blueprints.md](../../frontend/esi-collections/blueprints.md) | The search-index join and a blueprint missing from it, a missing index entirely, originals against copies against a market stack, both owner types, type grouping and its order, and that repeated corporation rows stay visible rather than being collapsed |
| `Hooks/EveEsi/useAssetIndex.js`, `useBlueprintIndex.js` | [row-collections.md](../../frontend/esi-collections/row-collections.md) | Each scope's subscription, a corporation fetched once however many members it has, a corporation asset union across members, two consumers receiving the same collection object, and loading and error states |
| `Functions/Shared/collectionCache.js` | [row-collections.md](../../frontend/esi-collections/row-collections.md) | A hit on unchanged sources, a rebuild when any source, the source count, or the extra key changes |
| `Hooks/EveEsi/Character/useGetAllCharacterBlueprints.test.jsx` | [row-collections.md](../../frontend/esi-collections/row-collections.md) | The hook and its cache-reading counterpart return the same shape |
| `Functions/EveESI/prefetch/scheduler.js` | [prefetch.md](../../frontend/esi-collections/prefetch.md) | The table's contents pinned by name, per-character, per-corporation and per-division expansion, on-demand collections planning nothing, phase order within and across callers, the concurrency cap for one caller and for two, one fetch claimed once across callers, a caller arriving after an earlier drain finished, deferral when a rate-limit bucket is spent, the query gate closing the prefetch, and a failure reported without abandoning the rest |
| `Functions/EveESI/prefetch/collectionStatus.js` | [prefetch.md](../../frontend/esi-collections/prefetch.md) § Collection status | Fresh inside the collection's own refresh expectation and stale past it; a collection never prefetched told apart from one that is missing; unavailable when the token was never granted the scope; a failed fetch told apart from an access the character lacks; a wallet collection reported as its worst division; nothing to say about a corporation collection for a character in no corporation; the table split correctly between a character's rows and a corporation's |
| `Functions/EveESI/World/locationOutcome.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | The settled outcomes carrying the values the location-resolution status enum uses, and which HTTP statuses are a refusal against a failure |
| `Functions/EveESI/World/getUniverseNames.js`, `getCitadelData.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | A name, a refusal, an unacquirable token, a failed request and each failing status classified; the community rung reached only from a refusal, and not at all for an account that has opted out; the ids that reach the wire sent once each and never as an empty body, and a refused request marked as one not worth repeating |
| `Functions/EveESI/World/communityNames.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | Both directions of the community store: a name read back, many structures learned at once submitted in one request, only the last thing learned about a structure kept, nothing submitted for a structure ESI did not name, and what the store would not take kept and sent next time rather than dropped |
| `Functions/EveESI/World/nameLoader.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | One call for a tick's ids, a batch over a thousand split, two callers for one id asking once, an id ESI did not mention settling as unnamed, a failed call failing the ids it spoke for, the character ladder and the community store only after every refusal, a character that could not ask failing rather than settling, a region asked for in bulk rather than against a token, one unresolvable id isolated out of a refused batch so the rest are still named, and a batch refused for any other reason left unsplit |
| `Hooks/React Query/World/names.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | Two callers sharing one cache entry, a refusal kept, a failure cached nowhere and asked again |
| `Hooks/React Query/World/names.js` — `forgetNames` | [location-names.md](../../frontend/esi-collections/location-names.md) | The ids it is given forgotten and the rest left alone, and every name forgotten when it is given none — the handle whatever comes to watch for a changed account will reach for |
| `Hooks/EveEsi/useLocationNames.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | An id ESI answered about and had no name for handed on rather than withheld, so a surface can tell it from one still being asked about; asking only for what the store lacks, waiting for characters, writing through to the store, a failure reported rather than an empty result, the names that resolved kept when one fails, and the id asked for again on the next mount after a failure |
| `Components/Assets/assetLibraryView.names.test.jsx` | [location-names.md](../../frontend/esi-collections/location-names.md) | The rendered library against a faked ESI edge and nothing else: a station from the bulk lookup, a structure only an alt can dock at, a community name once every character is refused, no access when nobody can name it, a ship in space never asked about, a moon never asked about while the station beside it is named, the one id ESI will not resolve isolated so the rest still are, a structure a previous view already named not asked about again, each character asked exactly once, and a pass that fails asked again |
| `Hooks/EveEsi/World/useMarketData.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | A structure only an alt can dock at named through the real hook and loader, with only the ESI edges faked; the stations and systems its orders sit in named from the bulk lookup; and the region named even when no orders came back |
| `Hooks/EveEsi/World/useMarketHistoryData.js`, `Styled Components/LineGraph/priceHistory.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | The region named when the item has no history at all, and no name asked for when there is no region; the chart naming its region from the map it is handed, and saying the region is unknown when no name reached it |
| `Styled Components/Select/corporationOffices.js`, `Components/Dialogues/Shopping List/assetLocationsSelection.js` | [location-names.md](../../frontend/esi-collections/location-names.md) | An office and an asset location nobody can read offered saying so, ordered after the named ones and selectable. `corporationOffices.names.test.jsx` drives the same picker against a faked ESI edge only: an office only an alt can dock at named, one nobody can read offered saying so after the named ones, a community name taken once every character is refused, and every linked character asked before any of it is given up on |
| `Hooks/EveEsi/useAssetLocations.js` | [assets.md](../../frontend/esi-collections/assets.md) | Assembling a view from the collections and the shared name query, and the location lists offered for a dropdown, including a location held back until its name is known |
| `Components/Dialogues/Shopping List/Hooks/useShoppingListCorporationAssets.js` | [assets.md](../../frontend/esi-collections/assets.md) | The offices a corporation rents read by the shared rule; only the chosen office and division counted, the other office's contents counted when that one is chosen, nothing counted from a division the corporation does not fill, only the new office counted after the reader changes office, a list left alone while it is still being built or while the reader counts their own assets, and no names resolved here |
| `Components/Dialogues/Shopping List/assetLocationsSelection.names.test.jsx` | [location-names.md](../../frontend/esi-collections/location-names.md) | The shopping list's own location picker against a faked ESI edge only: a station from the bulk lookup, a structure only an alt can dock at, one nobody can read offered saying so after the named ones, a community name once every character is refused, and every linked character asked before any of it is given up on |
| `Functions/Assets/assetTree.js` — the location helpers | [assets.md](../../frontend/esi-collections/assets.md) | What a picker offers and in what order: a place nobody can read offered saying so and ordered last, a place nothing can name offered under the stand-in label and ordered between the named and the unreadable, and an id still being asked about withheld |
| `Components/Edit Job/editJobMutators.esiLinking.test.jsx` | [location-names.md](../../frontend/esi-collections/location-names.md) | The Building and Selling panels naming the places their rows sit at through the real hook — an offered order, a linked order, an offered job's facility told apart from the station holding it, a linked job's facility, and a facility nothing could name reading as unknown rather than as a blank caption |
| `Functions/Assets/assetsAtLocation.js`, `assetsOfType.js`, `assetTree.js`, `flattenAssetTree.js` | [assets.md](../../frontend/esi-collections/assets.md) | Assets placed directly, one and two containers deep, another location excluded, an empty location, a missing collection, a hangar division including a crate's contents, the containers on a path to a match kept with everything inside the match, and row keys stable across a rebuild |
| `Functions/Blueprints/consolidateBlueprints.js`, `blueprintLocations.js`, `blueprintsAtLocation.js`, `blueprintHolderLabel.js`, `filterLibraryBlueprints.js` | [blueprints.md](../../frontend/esi-collections/blueprints.md) | Interchangeable rows stacked into one card, a blueprint with an active job standing alone, a stack's slot count, a blueprint resolved through the asset collection and one the loaded assets do not place, each of the six library filters, and a reaction formula belonging to neither the original nor the copy view |
| `Functions/Shared/findBlueprintType.js`, `Functions/Helper/getAvailableBlueprints.js`, `Functions/Job Build/setupHelpers.js` | [blueprints.md](../../frontend/esi-collections/blueprints.md) | Originals against copies against reaction formulas, a blueprint the account does not hold, the owned and producible sets, the best-researched original, and a stack of originals offering every slot it holds rather than one |
| `Components/Edit Job/.../manufacturingLayout.jsx`, `reactionLayout.jsx` | [blueprints.md](../../frontend/esi-collections/blueprints.md) | The values each panel renders, a stack counted as the blueprints it holds, and that neither writes to the rows it renders |
| `Hooks/EveEsi/useAssetTree.js` | [assets.md](../../frontend/esi-collections/assets.md) | Assembling a view from the collections and the shared name query |
| `Hooks/EveEsi/useBlueprintLocations.js` | [blueprints.md](../../frontend/esi-collections/blueprints.md) | Resolving a blueprint's place through the asset collection and naming it |

### Thin

- The asset library's own components (`Components/Assets/assetLibraryView.jsx`, `Tree/assetTree.jsx`,
  `assetScopePicker.jsx` — [assets.md](../../frontend/esi-collections/assets.md)) and the blueprint
  library's (`BlueprintLibrary.jsx`, `blueprintGroup.jsx`, `blueprintGroupActions.jsx` —
  [blueprints.md](../../frontend/esi-collections/blueprints.md)) each carry rendering tests for
  specific scenarios — a character's
  assets, a corporation's offices, hiding assembled ships, an ancient relic, virtualisation mounting
  only what is near the viewport, a group's card states, a group's build and archive actions — rather
  than exhaustive coverage of the reshaped page: `BlueprintLibrary.jsx` has one test, and the combined
  scope picker, the search box that matches a container or a location, and the blueprint location
  filter are not driven together against a realistic account.
- The shared render chrome the reshape introduced (`Styled Components/Select/AppShellSelect.jsx`,
  `Chip/filterChipGroup.jsx`, `Avatar/OwnerAvatar.jsx`,
  `autocomplete/virtualisedListbox.jsx`, `autocomplete/virtualisedLocationSearch.jsx`) is tested in
  isolation for its own contract — value in, value out, what it shows with nothing to choose from —
  not for how the library pages compose it.
- The Accounts page's own display of collection status — the roster and corporation lists a reader
  actually sees — is covered on that page's own terms, not here → [accounts.md](./accounts.md) §
  Tested.

### Little / none

- Browser-level end to end: there is no Playwright or equivalent, so nothing drives a full page —
  picking a scope, opening a location, searching, narrowing by filter — through a real browser.
- Nothing drives the shopping list dialogue whole — opening it, choosing a character or a
  corporation, then an office and a hangar — against a faked ESI edge. Each picker beneath it is
  covered end to end and the hook that counts a corporation's assets is covered on its own, but the
  join between them is not.

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- A builder test and its matching consumer-assembly test read the same fixture rows, which is what
  would catch a shared meaning change between two consumers — for example a resolution rule the
  builder changes silently breaking an assembly that assumed the old one.
- `Components/Assets/assetLibraryView.names.test.jsx` and
  `Styled Components/Select/corporationOffices.names.test.jsx` fake only the HTTP edge, so the hook,
  the per-id cache, the loader and the resolvers beneath a rendered surface are all the real ones —
  the same reason `useMarketData.test.jsx` is trusted for the ladder rather than just for the panel.
