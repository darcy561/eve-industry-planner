# Technical rules (stack)

Applies when editing Swarm fragment YAML, bake, or stack live docs. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins**; otherwise the master applies (including § Engineering practices). Live SoT → [`contents.md`](./contents.md).

## Fragments

- **Swarm fragments are SoT:** `docker-stack.data.yml` (data) · `docker-stack.yml` (app) · optional `docker-stack.obs.yml` (observability).
- Stub `docker-compose.yml` is leftover cleanup only (`eip shutdown`) — not a runtime path.
- Membership / roles / day-2 rolls → [`stack.md`](./stack.md). Host apply verbs → [`../deployment/deployment-tool/cli/verbs.md`](../deployment/deployment-tool/cli/verbs.md).

## Docker trust (stack-adjacent)

- **No Docker socket on app containers.** Per-consumer socket proxies on dedicated overlays; do not widen allowlists across trust boundaries.
- Prefer Moby SDK changes via Deployment Tool packages; do not invent Compose-era parallel ops paths in YAML comments or companion docs.
