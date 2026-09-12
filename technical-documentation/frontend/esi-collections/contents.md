# Frontend — ESI collections

## Owns (SoT)

How the SPA turns fetched ESI assets and blueprints into one normalised row collection per resource
under [`frontend/src/Functions/Assets`](../../../frontend/src/Functions/Assets),
[`frontend/src/Functions/Blueprints`](../../../frontend/src/Functions/Blueprints) and
[`frontend/src/Hooks/EveEsi`](../../../frontend/src/Hooks/EveEsi): the row shapes and their
resolution rules, the corporation access model for each, the index hooks and the cache that shares a
derived collection, the shared location-name resolution, and how every prefetched ESI collection is
fetched at login.

## Does not own

- Login, tokens, sessions, the private-request path → [../auth/spa.md](../auth/spa.md)
- Document-lock UI → [../document-lock/spa.md](../document-lock/spa.md)
- Routing and page chrome → [../navigation/spa.md](../navigation/spa.md)
- The ESI endpoints themselves, their caching and their rate limiting → [backend/contents.md](../../backend/contents.md)
- Test depth → [testing/frontend/esi-collections.md](../../testing/frontend/esi-collections.md)

## Task map

| I need to… | Read |
|------------|------|
| Know what an asset node or a blueprint row carries, and how those fields are resolved | [assets.md](./assets.md), [blueprints.md](./blueprints.md) |
| Find the index hooks, their scopes, or how a derived collection is shared | [row-collections.md](./row-collections.md) |
| Handle an asset or blueprint whose holder is outside the loaded set | [assets.md](./assets.md) § Resolution rules |
| Read the corporation asset union, or the corporation blueprint single-access-point walk | [assets.md](./assets.md) § The corporation asset union, [blueprints.md](./blueprints.md) § Corporation blueprints as a single access point |
| Assemble a tree, a hangar view, a quantity at a location, or "where is my X" | [assets.md](./assets.md) § Assembling a view |
| Assemble a library filter, a consolidated card, or a stack count | [blueprints.md](./blueprints.md) § Consolidation and stack counts, § Library filters |
| Find where a blueprint sits | [blueprints.md](./blueprints.md) § Where a blueprint sits |
| See what the login path fetches, in what order, and under what budget | [prefetch.md](./prefetch.md) |
| Add a collection to the login prefetch, or change when one is fetched | [prefetch.md](./prefetch.md) § The collection table |
| Decide whether a corporation endpoint is fetched once or per member | [blueprints.md](./blueprints.md) § Corporation blueprints as a single access point |
| Resolve a location or container id into a name | [location-names.md](./location-names.md) |
| Show a location whose name is refused, absent, or could not be resolved | [assets.md](./assets.md) § Assembling a view, [location-names.md](./location-names.md) § What a lookup can settle on |
