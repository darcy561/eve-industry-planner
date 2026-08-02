# Backend

## Owns (SoT)

Application behaviour for Go services under `services/` (API contracts, workers, core control plane, websocket app logic, shared libraries). Docs live under the owning service folder.

## Does not own

- Swarm topology, Traefik, env apply, host bring-up → [stack/](../stack/contents.md), [deployment/](../deployment/contents.md)
- SPA behaviour → [frontend/](../frontend/contents.md)
- Migration decision logs → [migration-plans/](../migration-plans/contents.md) (not SoT)

## Task map

| I need to… | Read |
|------------|------|
| API auth, sessions, ESI, document locks | [api/contents.md](./api/contents.md) |
| Websocket cutoff / drain / handoff | [websocket/contents.md](./websocket/contents.md) |
| Worker concurrency / capacity | [worker/contents.md](./worker/contents.md) |
| Core primary lease / handoff | [core/contents.md](./core/contents.md) |
| ws-router placement / affinity / Redis keys | [ws-router/contents.md](./ws-router/contents.md) |
| Shared library docs (when written) | [shared/contents.md](./shared/contents.md) |
| eipconfig docs (when written) | [eipconfig/contents.md](./eipconfig/contents.md) |
| Swarm topology / Traefik / probes / rolls | [stack/](../stack/contents.md) |
