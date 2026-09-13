# Asset collection (`frontend/src/Functions/Assets`)

Live SoT for the asset node shape, how a node's location and compartment are resolved, the
corporation asset union, and how the asset library, the assets dialogue and the shopping list each
assemble a view from the collection instead of walking the raw rows themselves. Package:
[`frontend/src/Functions/Assets`](../../../frontend/src/Functions/Assets).

The index hook, the shared derivation cache and the owner vocabulary this topic uses are one thing,
owned by [row-collections.md](./row-collections.md) — read that for `useAssetIndex` and its scopes,
not here. Location and container *names* are [location-names.md](./location-names.md)'s. Where a
blueprint sits, which reads this collection, is [blueprints.md](./blueprints.md)'s.

## The node shape

`buildAssetNodes(rows)` (`buildAssetNodes.js`) turns raw ESI asset rows into one node per item, pure
and synchronous. It returns the node list in input order and a `Map` from `item_id` to node.
`buildAssetCollection(sources, owners)` is the multi-owner form — several raw row arrays and a
parallel owner list — used to build the corporation union below without losing which member's fetch
a stack came from; `buildAssetNodes` is `buildAssetCollection` for the single-owner case.

| Field | Holds |
|-------|-------|
| `itemId`, `typeId`, `quantity`, `flag` | as ESI gives them; `flag` is the raw `location_flag` |
| `isSingleton` | assembled, or otherwise unable to stack |
| `owner` | `{ kind, id }` — see [row-collections.md](./row-collections.md) § Owner vocabulary; `null` for a single-owner build |
| `parentId` / `childIds` | the holding asset's `item_id`, or `null` when held directly by a location; children ordered once, by type then item id |
| `locationId` | resolved: the station, structure, system or asset-safety sentinel the chain ends at |
| `locationKind` | resolved: what that id refers to — see below |
| `rootFlag` | resolved: the compartment the node sits in at that location |
| `depth` | resolved: distance from that location |

## Resolution rules

- **A holder outside the set is a location.** Resolution stops there — routine rather than an error,
  since a corporation member sees only the offices their roles reach, and ESI returns a ship's fitted
  modules while it is in space without returning the ship itself.
