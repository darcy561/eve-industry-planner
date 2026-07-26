# Worker capacity envelope (#7)

> Part of [ROADMAP.md](./ROADMAP.md). Per-process Asynq concurrency × Swarm worker replicas.
> Tunables belong in **operator YAML** (#19); secrets stay in `.env` ([ENV.md](./ENV.md)).

## Locked for now (2026-07-19)

| Knob | Value | Notes |
|------|-------|--------|
| Per-process Asynq concurrency | **50** (default + hard cap) | Code: `MaxConcurrency` / `DefaultConcurrency` |
| Swarm `eip_worker` replicas | **1** (min 1 / max **2** for now) | Scale carefully — ESI limiter is shared Redis |
| Cluster inflight (approx) | `replicas × concurrency` | 1×50 = 50; 2×50 = 100 |

Raising **both** replicas and concurrency at once multiplies ESI/Redis pressure. Prefer fixed
concurrency (50) and scale replicas only within the max above until you re-open the envelope.

## Operator YAML (#19) — source of truth

See [`eip.config.example.yaml`](../../eip.config.example.yaml). Apply with **`make swarm-sync`**
(not `.env`):

```yaml
services:
  worker:
    capacity_controller_managed: true
    min: 1
    max: 2
    concurrency: 50   # per process; binary hard-caps at 50 for now
```

`make swarm-sync` writes task env on `eip_worker` (stack default is `50` until sync). Values
above 50 are clamped to 50 in the binary. Changing concurrency rolls the worker when apply
updates the service spec.

## Related

- [STACK.md](./STACK.md) — `eip_worker` replicas  
- [ENV.md](./ENV.md) — secrets vs operator config  
- ROADMAP **#7** / **#19** / **#18**  
