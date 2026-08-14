# Changestream tenant scale

## Owns

Migration plan for scaling the **core** Mongo changestream publisher as account / corporation / alliance collections grow: per-tenant processing isolation, publisher metrics, and hooks for future auto-detect hot-tenant Mongo stream splits. **Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan phases done + live-SoT **promote** (go-ahead).

## Does not own

- Live core / changestream behaviour → [backend/core/core.md](../../backend/core/core.md) (promote target)
- WS selective fan-out / placement → [backend/websocket/websocket.md](../../backend/websocket/websocket.md), [swarm-stack #20](../swarm-stack/overlays/20-selective-fanout.md)
- Core primary lease / resume → [swarm-stack #12](../swarm-stack/overlays/12-changestream-lease.md)
- Capacity controller Docker scale → [swarm-stack #18](../swarm-stack/overlays/18-capacity-controller.md)

## Task map

| I need to… | Read |
|------------|------|
| Goals, phases, non-goals, done-when | [plan.md](./plan.md) |
| Metrics contract (labels / signals) | [metrics.md](./metrics.md) |
| Future auto-detect / dedicated Watch split | [auto-detect.md](./auto-detect.md) |
| Phase overlay index | [overlay.md](./overlay.md) |
| Landed behaviour notes (fill as work lands) | [overlays/](./overlays/) |
| Related Swarm multi-tenant context | [swarm-stack roadmap § Multi-tenant fit](../swarm-stack/roadmap.md#multi-tenant-fit-account--corp--alliance) |
