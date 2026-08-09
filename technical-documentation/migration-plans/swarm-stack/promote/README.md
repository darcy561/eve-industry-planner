# Promote drafts — swarm-stack

**Prefer live paths below for day-to-day edits.** This folder keeps promote snapshots.

## #2 replica identity / placement signal — promoted 2026-08-07

| Draft | Live target | Apply |
|-------|-------------|--------|
| [backend/websocket/websocket.md](./backend/websocket/websocket.md) | [`technical-documentation/backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Replaced |
| [backend/ws-router/ws-router.md](./backend/ws-router/ws-router.md) | [`…/backend/ws-router/ws-router.md`](../../../backend/ws-router/ws-router.md) | Replaced |
| [stack/stack.md](./stack/stack.md) | [`…/stack/stack.md`](../../../stack/stack.md) | Replaced |
| [stack/config.md](./stack/config.md) | [`…/stack/config.md`](../../../stack/config.md) | Replaced |
| [testing/services/websocket.md](./testing/services/websocket.md) | [`…/testing/services/websocket.md`](../../../testing/services/websocket.md) | Replaced |
| [testing/services/ws-router.md](./testing/services/ws-router.md) | [`…/testing/services/ws-router.md`](../../../testing/services/ws-router.md) | Replaced |

## #20 selective JetStream fan-out — promoted 2026-08-08

| Draft | Live target | Apply |
|-------|-------------|--------|
| [backend/websocket/websocket.md](./backend/websocket/websocket.md) | [`…/backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Updated (§ JetStream doc fan-out; miss window DeliverNew / DeliverLast) |
| [backend/core/core.md](./backend/core/core.md) | [`…/backend/core/core.md`](../../../backend/core/core.md) | Updated (§ Changestream → JetStream) |
| [backend/api/document-lock/locks.md](./backend/api/document-lock/locks.md) | [`…/backend/api/document-lock/locks.md`](../../../backend/api/document-lock/locks.md) | Updated (WS lock filters + DeliverLast) |
| [testing/services/websocket.md](./testing/services/websocket.md) | [`…/testing/services/websocket.md`](../../../testing/services/websocket.md) | Updated |
| [testing/services/core.md](./testing/services/core.md) | [`…/testing/services/core.md`](../../../testing/services/core.md) | Updated |
| [testing/services/shared.md](./testing/services/shared.md) | [`…/testing/services/shared.md`](../../../testing/services/shared.md) | Updated |

## #18 capacity controller — promoted 2026-08-09 (Phase D)

| Live target | Apply |
|-------------|--------|
| [`stack/stack.md`](../../../stack/stack.md) | Data drops prometheus; app adds capacity-controller + proxy; obs includes prometheus |
| [`stack/network.md`](../../../stack/network.md) | `eip-docker-capacity`; Prom dual-home on obs fragment |
| [`stack/config.md`](../../../stack/config.md) | Policy mount `eip_config_yaml`; controller consumes managed/scale_timing; Prom on obs |
| [`deployment/deployment-tool/cli/verbs.md`](../../../deployment/deployment-tool/cli/verbs.md) | `eip capacity` |
| [`backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Planned `ws.command.*` vs roll drain |
| [`deployment/guide.md`](../../../deployment/guide.md) | Membership table |
| [`testing/services/capacity-controller.md`](../../../testing/services/capacity-controller.md) | **New** depth topic + contents rows |

Decision pack / history: [18-capacity-controller/](../18-capacity-controller/), overlays `#18`/`#21`/`#27`/`#29`. Remainders (WS managed soak, pin/move) stay migration-tracked.
