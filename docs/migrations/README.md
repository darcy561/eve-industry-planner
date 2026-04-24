# Migrations

Long-running architectural or data migrations are documented here: one folder per migration, with a running log of requests, decisions, and touchpoints. **For the WebSocket realtime migration:** code changes and this documentation must stay aligned—see [websocket-realtime/README.md — Documentation maintenance (required)](./websocket-realtime/README.md#documentation-maintenance-required). VPS **Traefik sticky `/ws`**, **Redis session handoff**, and **JWT `session_resume`** live in [websocket-realtime/IMPLEMENTATION.md](./websocket-realtime/IMPLEMENTATION.md).

| Migration | Status | Folder |
|-----------|--------|--------|
| WebSocket realtime (Mongo change stream → NATS → WS; users + application_settings + **`user_job_groups`**) | Implemented (see [websocket-realtime/IMPLEMENTATION.md](./websocket-realtime/IMPLEMENTATION.md)). **Live delivery** uses **JetStream** `doc.update.>` with **per-replica** durables plus account-scoped **`deliverOutboundDocUpdate`**; explicit per-doc interest uses WebSocket **`subscribe`** only; **`doc.lock`** → websocket → SPA **`eip-document-lock`**; **Redis document locks** on API (`/api/v1/document-locks/*`) now keyed by JWT **`session_id`** (client-id rebind removed). | [websocket-realtime](./websocket-realtime/) |

Add a new row and folder when starting another migration.
