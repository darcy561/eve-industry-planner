# Stack

## Owns (SoT)

Single-host Swarm topology: fragments, membership, replica identity, secrets, operator config, networks, Traefik. App service SoT → [backend/](../backend/contents.md).

## Does not own

- Public bring-up narrative → [deployment/guide.md](../deployment/guide.md)
- Deployment Tool CLI/TUI internals → [deployment/deployment-tool](../deployment/deployment-tool/contents.md)
- Application contracts → [backend/](../backend/contents.md), [frontend/](../frontend/contents.md)
- Swarm stack migration history (closed) → [migration-plans/swarm-stack/contents.md](../migration-plans/swarm-stack/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Fragments / membership / replica identity / probes | [stack.md](./stack.md) |
| Know when Swarm replaces a stopped service | [stack.md](./stack.md) § Restart condition |
| `.env` / Swarm secrets / host binds | [secrets.md](./secrets.md) |
| `eip.config.yaml` / sync surface | [config.md](./config.md) |
| Overlay networks | [network.md](./network.md) |
| Traefik edge (providers, ingress, routes, ports/paths) | [traefik.md](./traefik.md) |
| Core primary lease / image defaults (service) | [../backend/core/core.md](../backend/core/core.md) |
| Websocket cutoff / drain / handoff (service) | [../backend/websocket/websocket.md](../backend/websocket/websocket.md) |
| ws-router placement / affinity (service) | [../backend/ws-router/ws-router.md](../backend/ws-router/ws-router.md) |
| Worker concurrency / capacity (service) | [../backend/worker/worker.md](../backend/worker/worker.md) |
| Capacity controller (Evaluate / Apply / lease) | [capacity-controller.md](./capacity-controller.md) |
| Capacity membership / policy mount / `eip capacity` | [stack.md](./stack.md) · [config.md](./config.md) · [../deployment/deployment-tool/cli/verbs.md](../deployment/deployment-tool/cli/verbs.md) |
| How stack / tool / services are tested | [../testing/contents.md](../testing/contents.md) |
