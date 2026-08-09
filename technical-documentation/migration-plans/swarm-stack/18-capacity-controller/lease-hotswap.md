# Lease and hot-swap

**Roadmap:** #18  
**Phase:** B

## Where / how (today)

Core: `lease:core:primary` via [`lease.RunWhileHeld`](../../../../services/shared/core/redis/lease/lease.go). Capacity controller: same helper on **`lease:capacity:primary`** (holder = `container.ID()`); cooldown Redis **`eip:capacity:cooldown:v1`**; Swarm `replicas: 1` + `start-first`. Only lease holder runs Apply.

## Correctness need

- Dual armed mutators are forbidden.
- Cooldown/hysteresis must survive start-first roll (new task must not forget recent Apply).

## Trade-offs

Optional warm standby (`replicas: 2`) later; v1 is `replicas: 1` + start-first.

## Outcome

**Locked.**

- Lease key: **`lease:capacity:primary`**.
- Holder id: `container.ID()`.
- Only lease holder runs Apply; standby may Observe/Evaluate for metrics but Apply is no-op without lease.
- Cooldown blob: Redis **`eip:capacity:cooldown:v1`** (JSON: last action time, roles touched).
- SIGTERM: release lease promptly (core pattern).
- Do **not** run capacity leadership inside the core process.
