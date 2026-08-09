# go fix pretest

**Roadmap:** #18 track (Go surfaces)  
**Phase:** re-run on edited packages each Go phase (A/B/C done clean)

## Where / how (today)

`services/capacity-controller/` (and related websocket/nats/`eip` touches for Phase C) exist. Phase C ended with scoped **`go fix -diff`** clean on edited paths. Migration-plans technical rules still require scoped `go fix -diff` before each planned Go slice and again after edits — **those paths only**.

## Correctness need

Modernize only packages in scope — do not widen into unrelated `services/` trees.

## Trade-offs

None material; process gate only.

## Outcome

**Locked.**

Before Phase D (and each later Go phase):

1. Identify packages/paths this phase will touch (capacity-controller + any shared helpers / `eip` / sim surfaces).
2. Run **`go fix -diff`** on **those paths only**.
3. Review / apply safe modernizers before feature logic piles up.
4. After writing code, re-run on **edited packages only**.
