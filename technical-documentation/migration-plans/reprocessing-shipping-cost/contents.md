# Reprocessing shipping cost

## Owns

Plan, stage notes, and behaviour overlays for adding a user-supplied ISK per cubic metre
freight rate to the mineral-to-ore calculator, so ore selection scores against delivered
cost rather than market price alone.

Also owns publishing ore volume onto the reprocessing static data, which exists only to
serve this calculation.

## Does not own

- Live reprocessing behaviour and the SPA calculator as it works today → [frontend/contents.md](../../frontend/contents.md) (promoted only when this project closes)
- Frontend SPA conventions → [frontend/technical-rules.md](../../frontend/technical-rules.md)
- The SDE update and publish pipeline in general → [backend/contents.md](../../backend/contents.md)
- Replacing the greedy ore solver with a true cost minimisation — explicitly out of scope, see [plan.md](./plan.md) § Scope boundary

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, stages, and done-when | [plan.md](./plan.md) |
| Know why this cannot be done in the SPA alone | [plan.md](./plan.md) § Starting position |
| See what this does and does not promise the requester | [plan.md](./plan.md) § Scope boundary |
| Publish ore volume to the SPA | [plan.md](./plan.md) § Stage A |
| Change how ore selection scores cost | [plan.md](./plan.md) § Stage B |
| Know why the freight rate defaults to zero | [plan.md](./plan.md) § Stage B |
| Understand why freight is a number and not a slider | [plan.md](./plan.md) § Freight is a rate, not a slider |
| Know what happens to the "prefer compressed" setting | [plan.md](./plan.md) § The compression bonus overlaps, and stays for now |
| Handle an ore with no volume | [plan.md](./plan.md) § Missing volume means zero freight, not an error |
| See how the calculator works after each stage | [overlay.md](./overlay.md) |
