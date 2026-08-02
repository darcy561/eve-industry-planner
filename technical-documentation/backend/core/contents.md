# Backend — core

## Owns (SoT)

Application behaviour for [`services/core`](../../../services/core/): primary lease, handoff, schedulers/changestream gating.

## Does not own

- Rebuild / SeaweedFS cutover history → [migration-plans/core-rebuild.md](../../migration-plans/core-rebuild.md)
- Overlay membership → [stack/network.md](../../stack/network.md)
- Data-plane EnsureMongo / EnsureS3 → [deploy.md](../../deployment/deployment-tool/cli/deploy.md)

## Task map

| I need to… | Read |
|------------|------|
| Core image defaults / primary lease (live) | [core.md](./core.md) |
| Core rebuild plan history | [../../migration-plans/core-rebuild.md](../../migration-plans/core-rebuild.md) |
