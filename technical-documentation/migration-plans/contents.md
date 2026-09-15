# Migration plans

## Owns

Decision/history/work logs for long-running migrations. **Not SoT.**

## Does not own

- Live contracts → promote into [frontend/](../frontend/contents.md), [backend/](../backend/contents.md), [stack/](../stack/contents.md), or [deployment/](../deployment/contents.md) only when a project is complete and promotion is approved (see [documentation-rules.md](./documentation-rules.md))

## Task map

| I need to… | Read |
|------------|------|
| Entity id encryption (entity refs, refresh-token encryption at rest) | [entity-id-encryption/contents.md](./entity-id-encryption/contents.md) |
| Swarm stack migration (**promoted** — kept only because changestream-tenant-scale cites its overlays) | [swarm-stack/contents.md](./swarm-stack/contents.md) |
| Changestream tenant scale (publisher queues / metrics / future auto-detect) | [changestream-tenant-scale/contents.md](./changestream-tenant-scale/contents.md) |
| Shared planners (planner as a scope, membership, invites, the owner block, realtime consistency and the document lock under more than one writer) | [shared-planners/contents.md](./shared-planners/contents.md) |
| Archived jobs statistics (rollups, snapshots, corp aggregation) | [archived-jobs-stats/contents.md](./archived-jobs-stats/contents.md) |
| Collection naming (**promoted** — kept only because archived-jobs-stats cites its renames; live SoT in [backend/shared/mongo.md](../backend/shared/mongo.md)) | [collection-naming/contents.md](./collection-naming/contents.md) |
| Go 1.27 adoption (json/v2, simulated-time tests, `go fix` sweep) | [go-127-adoption/contents.md](./go-127-adoption/contents.md) |
| Mongo test database (a database of the tests' own, dropped between runs, and the live suite in CI) | [mongo-test-database/contents.md](./mongo-test-database/contents.md) |
| Document write granularity (whole-document writes to field-scoped ones, and how broad the document lock has to be; **found by shared-planners Stage G**) | [document-write-granularity/contents.md](./document-write-granularity/contents.md) |
| Document defaults (the defaults a job and a group are born with, the schema upgrader on their read path, and the extras category id space; **found by the model parity sweep**) | [document-defaults/contents.md](./document-defaults/contents.md) |
| Planning stage panels (splitting the Edit Job market panel; selling costs at plan time; speculative child jobs) | [planning-stage-panels/contents.md](./planning-stage-panels/contents.md) |
| Auth hardening (session rejection shape, account-wide revocation, auth observability and the outage runbook, cloud ESI credential failures, bootstrap half-success) | [auth-hardening/contents.md](./auth-hardening/contents.md) |
| Accounts page (redesigning the page onto the app-shell design, retiring the two-layout `appearance` fork, and the per-character ESI data status and shared-planner sections it grows; **split out of the app-shell rollout, which converts but does not redesign**) | [accounts-page/contents.md](./accounts-page/contents.md) |
| Effect-driven state synchronisation (**promoted** — kept only because job-document-drafts and react-19-idioms cite its verdicts; live SoT in [frontend/technical-rules.md](../frontend/technical-rules.md) and the frontend area task map) | [effect-state-sync/contents.md](./effect-state-sync/contents.md) |
| Job document drafts (the job document's stored shape, and holding an open job as a base plus what changed rather than a rebuilt instance; the reshape rides the shared-planners release) | [job-document-drafts/contents.md](./job-document-drafts/contents.md) |
| Market pricing defaults (retiring the account's single market default for separate buying and selling defaults, and keying defaults to an item's market group; **found while splitting the Planning stage panels**) | [market-pricing-defaults/contents.md](./market-pricing-defaults/contents.md) |
| EVE image server (the one place the SPA builds an `images.evetech.net` URL, which sizes may be asked for, and what a missing picture looks like; **found while giving market group rows an icon**) | [eve-image-server/contents.md](./eve-image-server/contents.md) |
| Custom structure model (one structure class and one stored array keyed by the kind each row already carries, in place of four lanes filled by three classes; **found while working out what market-price-delivery's last stage waits on**) | [custom-structure-model/contents.md](./custom-structure-model/contents.md) |
| Market price delivery (asking for a price by market instead of receiving every hub, freshness from a source's own refresh clock, fetching reader-saved stations and the citadels that reach private markets in the browser, and the two tiers market data is held in) | [market-price-delivery/contents.md](./market-price-delivery/contents.md) |
| Realtime message routing (a message naming who receives it rather than being routed by its family name, the entitled-clients index beside the subscribed one, and reaching a corporation's members while they work elsewhere; **found while adding the static data announcement**) | [realtime-message-routing/contents.md](./realtime-message-routing/contents.md) |
| React 19 idioms (every `useEffect` in the SPA read and given a verdict, plus the store reads that take no subscription, the contexts still on the React 18 spelling, the hand-rolled pending state and the timers standing in for a transition; **found while sweeping the tree against the frontend rules' idioms table**) | [react-19-idioms/contents.md](./react-19-idioms/contents.md) |
