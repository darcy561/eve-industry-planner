# Backend — worker

## Owns (SoT)

Application behaviour for [`services/worker`](../../../services/worker/): how a published task reaches a handler, what a handler is given, the start and stop sequence, the Asynq concurrency envelope and replica/capacity defaults. Also the archived-job statistics pipeline the worker owns end to end, market order pricing — walking a region, deriving a station's prices from it, and tracking which markets are wanted — and keeping a solar system's industry cost indices and factional warfare ownership current.

## Does not own

- Overlay membership → [stack/network.md](../../stack/network.md)
- Secrets / sync apply → [stack/secrets.md](../../stack/secrets.md), [stack/config.md](../../stack/config.md)
- The endpoint that reads a derived price → [api/market-prices.md](../api/market-prices.md)
- The object-store bucket a region's pages are written to → [shared/objectstore.md](../shared/objectstore.md)
- What the SPA does with a system's cost index or its factional warfare flag → [frontend/industry-facilities/constraints.md](../../frontend/industry-facilities/constraints.md)

## Task map

| I need to… | Read |
|------------|------|
| Change worker concurrency / capacity defaults | [worker.md](./worker.md) |
| Understand how archived jobs become figures | [statistics.md](./statistics.md) |
| Change the statistics delta, rebuild or reconcile | [statistics.md](./statistics.md) |
| Find out why an owner's figures are stale or behind | [statistics.md](./statistics.md) § Failure |
| Know why a drain reports no eligible owners | [statistics.md](./statistics.md) § Constants |
| Understand how a task reaches its handler | [worker.md](./worker.md) § Running a task |
| Know what a clean stop does | [worker.md](./worker.md) § Starting and stopping |
| Change the region walk, the per-station derivation, or how a market is tracked | [market-orders.md](./market-orders.md) |
| Know how long a market stays tracked, or a region's pages are kept | [market-orders.md](./market-orders.md) § A market is tracked because an account saved it |
| Change how a system's industry cost indices or its factional warfare ownership are refreshed | [system-indexes.md](./system-indexes.md) |
| Find where the two datasets are merged for a reader | [system-indexes.md](./system-indexes.md) § The two datasets are merged where they are read |
