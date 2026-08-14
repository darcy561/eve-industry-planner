# Backend — websocket

## Owns (SoT)

Application behaviour for [`services/websocket`](../../../services/websocket/): soft/full hints, upgrade refuses, SIGTERM drain, cordon force-close, session handoff, hosted-tenant query view, selective JetStream doc fan-out, per-slot ops facts.

## Does not own

- Placement / pin / eligible set → [../ws-router/ws-router.md](../ws-router/ws-router.md)
- Traefik `/ws` → [stack/traefik.md](../../stack/traefik.md)
- Overlay membership → [stack/network.md](../../stack/network.md)
- SPA realtime client → [frontend/](../../frontend/contents.md)
- Migration decision log → [migration-plans/websocket-realtime](../../migration-plans/websocket-realtime/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Change soft/hard limits, cordon/drain, handoff, websocket defaults | [websocket.md](./websocket.md) |
| Change JetStream FilterSubjects / doc.update pull selectivity | [websocket.md](./websocket.md) § JetStream doc fan-out |
