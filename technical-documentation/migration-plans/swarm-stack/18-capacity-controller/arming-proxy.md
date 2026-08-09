# Arming and Docker proxy

**Roadmap:** #18  
**Phase:** B

## Where / how (today)

Traefik / ws-router proxies unchanged (`POST=0`). Capacity stack: overlay **`eip-docker-capacity`**, service **`capacity-docker-proxy`** (`POST=1`, SERVICES/TASKS), service **`capacity-controller`** (`replicas: 1`, `start-first`, nets `eip-core` + `eip-docker-capacity`, `DOCKER_HOST=tcp://capacity-docker-proxy:2375`). Apply is gated only by `services.*.capacity_controller_managed` (no global arm env). Bake target `capacity-controller`; `docker-stack.dev.yml` TAG.

## Correctness need

- Never mount the docker sock on the controller.
- Never widen traefik/ws proxies for Apply.
- Per-role kill-switch via YAML `capacity_controller_managed` only.

## Trade-offs

Separate proxy island matches existing trust-boundary pattern.

## Outcome

**Locked.**

Stack:

- Network **`eip-docker-capacity`** (overlay; not on `eip-core` for the proxy alone — controller dual-homes `eip-core` + this net).
- Service **`capacity-docker-proxy`**: `tecnativa/docker-socket-proxy`, allowlist for service inspect/update/scale; **`POST=1`** only as required for Apply (never enable broader than needed).
- Service **`capacity-controller`**: `replicas: 1`, `order: start-first`, nets `eip-core` + `eip-docker-capacity`, `DOCKER_HOST=tcp://capacity-docker-proxy:2375`, Redis + NATS, policy Swarm config mount. **No arm env.**
- Bake target **`capacity-controller`** in swarm group; LiveImageRefs when shipping.
- Never widen `traefik-docker-proxy` / `ws-docker-proxy` (`POST` stays 0).
- Unmanaged role: Evaluate may still plan; Apply skips that role.
