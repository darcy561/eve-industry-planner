# Worker runtime

## Owns

Plan and stage notes for how the worker container is assembled and how it runs a task once one
arrives: the order it starts and stops in, what a task handler is handed, where the dependencies
handlers share live, and how a handler is wired to its definition.

## Does not own

- How a task is identified once it leaves the publisher → [task-dispatch/contents.md](../task-dispatch/contents.md)
- Declaring and publishing a task → [backend/shared/nats.md](../../backend/shared/nats.md)
- Worker concurrency, queue sizing and replica counts → [backend/worker/contents.md](../../backend/worker/contents.md)
- The `errors.AsType` sweep in the worker's packages → [go-127-adoption/contents.md](../go-127-adoption/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand why the worker has two queue systems, and why both stay | [plan.md](./plan.md) § Why this exists |
| See what a clean stop does today | [plan.md](./plan.md) § The shutdown order is inverted |
| Know why task packages import asynq | [plan.md](./plan.md) § A task's signature names the queue library |
| Find where a task's shared dependencies live | [plan.md](./plan.md) § The shared kernel is called `esi` |
| Fix the shutdown sequence | [plan.md](./plan.md) § Stage A |
| Change what a task handler receives | [plan.md](./plan.md) § Stage B |
| Rehome the shared kernel | [plan.md](./plan.md) § Stage C |
| Wire handlers from task definitions | [plan.md](./plan.md) § Stage D |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| Read how a part works after a stage landed | [overlay.md](./overlay.md) |
| Promote this into live documentation | [promotion.md](./promotion.md) |
