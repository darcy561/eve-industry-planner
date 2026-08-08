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

Snapshots above match live (re-copied 2026-08-08 after docs↔code recheck). Drafts are **current-behaviour only** (no roadmap ticket numbers). Decision pack / history stays in [20-selective-fanout/](../20-selective-fanout/) and [overlays/20-selective-fanout.md](../overlays/20-selective-fanout.md).
