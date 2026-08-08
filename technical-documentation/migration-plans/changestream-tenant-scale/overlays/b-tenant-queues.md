# Phase B — Per-tenant publish queues

**Plan:** [../plan.md](../plan.md)  
**Status:** open  
**Depends on:** Phase A metrics (or land together)

## What changed

_Fill when Phase B lands._

## How this part works after the change

_Target:_ one Mongo Watch per collection group; dispatch by `tenantString` to bounded per-tenant workers; JetStream publish off the watch goroutine; per-tenant ordering preserved; cancel on lose-primary.

## Still open

_None until work starts._

## Notes / decisions

- Overlap with resume: prefer at-least-once (advance after successful publish or intentional skip) — same as today.
- Do not implement dedicated Mongo Watches here — that is Phase D.
