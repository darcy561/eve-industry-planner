# Cron scheduler rewrite

## Owns

Plan and stage notes for core's recurring-job scheduler: how a cron job is declared, named, resolved
and run, and what remains of gocron once deferred work is a JetStream schedule.

## Does not own

- Deferred one-off runs — a schedule on the schedule stream → [backend/shared/nats.md](../../backend/shared/nats.md) once promoted
- Primary lease and handoff → [swarm-stack/contents.md](../swarm-stack/contents.md)
- How a worker resolves a task it receives → [task-dispatch/contents.md](../task-dispatch/contents.md)
- ESI downtime windows as a product behaviour → [backend/contents.md](../../backend/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand what is wrong and why it is a rewrite | [plan.md](./plan.md) |
| See every place a cron job is named | [plan.md](./plan.md) § What a cron job is today |
| Know what replaces the downtime deferral | [plan.md](./plan.md) § Stage C |
| Decide whether gocron stays | [plan.md](./plan.md) § Stage D |
| Check what has landed | [plan.md](./plan.md) § Stage status |
