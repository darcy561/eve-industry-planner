# ESI rate limiting

## Owns

Plan, data models, and stage notes for `services/shared/esiclient` — the shared ESI HTTP client
that meters every request against the bucket ESI actually charges, paces it from one clock held in
Redis, and reports remaining budget to the schedulers that decide what work to publish.

Covers the bucket model, the Redis key schema and its Lua contracts, the permit dispatcher, the
priority lane, and the cutover of every current consumer of the `esi:group:*` keys.

## Does not own

- Worker concurrency, queue weights, and asynq sizing → [backend/worker/worker.md](../../backend/worker/worker.md)
- Recurring cron jobs and deferred runs → [backend/core/scheduler.md](../../backend/core/scheduler.md)
- EVE SSO token exchange and refresh material → [backend/api/auth/sessions.md](../../backend/api/auth/sessions.md)
- Stopping services importing each other → [service-import-boundaries/contents.md](../service-import-boundaries/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand why the current limiter is being replaced | [plan.md](./plan.md) § What is wrong today |
| Know how ESI actually meters a request | [plan.md](./plan.md) § The bucket model |
| See every Go type the new package defines | [plan.md](./plan.md) § Go models |
| Tune how one endpoint is scheduled | [plan.md](./plan.md) § Endpoint policy |
| Know where a bucket's allowance comes from | [plan.md](./plan.md) § Deriving limits from ESI |
| Understand how a queue spike is absorbed | [plan.md](./plan.md) § Bursting and deceleration |
| Know why a task was sent back and when it returns | [plan.md](./plan.md) § A long wait has a cause, and the cause picks the answer |
| See the Redis keys and what holds what | [plan.md](./plan.md) § Redis schema |
| Read the Lua script contracts | [plan.md](./plan.md) § Script contracts |
| Know how a request gets a slot | [plan.md](./plan.md) § Acquisition |
| Find what breaks when the key schema changes | [plan.md](./plan.md) § Wire compatibility |
| Make an outbound HTTP call from a service | [overlay.md](./overlay.md) § Outbound HTTP |
| Know which headers the client sets, and gzip handling | [plan.md](./plan.md) § Request headers and transfer handling belong to the client |
| See what happens to the ESI status check | [plan.md](./plan.md) § What happens to the status check |
| Roll back after a cutover | [plan.md](./plan.md) § Cutover and rollback |
| Know what this emits and what an operator can do | [plan.md](./plan.md) § Cross-cutting concerns |
| See how each stage is tested | [plan.md](./plan.md) § Testing |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part behaves after a landed stage | [overlay.md](./overlay.md) |
