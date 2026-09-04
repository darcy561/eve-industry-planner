# Backend — worker

## Owns (SoT)

Application behaviour for [`services/worker`](../../../services/worker/): how a published task reaches a handler, what a handler is given, the start and stop sequence, the Asynq concurrency envelope and replica/capacity defaults.

## Does not own

- Overlay membership → [stack/network.md](../../stack/network.md)
- Secrets / sync apply → [stack/secrets.md](../../stack/secrets.md), [stack/config.md](../../stack/config.md)

## Task map

| I need to… | Read |
|------------|------|
| Change worker concurrency / capacity defaults | [worker.md](./worker.md) |
| Understand how a task reaches its handler | [worker.md](./worker.md) § Running a task |
| Know what a clean stop does | [worker.md](./worker.md) § Starting and stopping |
