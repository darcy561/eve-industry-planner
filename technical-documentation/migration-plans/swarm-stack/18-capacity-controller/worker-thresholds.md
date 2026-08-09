# Worker scale thresholds

**Roadmap:** #18 / #27  
**Phase:** A fixtures; B armed Apply

## Where / how (today)

Worker concurrency default/cap 50 ([worker.md](../../../backend/worker/worker.md)); replicas min/max in YAML (template `1` / `5`). Queue depth via Redis `asynq.Inspector` in live Observe (**Pending** + **Active** only; not Scheduled/Retry). Scale-up uses per-priority pending vs slots fraction (`services.worker.queue_scale_up_pct`); poll weights in the worker Asynq server stay separate. Worker Scale when `capacity_controller_managed: true`.

## Correctness need

- Deterministic Evaluate for golden tests.
- Never scale below min or above max.
- Unknown depth → hold.

## Trade-offs

Per-queue % of capacity is operator-tunable without changing Asynq poll weights. Flat pending sum was coarser; age/latency still future work.

## Outcome

**Locked.**

Let `C` = `services.worker.concurrency`, `R` = running worker tasks, `slots` = `C×R`, `P_q` = pending on queue `q`, `A` = sum of active, `D` = Swarm desired.

Default `queue_scale_up_pct` (overridable in YAML):

| Queue | Fraction of slots |
|-------|-------------------|
| `priority_1` | 0.10 |
| `priority_2` | 0.25 |
| `priority_3` | 0.50 |
| `priority_4` | 1.0 |
| `priority_5` | 2.0 |

- **Scale up** (emit `desired = D+1`) when all hold:
  - managed + `D < max`
  - **any** `P_q > slots × pct[q]` (strict `>`)
  - condition sustained for `scale_up_stabilization`
  - not inside that service’s cooldown
- **Scale down** (emit `desired = D-1`) when all hold:
  - managed + `D > min`
  - total pending across queues `== 0`
  - `A <= C * (R - 1)` when `R > 1`
  - sustained for `scale_down_stabilization`
  - not inside cooldown
- **Inspector error / unknown:** hold + Summary (no stampede).
- Worker scale does not require cordon/drain (stateless pool). WS scale-down: [evacuate-ops.md](./evacuate-ops.md).
