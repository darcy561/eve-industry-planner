# Maintenance mode

## Owns

Plan, stage notes, and behaviour overlays for extending maintenance mode from a frontend banner and
an API gate to a stack-wide state: rejected WebSocket upgrades at the router and the backend,
force-closed live sessions, and a core scheduler that stops publishing cron work for the duration.

Also owns the decision that maintenance state moves from a container environment variable to a
runtime flag an operator can toggle without redeploying, and what that means for the SPA.

## Does not own

- Live API middleware and app-config behaviour → [backend/contents.md](../../backend/contents.md) (promoted only when this project closes)
- Live WebSocket connect, drain and placement behaviour → [backend/websocket/](../../backend/contents.md)
- Live core scheduler and singleton behaviour → [backend/core/](../../backend/contents.md)
- The `.env` schema and how a value reaches a container → [deployment/deployment-tool/](../../deployment/contents.md)
- Stack service membership and environment anchors → [stack/stack.md](../../stack/stack.md)
- Deployment Tool verb behaviour (`eip sync`, `eip cli`) → [deployment/deployment-tool/cli/verbs.md](../../deployment/deployment-tool/cli/verbs.md)
- Frontend SPA conventions → [frontend/technical-rules.md](../../frontend/technical-rules.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, stages, and done-when | [plan.md](./plan.md) |
| See what maintenance mode already does today | [plan.md](./plan.md) § Starting position |
| Know why the flag stops being an environment variable | [plan.md](./plan.md) § Decision — the flag becomes runtime state |
| Find where maintenance state is stored and how a service learns it changed | [overlay.md](./overlay.md) § Stage A |
| Know what happens if Redis is unreachable while maintenance is on | [plan.md](./plan.md) § Redis is the source of truth, and it can be missing |
| Turn maintenance on or off | [plan.md](./plan.md) § Stage F |
| See which requests still succeed during maintenance | [plan.md](./plan.md) § What stays reachable |
| Know why the probe endpoints are never gated | [plan.md](./plan.md) § Probes are never gated |
| Understand what happens to a connected client | [plan.md](./plan.md) § Stage C |
| Know why live sockets are closed but the container is not drained | [plan.md](./plan.md) § Closing sessions is not draining the container |
| See why ws-router learns the state over NATS rather than Redis | [plan.md](./plan.md) § ws-router holds a boolean, not a client |
| Know which core work stops and which keeps running | [plan.md](./plan.md) § Stage E |
| Find out what happens to work already queued when maintenance starts | [plan.md](./plan.md) § Stage E |
| See how the SPA leaves maintenance without a reload | [plan.md](./plan.md) § Stage G |
| Check what has landed and what is still open | [plan.md](./plan.md) § Stage status |
| Promote this project into live documentation | [plan.md](./plan.md) § Promote map |