- **`locationKind` comes from the id's range** (`assetLocationConstants.js`, `resolveLocationKind`),
  classified against [EVE's published id ranges](https://developers.eveonline.com/docs/guides/id-ranges/):
  asset safety is the sentinel `2004`; regions, constellations, systems (abyssal systems separately),
  celestials, stargates, stations and station folders each have their own band; a spawned item — a
  player structure, an assembled ship, a container — is anything at or above `1000000000000`. An id
  outside every one of those ranges is `UNKNOWN` rather than assumed to be a structure. A row's
  `location_type` cannot separate a structure from a container on its own — both arrive as `"item"`
  — so the range answers it from the id instead.
- **A ship in space is told apart from a structure by what is filed inside it, not by its id.** A
  ship's item id sits in the same spawned-item range a structure's does, so a holder outside the
  asset set — one already read as a location by the rule above — is reclassified as `SHIP` when what
  the node sits in carries a fitting-slot, bay or cargo flag (`assetLocationConstants.isShipHoldFlag`).
  A ship's `locationKind` is settled this way rather than left as `STRUCTURE`, which is what stops a
  ship in space being asked of ESI as a place — see [location-names.md](./location-names.md).
- **A place flag stops resolution there rather than inheriting further.** `OfficeFolder`, `Hangar`,
  `Deliveries`, `CorpDeliveries`, `CorporationGoalDeliveries` and `AssetSafety` mark a node as sitting
  *at* a place rather than being held by whatever row its `location_id` names, which is what lets a
  corporation's own structure be its own location rather than the system beyond it.
- **An office folder is a wrapper, not a compartment.** A hangar division inherits its own flag
  (`CorpSAG3`) rather than the `OfficeFolder` above it; everything below the division inherits the
  division.
- **Cycles terminate.** A malformed chain is cut at the row that closes it, so rows hanging beneath a
  cycle keep their holder regardless of row order.
- **A row is kept once per `item_id`.** The corporation union below deduplicates the same row as it
  arrives from more than one member.

`assembledShipIds.js` and `assetPresentation.js` build on the node shape rather than extending it.
`assembledShipIds` finds assembled hulls from `isSingleton`, the SDE `category_id`, and — for a hull
the static item list carries no category for — whether the node holds children flagged as ship
fittings (`HiSlot`, `MedSlot`, `LoSlot`, `SubSystemSlot`, `SubSystemBay`, `DroneBay`, `FighterBay`,
`FighterTube`, `FrigateEscapeBay`, `Specialized`; deliberately not `RigSlot`, which an Upwell
structure also carries). It is a different list from `isShipHoldFlag` above, and deliberately so: one
answers whether an *item* is an assembled ship, the other whether the thing *holding* an item is a
ship, and admitting `Cargo` to the first would take containers with it. `assetPresentation.js`
resolves the image url — an ancient relic (`category_id` 34) is served only as its `relic` variant —
and the display name, falling back to **`"Unknown Item - <type_id>"`** for a type the static item
list does not name: the static list names every *published* type, so an unpublished one — a SKIN
component, a removed item, a test-server oddity a player still holds — renders this way regardless of
whether it has a resolvable category. The same fallback applies to a blueprint's type;
[blueprints.md](./blueprints.md) points back here rather than restating it.

## The corporation asset union

Roles gate access to individual offices, hangars and divisions, so no single character's fetch sees
a corporation's whole asset set. The account's view is the **union** of what each tracked member can
see. `useAssetIndex`'s `corporation` scope fans a query out over every member and hands the merged
rows — one array per member, with its owner attached — to `buildAssetCollection`, which deduplicates
by `item_id` as it merges.

`Hooks/EveEsi/useGetSingleCorporationAssets.js` performs the same per-member fan-out and dedup
independently, for the shopping list's corporation hooks, which read the merged rows directly rather
than through the node collection.

## Assembling a view

| Need | Reads |
|------|-------|
| The rows at one location, grouped by type | `assetsAtLocation.js` |
| Everything under one location or compartment, for a library tree | `assetTree.js` (`assetRowsByLocation`, `orderLocations`), consumed by `Hooks/EveEsi/useAssetTree.js` |
| The flat, virtualisable row list a tree renders | `flattenAssetTree.js` — a row's `key` names what it is rather than where it sits, so an expansion `Set` owned by the page survives a refetch or a reorder |
| Where a type is held, and the containers on the path to it | `assetsOfType.js` — everything on a path to a matching stack is kept, and everything inside a match; an office folder is read through rather than shown |
| Named locations for a dropdown | `Hooks/EveEsi/useAssetLocations.js`, pairing `useAssetIndex` with [location-names.md](./location-names.md) |
| The distinct locations a collection's assets sit at, and the ids among them nothing will ever name | `assetLocationIds.js` — `assetLocationIds` for the first; `unnameableLocationIds` for a ship in space, filtered out of what any picker hands to the names hook |
| The three things every asset view needs at once — the collection, what each row is called, and the names their owner gave the containers | `Hooks/EveEsi/useAssetSource.js`, beneath `useAssetTree` and `useAssetsOfType` |

What a row is called comes from a static file rather than from ESI ([static-data/items.md](../static-data/items.md)),
and a view cannot draw a row without it — so `useAssetSource` reports that file's failure as the
collection's failure rather than as a slower load. A view drawing rows with every name missing would
be worse than one that says it could not load.

`useAssetTree.js` pairs the node collection, the blueprint collection and the shared name query into
everything one asset view renders. Blueprints are always excluded from an asset view — they have
their own library, [blueprints.md](./blueprints.md) — except an ancient relic, which ESI returns from
the blueprints endpoint because it carries runs the way a copy does but is a material a player holds,
not a blueprint.

A location nobody could name is shown saying so, never dropped, so a genuine access problem never
reads as the place simply not existing. `describeLocation`, `byLocationOrder`, `orderLocations` and
`locationOptions` (`assetTree.js`) give every view that ordering and that shape.

The states a view can show say different things and are ordered by how much each tells the reader:
the named places first, alphabetically; then a place carrying no name — either because ESI answered
and had none, under `UNNAMED_LOCATION_LABEL`, or because the lookup did not settle, under
`UNRESOLVED_LOCATION_LABEL`; then the places the account cannot read. Those are the one wording for
each, which every surface reads rather than re-types. A stand-in label begins with a letter like any
other, so without a rule of its own it would sort into the middle of the real names.

A picker withholds an id still being asked about: it has no entry in the names map yet, and a row
with no label says nothing a reader can act on when the name is moments away. A tree built from
`orderLocations` keeps its place instead, because the assets sitting there are visible whether or
not the place has a name.

An id whose lookup **failed** has no entry either — a failure is never cached, and it will not gain
one this session — so it is indistinguishable there from one still being asked about.
`useLocationNames` answers `failed` for exactly those ids, and every surface passes that set to
`describeLocation`.

Every picker passes it, because each holds the reader's choice somewhere that outlives the list — a
stored default station, a dialogue's selection, a filter in the URL. A place missing from the list
reads as no choice at all while that id still stands: the box renders blank or resets itself while
the view stays narrowed to a place the reader can no longer see.

## Topic-only detail

- A ship flying in space is absent from the asset endpoint's own answer while its fitted modules are
  not, so each module names the ship's item id as its location. That id is never asked about: it
  carries no location kind that either naming path answers for, and it is filtered out of what
  reaches [location-names.md](./location-names.md)'s hook before any request is made.
