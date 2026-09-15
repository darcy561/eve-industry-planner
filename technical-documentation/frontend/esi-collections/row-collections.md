# ESI row collections (`frontend/src/Hooks/EveEsi`, `frontend/src/Functions/Shared`)

Live SoT for the machinery both the asset and the blueprint collections share: one normalised row
shape per resource, one hook per scope, and one cache that hands every consumer of the same scope
the same derived object. The shapes themselves — what an asset node or a blueprint row carries, and
the rules that resolve their fields — are owned by [assets.md](./assets.md) and
[blueprints.md](./blueprints.md); this topic is what both are built on rather than a third copy of
either.

## The shared pattern

Both collections resolve the relationships a consumer would otherwise recompute — a location, a
compartment, a product type — once, as fields on the row, at the point the data enters the app. A
field that already carries the answer turns what would be a recursive walk or a repeated join into
an equality check. Neither builder does ESI I/O, a store read, or anything asynchronous: a consumer
that only counts or filters never waits on a name round trip, which belongs to
[location-names.md](./location-names.md) alone.

## The index hooks and their scopes

`Hooks/EveEsi/useAssetIndex.js` and `Hooks/EveEsi/useBlueprintIndex.js` each take a scope and return
one normalised collection for it, alongside `isLoading`, `isError` and `error`. A scope subscribes
only to the queries it needs, so asking for one character does not open every character's query.

| Hook | Scopes |
|------|--------|
| `useAssetIndex` | `character`, `characters` (every tracked character), `corporation` (the merged union — [assets.md](./assets.md)), `all` |
| `useBlueprintIndex` | `character`, `characters`, `corporation` (re-keyed per corporation — [blueprints.md](./blueprints.md)), `all` |

`getCachedAssetIndex(queryClient, request)` and `getCachedBlueprintIndex(queryClient, request)` are
the counterparts for code that reads a collection without rendering — the job-setup helpers, the
recipe search's filter, the blueprint type lookup. Each shares its builder **and** its cache with the
matching hook, so a consumer moved between the two reads the identical object rather than a second
shape of the same value. Both readers treat a collection still arriving, or one whose last refetch
failed over rows fetched earlier, as nothing rather than as a partial or stale set — the same reading
the hook gives.

## Sharing a derived collection

`Functions/Shared/collectionCache.js` shares a built collection across every consumer asking for the
same scope. It holds each derived value keyed on the **first** source row array, since React Query
keeps a query's `data` referentially stable until a refetch replaces it — the same sources mean the
same derived value, and an entry is collected once its query data is replaced. Up to five entries can
share one first source at a time, evicted oldest first — enough for the character, characters,
corporation and all scopes that can all start from the same array without evicting each other on
every render.

Derivation happens in each hook's own body rather than inside `useQueries`' `combine`. React Query
structurally shares whatever `combine` returns, which would clone the derived collection and hand
each consumer its own copy; only the raw source arrays and the loading/error flags cross that
boundary, and those survive structural sharing untouched, so the shared cache still hits.

A `useMemo` cannot do the same job — it is per component instance, so two components asking for the
same scope would each build their own copy of the collection.

## Owner vocabulary

`Functions/Shared/ownerKind.js` defines `OWNER_KIND` (`character` / `corporation`), the vocabulary an
asset node's `owner.kind` and a blueprint row's `ownerType` both take, so a consumer comparing one
against the other compares like with like. It carries no user-store read of its own, because the
collection builders that need it are pure.

`Functions/Shared/eveOwner.js` resolves what the vocabulary names into what a person sees: `ownerName`
looks a character or corporation up on the roster, and `ownerImageUrl` resolves a character hash or a
corporation id to a picture URL, picking portrait or logo from the owner's kind and leaving the URL
itself to the image module ([avatars.md](../components/avatars.md)). Both read the user store, which
is why they sit apart from the pure builders rather than inside them.
