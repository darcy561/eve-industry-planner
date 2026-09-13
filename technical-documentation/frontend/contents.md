# Frontend

## Owns (SoT)

SPA behaviour: React auth/session UX, credential acquisition, document-lock UI,
routing and page chrome, the normalised ESI asset and blueprint row collections
— their index hooks, the login prefetch that fills them, and shared
location-name resolution — the static item data
every surface reads a type's name and category from, the group page's scheduler character selection,
group name editing and job dependency tree, the Edit Job page's floating
step-navigation controls and parent-job linking, the job planner's job status
accordions, the reprocessing settings panel, the dashboard's watchlist and
tutorial-card row, and the shared price history and price entry surfaces.

## Does not own

- Auth vocabulary / wire contract / HTTP sessions → [backend/api/auth](../backend/api/auth/overview.md)
- Document-lock Redis/HTTP → [backend/api/document-lock](../backend/api/document-lock/overview.md)
- Stack/ops → [stack/](../stack/contents.md)
- What maintenance mode does across the stack → [backend/maintenance-mode.md](../backend/maintenance-mode.md)

## Task map

| I need to… | Read |
|------------|------|
| Change SPA auth, bootstrap, refresh UX, realtime auth client | [auth/spa.md](./auth/spa.md) |
| Change document-lock UI / Zustand / hooks | [document-lock/spa.md](./document-lock/spa.md) |
| Change routing, page chrome, or navigation behaviour | [navigation/spa.md](./navigation/spa.md) |
| Change the asset row shape, its resolution rules, or how an asset view is assembled | [esi-collections/assets.md](./esi-collections/assets.md) |
| Change the blueprint row shape, corporation blueprint access, consolidation or library filters | [esi-collections/blueprints.md](./esi-collections/blueprints.md) |
| Change the index hooks, their scopes, or how a derived collection is shared | [esi-collections/row-collections.md](./esi-collections/row-collections.md) |
| Change what login prefetches, when, or under what budget | [esi-collections/prefetch.md](./esi-collections/prefetch.md) |
| Resolve a location or container id into a name | [esi-collections/location-names.md](./esi-collections/location-names.md) |
| Turn a type id into an item's name, category or market group, or find what can be built | [static-data/contents.md](./static-data/contents.md) |
| Change the group scheduler's default character selection, the group name editor, or the job dependency tree | [group/contents.md](./group/contents.md) |
| Change the Edit Job page's floating step arrows, or which jobs the Link Parent Job dialogue offers | [editjob/contents.md](./editjob/contents.md) |
| Change the job planner's job status accordions or their expansion state | [jobplanner/contents.md](./jobplanner/contents.md) |
| Change the reprocessing settings panel | [reprocessing/contents.md](./reprocessing/contents.md) |
| Change the price history chart or the price entry dialogue | [pricing/contents.md](./pricing/contents.md) |
| Change the dashboard's watchlist panel or its tutorial-card row | [dashboard/contents.md](./dashboard/contents.md) |
| Frontend test entrypoints / depth | [../testing/frontend/contents.md](../testing/frontend/contents.md) |
