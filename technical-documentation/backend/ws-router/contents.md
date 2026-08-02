# Backend — ws-router

## Owns (SoT)

Application behaviour for [`services/ws-router`](../../../services/ws-router/): placement, affinity cookies/keys, Redis contracts, readiness.

## Does not own

- Traefik `/ws` PathPrefix / ingress → [stack/traefik.md](../../stack/traefik.md)
- Overlay membership → [stack/network.md](../../stack/network.md)
- Websocket drain / cutoff / handoff → [../websocket/websocket.md](../websocket/websocket.md)

## Task map

| I need to… | Read |
|------------|------|
| Change placement, affinity, Redis keys, router health | [ws-router.md](./ws-router.md) |
