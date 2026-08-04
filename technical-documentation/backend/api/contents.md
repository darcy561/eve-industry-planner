# Backend — api

## Owns (SoT)

`services/api` HTTP surface and closely owned contracts: planner sessions, ESI session notes, document-lock REST, handler dependency wiring.

## Does not own

- SPA auth/lock UI → [frontend/auth](../../frontend/auth/spa.md), [frontend/document-lock](../../frontend/document-lock/spa.md)
- Websocket fan-out / JetStream consumers → [websocket/](../websocket/contents.md) and stack websocket ops
- Shared Mongo package behaviour → [shared/mongo.md](../shared/mongo.md)
- Migration history → [migration-plans/](../../migration-plans/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Wire Mongo/Redis/NATS into v1 handlers (`apideps`) | [deps.md](./deps.md) |
| Learn auth vocabulary / wire contract / end-to-end flows | [auth/overview.md](./auth/overview.md) |
| Change Redis sessions, middleware, refresh, upgrade auth | [auth/sessions.md](./auth/sessions.md) |
| Plan auth backlog | [auth/roadmap.md](./auth/roadmap.md) |
| Learn document-lock system overview | [document-lock/overview.md](./document-lock/overview.md) |
| Change lock HTTP/Redis/cascade | [document-lock/locks.md](./document-lock/locks.md) |
| Plan multi-tenant / lock backlog | [document-lock/roadmap.md](./document-lock/roadmap.md) |
| Session + ESI notes (narrow) | [session-esi.md](./session-esi.md) |
