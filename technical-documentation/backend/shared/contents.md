# Backend — shared

## Owns (SoT)

Shared Go libraries under `services/shared` that are not owned by a single service topic.

## Does not own

- Feature contracts exposed via HTTP → [api/](../api/contents.md)
- Stack topology / EnsureMongo → [stack/](../../stack/contents.md), [deploy.md](../../deployment/deployment-tool/cli/deploy.md)
- Test depth for shared packages → [testing/services/shared.md](../../testing/services/shared.md)

## Task map

| I need to… | Read |
|------------|------|
| Use the Mongo handle / Docs / writers / Retry | [mongo.md](./mongo.md) |
| Document locks (shared package) | [api/document-lock/](../api/document-lock/overview.md) (API topic owns product behaviour; package under `services/shared/core/documentlock`) |
