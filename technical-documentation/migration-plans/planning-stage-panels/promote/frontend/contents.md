# Frontend

## Owns (SoT)

SPA behaviour: React auth/session UX, credential acquisition, document-lock UI,
routing and page chrome, the normalised ESI asset and blueprint row collections
— their index hooks, the login prefetch that fills them, and shared
location-name resolution — the static EVE data files and the owners every surface
reads an item, a recipe or an ore yield through, the group page's scheduler character selection,
group name editing and job dependency tree, the Edit Job page — its stage tabs and header controls,
parent-job linking, and the Planning stage: its setups, blueprint library, output, material sourcing,
cost and returns panels, the Skills panel, and the broker fee, sales tax and sale location figures they
share with Selling — the job planner's job status
accordions, the reprocessing settings panel and its structure panel, the dashboard's watchlist and
tutorial-card row, the shared price history and price entry surfaces and where a
price resolves against by default, how a market price reaches the SPA and is kept
current — the source registry, the price cache and its two tiers, and a saved
citadel's own fetch — the Accounts page — its
roster and what a reader can do to a linked character, the corporations section, and how an
account sees the planners it can work in — the Settings page's Market Locations tab — the markets
a reader has saved and the ones an organisation shares with them, and where each side of a job is
priced by default — its Job Settings tab's per-market-group pricing table — its Custom Structures
tab — describing and saving the four places a job is built in, and the rig-conflict rule shared with
every editor offering two rig slots — and the app-shell
component layer a panel is built from — its panel and card surfaces, figure and status atoms,
labelled fields, scrolling tables, item market actions, and how a picture from EVE's image server is
asked for and drawn.

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
| Change the Accounts page's layout, account band, token storage, or citadel names section | [accounts/page.md](./accounts/page.md) |
| Change the linked-character roster, a character's action menu, or its ESI status display | [accounts/characters.md](./accounts/characters.md) |
| Change what the Accounts page shows about shared planners | [accounts/planners.md](./accounts/planners.md) |
| Change the asset row shape, its resolution rules, or how an asset view is assembled | [esi-collections/assets.md](./esi-collections/assets.md) |
| Change the blueprint row shape, corporation blueprint access, consolidation or library filters | [esi-collections/blueprints.md](./esi-collections/blueprints.md) |
| Change the index hooks, their scopes, or how a derived collection is shared | [esi-collections/row-collections.md](./esi-collections/row-collections.md) |
| Change what login prefetches, when, or under what budget | [esi-collections/prefetch.md](./esi-collections/prefetch.md) |
| Resolve a location or container id into a name | [esi-collections/location-names.md](./esi-collections/location-names.md) |
| Read a static EVE data file — items, recipes, ore yields — or add one | [static-data/contents.md](./static-data/contents.md) |
| Change the group scheduler's default character selection, the group name editor, or the job dependency tree | [group/contents.md](./group/contents.md) |
| Change the Edit Job page's stage tabs or header controls, the Planning stage's panels, the selling-charge figures they share, or which jobs the Link Parent Job dialogue offers | [editjob/contents.md](./editjob/contents.md) |
| Change the job planner's job status accordions or their expansion state | [jobplanner/contents.md](./jobplanner/contents.md) |
| Change the reprocessing settings panel, or the structure panel it tries yields under | [reprocessing/contents.md](./reprocessing/contents.md) |
| Change the price history chart, the price entry dialogue, or where a price resolves against by default | [pricing/contents.md](./pricing/contents.md) |
| Change how a market price is fetched, cached, kept fresh, or held on the device | [market-data/contents.md](./market-data/contents.md) |
| Change the dashboard's watchlist panel or its tutorial-card row | [dashboard/contents.md](./dashboard/contents.md) |
| Change the markets a reader has saved, the ones an organisation shares, which market a job is priced against by default, or a market group's own pricing default | [settings/contents.md](./settings/contents.md) |
| Change how a custom structure is described and saved, its field map, or the rig-conflict rule | [settings/contents.md](./settings/contents.md) |
| Change a shared panel, card, row, menu, figure, field or table atom, or an item's market actions | [components/contents.md](./components/contents.md) |
| Ask EVE's image server for a picture, or change what a missing one shows | [components/avatars.md](./components/avatars.md) |
| Frontend test entrypoints / depth | [../testing/frontend/contents.md](../testing/frontend/contents.md) |
