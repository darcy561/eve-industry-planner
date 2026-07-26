# EVE Industry Planner

**Plan and run EVE Online industry workflows**—production chains, jobs, structures, market and SDE-backed data—through a React web app backed by Go services and **ESI** integration.

## Repository overview

| Layer | Stack |
| --- | --- |
| **Frontend** | React (Vite), MUI, TanStack Router/Query |
| **Backend** | Go: REST API, WebSocket service, **core** (schedulers, changestreams, shared processing), **worker** (Asynq / Redis) |
| **Data & messaging** | MongoDB, Redis, NATS (JetStream) |
| **Deploy** | Hybrid: Swarm (Traefik, api, websocket, worker, ws-router, core, frontend, SeaweedFS) + Compose data plane (mongo/redis/nats + ops); optional observability |

Deployment and host setup: see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

---

### GitHub “About” (copy-paste)

**Short description** (for the repository *About* field):

> Web app for EVE Online industry planning and ESI-backed workflows. Monorepo: React SPA, Go API/WebSocket/core/worker, hybrid Swarm+Compose deploy, MongoDB, Redis, NATS.

**Website (if applicable):** `https://eveindustryplanner.com`
