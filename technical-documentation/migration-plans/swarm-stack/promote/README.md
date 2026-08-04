# Promote drafts — swarm-stack (#8 websocket drain)

**Promoted into live SoT 2026-08-04** (go-ahead). This folder is the promote snapshot; prefer live paths below for day-to-day edits.

| Draft | Live target | Apply |
|-------|-------------|--------|
| [backend/websocket/websocket.md](./backend/websocket/websocket.md) | [`technical-documentation/backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Replace file |
| [backend/ws-router/ws-router.md](./backend/ws-router/ws-router.md) | [`…/backend/ws-router/ws-router.md`](../../../backend/ws-router/ws-router.md) | Replace file |
| [stack/config.md](./stack/config.md) | [`…/stack/config.md`](../../../stack/config.md) | Replace file |
| [stack/stack.md](./stack/stack.md) | [`…/stack/stack.md`](../../../stack/stack.md) | Replace file |
| [testing/services/websocket.md](./testing/services/websocket.md) | [`…/testing/services/websocket.md`](../../../testing/services/websocket.md) | Replace file |

Drafts are **current-behaviour only** (no roadmap ticket numbers). In-flight narrative stays in [overlays/08-websocket-drain.md](../overlays/08-websocket-drain.md).

**Before promote:** restore prod `target_clients` / `client_cutoff` in `eip.config.yaml` if still at soak values, then `eip sync`.
