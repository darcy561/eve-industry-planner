# ESI collections

## Owns

Plan, stage notes and behaviour overlay for replacing the SPA's per-consumer structures over fetched
ESI collections with one normalised row collection per resource, produced at the React Query
boundary.

In scope: **assets** and **blueprints** — their row shapes, the rules that resolve a row's location,
compartment, product and job type, the corporation access model for each, the index hooks and their
scopes, the shared location-name query, and the cutover of the fifteen call sites that read the two
collections today.

Also in scope, because the shapes cannot pay without it: **how every prefetched collection is
fetched at login** — the declared scope kind per collection, the phase it belongs to, the request
budget that bounds it, and the login entry points that trigger it. That covers all fourteen
prefetched collections, including the five whose row shapes stay as they are.

Also owns the defect list that motivates the work and the stage that closes each one, and the drafts
of the live topic and testing entries this project promotes into — neither of which exists today.

## Does not own

- The **row shapes** of industry jobs, market orders, transactions, journal and skills — the same `useGetAll*` / `getAllCached*` pattern, deliberately out of scope; their **fetch policy** is in scope. See [plan.md](./plan.md) § Open decisions
- Authentication itself — tokens, sessions, refresh, the cloud resume path → [frontend/auth/spa.md](../../frontend/auth/spa.md). This project changes what the login path *triggers*, not how it authenticates
- Live SPA conventions (React 19 idioms, class getters, comment density) → [frontend/technical-rules.md](../../frontend/technical-rules.md)
- The ESI endpoints themselves, their caching and their rate limiting → [backend/contents.md](../../backend/contents.md)
- The shopping list's reducer and its own pending redesign — this project re-points its lookups and leaves its internals alone
- The blueprint archive dialogue and the statistics behind it → [archived-jobs-stats/contents.md](../archived-jobs-stats/contents.md)
- The corporation object, its hangars and `assetLocationRef` labels → the account store, unchanged by this project
- Live behaviour after promote → a new `frontend/esi-collections/spa.md` (created only when this project closes)

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, stages and done-when | [plan.md](./plan.md) |
| See who reads assets today and what each wants | [plan.md](./plan.md) § Who reads assets today |
| See who reads blueprints today and what each wants | [plan.md](./plan.md) § Who reads blueprints today |
| Find the defects this project closes, and where each lives | [plan.md](./plan.md) § Defects the current structures produce |
| Know what an asset node carries | [plan.md](./plan.md) § One shape per collection |
| Know what a blueprint row carries, and what is already stamped at fetch | [plan.md](./plan.md) § One shape per collection |
| Understand why a row's location, compartment, product and job type are resolved fields | [plan.md](./plan.md) § One shape per collection |
| Decide how to key or fan out a corporation query | [plan.md](./plan.md) § Corporation scope: the two collections do not share an access model |
| Handle an asset whose holder is not in the set | [plan.md](./plan.md) §§ Corporation scope, Rules the asset builder must hold |
| Know where the collections are built and how a build is shared | [plan.md](./plan.md) § Where the collections are built |
| See why the collections are not stored as query data | [plan.md](./plan.md) § Departed from: storing the normalised rows as query data |
| Find where a blueprint is, or what art an asset shows | [plan.md](./plan.md) § The two collections resolve each other |
| Assemble a tree, a hangar view, a quantity, a library filter or a search | [plan.md](./plan.md) § What each consumer becomes |
| Check what this changes for cached or wire surfaces | [plan.md](./plan.md) § Wire compatibility |
| See what the login path triggers today, and from where | [plan.md](./plan.md) § What triggers the fetches today |
| Add a collection to the login prefetch, or change when one is fetched | [plan.md](./plan.md) § Stage C |
| Decide whether a corporation endpoint is fetched once or per member | [plan.md](./plan.md) §§ Corporation scope, Stage C |
| Bound how many ESI requests login makes | [plan.md](./plan.md) § Stage C |
| Cut a consumer over, and know what gets deleted with it | [plan.md](./plan.md) § Stage E |
| Decide whether either page's appearance changes | [plan.md](./plan.md) §§ Stage G, Open decisions |
| Find which stage closes a given defect | [plan.md](./plan.md) § Defect coverage |
| Know what tests a stage owes before it is done | [plan.md](./plan.md) § Testing |
| See what has landed and what is still open | [plan.md](./plan.md) § Stage status |
| Add to the live topic this project will promote | [overlay.md](./overlay.md) § Draft for `frontend/esi-collections/spa.md` |
| Record the coverage this project adds | [overlay.md](./overlay.md) § Draft for `testing/frontend/` |
| Know how this data is shaped today, before any stage lands | [overlay.md](./overlay.md) § Current behaviour |
| Read how a stage works after it lands | [overlay.md](./overlay.md) |
| Promote this project into live documentation | [plan.md](./plan.md) § Promote map |
