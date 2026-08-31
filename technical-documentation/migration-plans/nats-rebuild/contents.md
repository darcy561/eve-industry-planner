# NATS rebuild

## Owns

Plan, stage notes, and behaviour overlays for rebuilding the shared NATS layer: the connection and
JetStream handle, stream and consumer management, the message envelope and its typing, publish and
consume helpers, and the retry/error classification behind them.

Also owns the decision to retire the gocron + Redis one-time job scheduler in favour of JetStream
message schedules, and the management surface (list, modify, cancel) built on top of them.

## Does not own

- Live Mongo access layer, whose shape this project follows → [backend/shared/mongo.md](../../backend/shared/mongo.md)
- Live backend behaviour → [backend/contents.md](../../backend/contents.md) (promoted only when this project closes)
- Websocket selective fan-out routing and tenant scale → [changestream-tenant-scale/contents.md](../changestream-tenant-scale/contents.md)
- The document-update publish path — scheduling, per-tenant queues and ordering → [changestream-tenant-scale/plan.md](../changestream-tenant-scale/plan.md)
- Capacity controller cordon/drain behaviour → [swarm-stack/contents.md](../swarm-stack/contents.md)
- Entity refs carried inside message payloads → [entity-id-encryption/contents.md](../entity-id-encryption/contents.md)
- Stack topology and the NATS service image → [stack/contents.md](../../stack/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, stages, and done-when | [plan.md](./plan.md) |
| See what is wrong with the current NATS layer | [plan.md](./plan.md) § Starting position |
| Know which client APIs replace hand-rolled code | [plan.md](./plan.md) § What the client already does for us |
| Find the pinned server, client, and test-server versions | [plan.md](./plan.md) § Versions are pinned, not floated |
| Understand the handle shape we are building toward | [plan.md](./plan.md) § Stage A |
| Find out where the package lives and why it moved | [plan.md](./plan.md) § The package moves to `services/shared/nats` |
| Know what a roll costs while stages B and E land | [plan.md](./plan.md) § Stages B and E cut over hard |
| Retire a stream | [plan.md](./plan.md) § Stream removal follows the same policy as durable removal |
| Register a worker handler for a task | [plan.md](./plan.md) § Stage C |
| Send a request and collect replies | [plan.md](./plan.md) § Stage C |
| Add or change a stream or a durable consumer | [plan.md](./plan.md) § Stage B |
| Know what happens to durables nobody owns | [plan.md](./plan.md) § Durable cleanup is carried forward, not simplified away |
| Publish or consume a typed message | [plan.md](./plan.md) § Stage C |
| Know why task payload structs are moving out of the nats package | [plan.md](./plan.md) § Payloads live with their task |
| Understand the generic task definition and its non-generic registry | [plan.md](./plan.md) § Generic at the edges, concrete in the registry |
| Publish a batch of tasks without waiting on each one | [plan.md](./plan.md) § Async publishing |
| Give one task type a different message lifetime | [plan.md](./plan.md) § Retention is a property of the definition |
| Know why document updates are not touched here | [plan.md](./plan.md) § The changestream publisher is not this project's to change |
| Schedule, modify, or cancel a deferred task | [plan.md](./plan.md) § Stage E |
| Know why the gocron one-time scheduler is being removed | [plan.md](./plan.md) § The one-time scheduler has no callers |
| Check whether a change breaks the wire | [plan.md](./plan.md) § Wire compatibility |
| Check what has landed and what is still open | [plan.md](./plan.md) § Stage status |
| See the call sites still reading a task definition | [plan.md](./plan.md) § Deferred for review |
| Revisit how the worker resolves a task | [plan.md](./plan.md) § The worker's interaction with a task wants revisiting |
| Revisit the cron scheduler | [plan.md](./plan.md) § The cron scheduler wants a rewrite of its own |
| See how a part of the system works after a stage lands | [overlay.md](./overlay.md) |
