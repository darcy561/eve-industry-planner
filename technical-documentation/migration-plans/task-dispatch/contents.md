# Task dispatch

## Owns

Plan and stage notes for how a task is identified once it leaves the publisher: what the envelope
carries, how the worker resolves a queue and a deadline from it, and how the operator CLI names a task
it wants run.

## Does not own

- Declaring and publishing a task → [backend/shared/nats.md](../../backend/shared/nats.md) once promoted
- Recurring cron jobs and deferred runs → [backend/core/scheduler.md](../../backend/core/scheduler.md)
- Worker concurrency and queue sizing → [backend/worker/contents.md](../../backend/worker/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand what is unresolved about dispatch | [plan.md](./plan.md) |
| See what decides a task's type | [plan.md](./plan.md) § The subject is authoritative |
| Know what an unregistered task does today | [plan.md](./plan.md) § An unknown task runs on defaults |
| Collapse the double envelope | [plan.md](./plan.md) § Stage B |
| See why the trace rides in headers only | [plan.md](./plan.md) § The envelope carried the trace twice |
| Change how the operator CLI names tasks | [plan.md](./plan.md) § Stage C |
| Check what has landed | [plan.md](./plan.md) § Stage status |
