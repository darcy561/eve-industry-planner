# Collection naming

## Owns

The Mongo collection naming convention — scope prefixes (`account_`, `corporation_`, `alliance_`,
`shared_`) and which one a collection takes. The rename mechanism that applies a change, and the
order collections move in.

## Does not own

- Live Mongo access layer → [backend/shared/mongo.md](../../backend/shared/mongo.md)
- Index ownership and `eip ensure-mongo` behaviour → [deployment/deployment-tool/cli/verbs.md](../../deployment/deployment-tool/cli/verbs.md)
- Statistics collection names introduced by that project → [archived-jobs-stats/plan.md](../archived-jobs-stats/plan.md)
- Corporation and alliance document shapes → [archived-jobs-stats/overlay.md](../archived-jobs-stats/overlay.md) § Stage C

## Task map

| I need to… | Read |
|------------|------|
| Know what a collection should be called | [plan.md](./plan.md) § The convention |
| See the current → target mapping | [plan.md](./plan.md) § Mapping |
| Rename a collection safely | [plan.md](./plan.md) § How a rename lands |
| Understand why some collections were more expensive | [plan.md](./plan.md) § Client-visible names |
| See what is left before this project closes | [plan.md](./plan.md) § Handoff status |
| Promote the convention into live SoT | [plan.md](./plan.md) § Promotion |
