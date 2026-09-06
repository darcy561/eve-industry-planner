# ESI limiter maintainability

## Owns

- The record of how the ESI limiter's token ledger moved from a sorted set to a slot hash, and the raw measurements that decided it — [measurements.md](./measurements.md), [history.md](./history.md).
- The in-flight overlay for limiter behaviour that live SoT does not yet describe — [overlay.md](./overlay.md).
- The plan to reinvestigate the limiter's Lua/Go split and make its invariants testable and observable — [plan.md](./plan.md).

## Does not own

- Current limiter behaviour operators follow → [backend/shared/esi.md](../../backend/shared/esi.md). That doc is live SoT and stays untouched until this project promotes.
- The rate-limiting model itself (buckets, classes, floors, downtime gate). This project changes how the limiter is verified and observed, not what it decides.
- EVE SSO. It shares the downtime gate and holds no bucket → [backend/shared/esi.md](../../backend/shared/esi.md).

## Task map

| I need to… | Read |
|------------|------|
| Understand why the ledger changed shape, and what it cost | [history.md](./history.md) |
| Find the raw numbers behind the decision | [measurements.md](./measurements.md) |
| Know how the limiter behaves today where live SoT is stale | [overlay.md](./overlay.md) |
| Pick up the outstanding work | [plan.md](./plan.md) |
