# Backend — core

## Owns (SoT)

Application behaviour for [`services/core`](../../../services/core/): primary lease, handoff, schedulers/changestream gating, `doc.update` JetStream publish subjects.

## Does not own

- Overlay membership → [stack/network.md](../../stack/network.md)
- Data-plane EnsureMongo / EnsureS3 → [deploy.md](../../deployment/deployment-tool/cli/deploy.md)

## Task map

| I need to… | Read |
|------------|------|
| Core image defaults / primary lease (live) | [core.md](./core.md) |
| Changestream → `doc.update` subject shape | [core.md](./core.md) § Changestream → JetStream |
