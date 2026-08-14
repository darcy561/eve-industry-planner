# Promote drafts — swarm-stack

**Prefer live paths below for day-to-day edits.** This folder keeps promote snapshots (copies of live SoT at promote time).

## #2 replica identity / placement signal — promoted 2026-08-07

| Draft | Live target | Apply |
|-------|-------------|--------|
| [backend/websocket/websocket.md](./backend/websocket/websocket.md) | [`technical-documentation/backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Replaced (later refreshed with #18) |
| [backend/ws-router/ws-router.md](./backend/ws-router/ws-router.md) | [`…/backend/ws-router/ws-router.md`](../../../backend/ws-router/ws-router.md) | Replaced |
| [stack/stack.md](./stack/stack.md) | [`…/stack/stack.md`](../../../stack/stack.md) | Replaced (later refreshed with #18) |
| [stack/config.md](./stack/config.md) | [`…/stack/config.md`](../../../stack/config.md) | Replaced (later refreshed with #18) |
| [testing/services/websocket.md](./testing/services/websocket.md) | [`…/testing/services/websocket.md`](../../../testing/services/websocket.md) | Replaced |
| [testing/services/ws-router.md](./testing/services/ws-router.md) | [`…/testing/services/ws-router.md`](../../../testing/services/ws-router.md) | Replaced |

## #20 selective JetStream fan-out — promoted 2026-08-08

| Draft | Live target | Apply |
|-------|-------------|--------|
| [backend/websocket/websocket.md](./backend/websocket/websocket.md) | [`…/backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Updated (§ JetStream doc fan-out; later refreshed with #18) |
| [backend/core/core.md](./backend/core/core.md) | [`…/backend/core/core.md`](../../../backend/core/core.md) | Updated (§ Changestream → JetStream) |
| [backend/api/document-lock/locks.md](./backend/api/document-lock/locks.md) | [`…/backend/api/document-lock/locks.md`](../../../backend/api/document-lock/locks.md) | Updated (WS lock filters + DeliverLast) |
| [testing/services/websocket.md](./testing/services/websocket.md) | [`…/testing/services/websocket.md`](../../../testing/services/websocket.md) | Updated |
| [testing/services/core.md](./testing/services/core.md) | [`…/testing/services/core.md`](../../../testing/services/core.md) | Updated |
| [testing/services/shared.md](./testing/services/shared.md) | [`…/testing/services/shared.md`](../../../testing/services/shared.md) | Updated |

## #18 capacity controller — **promoted** (2026-08-09; re-aligned same day)

Live SoT is authoritative. Snapshots below are copies of live at promote time (byte-identical when written).

| Draft | Live target | Apply |
|-------|-------------|--------|
| [stack/capacity-controller.md](./stack/capacity-controller.md) | [`…/stack/capacity-controller.md`](../../../stack/capacity-controller.md) | **New** product topic (Evaluate / Apply / lease) |
| [stack/stack.md](./stack/stack.md) | [`…/stack/stack.md`](../../../stack/stack.md) | Membership + link to capacity-controller |
| [stack/network.md](./stack/network.md) | [`…/stack/network.md`](../../../stack/network.md) | `eip-docker-capacity`; Prom dual-home |
| [stack/config.md](./stack/config.md) | [`…/stack/config.md`](../../../stack/config.md) | Policy mount; managed; Evaluate summary |
| [deployment/guide.md](./deployment/guide.md) | [`…/deployment/guide.md`](../../../deployment/guide.md) | Membership + capacity-controller link |
| [deployment/deployment-tool/cli/verbs.md](./deployment/deployment-tool/cli/verbs.md) | [`…/verbs.md`](../../../deployment/deployment-tool/cli/verbs.md) | `eip capacity` (+ evacuate forces managed) |
| [backend/websocket/websocket.md](./backend/websocket/websocket.md) | [`…/backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Planned `ws.command.*`; reserve → controller |
| [testing/services/capacity-controller.md](./testing/services/capacity-controller.md) | [`…/testing/services/capacity-controller.md`](../../../testing/services/capacity-controller.md) | Test depth + ops soak |

Also updated live (no separate draft required): [`stack/contents.md`](../../../stack/contents.md) task map.

Decision pack / history: [18-capacity-controller/](../18-capacity-controller/), overlays `#18`/`#21`/`#27`/`#29`. **WS managed soak signed off** 2026-08-09. **Pin/move scrapped for now.**

