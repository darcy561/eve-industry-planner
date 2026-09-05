# Service library modules

## Owns

Migration plan for splitting the platform packages under `services/shared/` into a small set of
local Go modules (`eip/base`, `eip/mongo`, `eip/redis`, `eip/nats`, `eip/models`, `eip/telemetry`),
and using those module boundaries to make each service image build from only the source it needs.
**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- The existing `testing/` module — it is the precedent this project copies, not a track. Live shape → [testing/contents.md](../../testing/contents.md)
- The `go fix` backlog across `services/` → [go-127-adoption/plan.md](../go-127-adoption/plan.md) § Track C. This project must sequence around it, not absorb it
- Live backend package ownership and behaviour → [backend/contents.md](../../backend/contents.md) (promote target)
- Package layout and shared-helper rules → [technical-rules.md](../../technical-rules.md) § Package / module layout and refactors
- Image build / roll behaviour operators see → [stack/stack.md](../../stack/stack.md) and [deployment/deployment-tool/cli/verbs.md](../../deployment/deployment-tool/cli/verbs.md) (promote targets for Track B)
- Per-service modules (`api`, `worker`, …) — named as a deferred follow-on in [plan.md](./plan.md) § Track C, not started here

## Task map

| I need to… | Read |
|------------|------|
| Goals, tracks, done-when, open decisions | [plan.md](./plan.md) |
| Measured import graph, module closures, and what couples the builds today | [dependency-map.md](./dependency-map.md) |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
