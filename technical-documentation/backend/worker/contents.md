# Backend — worker

## Owns (SoT)

Application behaviour for [`services/worker`](../../../services/worker/): Asynq concurrency envelope, replica/capacity defaults.

## Does not own

- Overlay membership → [stack/network.md](../../stack/network.md)
- Secrets / sync apply → [stack/secrets.md](../../stack/secrets.md), [stack/config.md](../../stack/config.md)

## Task map

| I need to… | Read |
|------------|------|
| Change worker concurrency / capacity defaults | [worker.md](./worker.md) |
