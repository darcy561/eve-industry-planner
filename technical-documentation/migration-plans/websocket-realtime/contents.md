# WebSocket realtime migration

## Owns

Historical plan, interactions log, and implementation notes for the websocket realtime migration, plus the plan to promote what is still accurate into live SoT and retire this folder. **Not live SoT** — when behaviour is current, prefer backend/frontend/stack topics.

> **Read [plan.md](./plan.md) first.** Parts of the files below describe a design the code no longer implements — most notably a JWT scope ceiling, where the server now uses the session's grants. `plan.md` records which claims were verified against the code.

## Does not own

- Current SPA realtime client behaviour → [frontend/](../../frontend/contents.md)
- Current API/websocket contracts → [backend/](../../backend/contents.md)
- Websocket service SoT → [backend/websocket/websocket.md](../../backend/websocket/websocket.md)

## Task map

| I need to… | Read |
|------------|------|
| What is verified accurate, and what gets promoted | [plan.md](./plan.md) |
| Overview / maintenance rules for this migration folder | [readme.md](./readme.md) |
| Architecture / implementation snapshot | [implementation.md](./implementation.md) |
| Decision / interaction log | [interactions.md](./interactions.md) |
| Plan snapshot | [plan-snapshot.md](./plan-snapshot.md) |
| Todo tracker | [plan-todo-tracker.md](./plan-todo-tracker.md) |
| Routing and scopes notes | [routing-and-scopes.md](./routing-and-scopes.md) |
| Scoped realtime routing plan | [scoped-realtime-routing-plan.md](./scoped-realtime-routing-plan.md) |
