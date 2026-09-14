# Backend — core

## Owns (SoT)

Application behaviour for [`services/core`](../../../services/core/): primary lease, handoff, schedulers/changestream gating, `doc.update` JetStream publish subjects, and which worker tasks and in-process commands an operator can run by name.

## Does not own

- Overlay membership → [stack/network.md](../../stack/network.md)
- Data-plane EnsureMongo / EnsureS3 → [deploy.md](../../deployment/deployment-tool/cli/deploy.md)

## Task map

| I need to… | Read |
|------------|------|
| Core image defaults / primary lease (live) | [core.md](./core.md) |
| Changestream → `doc.update` subject shape | [core.md](./core.md) § Changestream → JetStream |
| See what core runs on a schedule, and when | [scheduler.md](./scheduler.md) |
| Add a recurring job, or change when one runs | [scheduler.md](./scheduler.md) § A job is one declaration |
| Work out why an ESI job did not publish at 11:05 UTC | [scheduler.md](./scheduler.md) § Deferring past EVE downtime |
| Trigger a worker task by name, or make one triggerable | [core.md](./core.md) § Triggering a task |
| Run an operator command in the process, or add one | [core.md](./core.md) § Triggering a task |
