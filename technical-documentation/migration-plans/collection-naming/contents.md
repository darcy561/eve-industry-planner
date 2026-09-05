# Collection naming

## Owns

The Mongo collection naming convention — scope prefixes (`account_`, `corporation_`, `alliance_`,
`shared_`) and which one a collection takes. The rename mechanism that applies a change, and the
order collections move in.

## Does not own

- Live Mongo access layer → [backend/shared/mongo.md](../../backend/shared/mongo.md)
- Index ownership and `eip ensure-mongo` behaviour → [deployment/deployment-tool/cli/verbs.md](../../deployment/deployment-tool/cli/verbs.md)
- Statistics collection names introduced by that project → [archived-jobs-stats/plan.md](../archived-jobs-stats/plan.md)
- Corporation and alliance document shapes → [archived-jobs-stats/overlay.md](../archived-jobs-stats/overlay.md) § What a non-account owner needs before its statistics can be served

## Task map

| I need to… | Read |
|------------|------|
| Know what a collection should be called | [plan.md](./plan.md) § The convention |
| See what every collection is called, and what it was called before | [plan.md](./plan.md) § Mapping |
| Rename a collection safely | [plan.md](./plan.md) § How a rename lands |
| Understand why some collections were more expensive | [plan.md](./plan.md) § Client-visible names |
| Understand how Ensure skips work it has already done | [plan.md](./plan.md) § Structural versions |
| See where the convention lives in live SoT | [plan.md](./plan.md) § Promotion |
