# Phase C — Corp / alliance collection groups

**Plan:** [../plan.md](../plan.md)  
**Status:** open — blocked on product collections existing  
**Code anchor today:** [`services/core/changestream/collection_groups.go`](../../../../services/core/changestream/collection_groups.go)

## What changed

_Fill when corp/alliance collections are registered._

## How this part works after the change

_Target registry shape (illustrative):_ tenant-type × domain groups — e.g. `account` / `account_planner`, `corporation` / `corporation_planner`, `alliance` / `alliance_planner` — each with its own Watch + resume token + Phase B queues.

## Still open

- Final collection names from product
- Whether archive/stats/blueprints need per-tenant-type splits

## Notes / decisions

- Groups are a **capacity knob**, not one-watch-per-collection by default.
- Still single primary.
