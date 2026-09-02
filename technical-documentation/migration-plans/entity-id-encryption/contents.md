# Entity id encryption

## Owns

Plan, stage notes, and behaviour overlays for naming EVE entities internally by **ref** — a
deterministic, reversible encryption of a character, corporation or alliance id, stored in its
place. Covers the `entityid` primitive and its key, the conversion framework, the entitlements
snapshot that replaces token-embedded scope lists, and login-time backfill for legacy accounts.

## Does not own

- Live auth and session behaviour → [backend/api/auth/overview.md](../../backend/api/auth/overview.md) (promoted only when this project closes)
- ESI refresh token encryption at rest → [backend/api/auth/sessions.md](../../backend/api/auth/sessions.md)
- Archived job statistics → [archived-jobs-stats/contents.md](../archived-jobs-stats/contents.md)
- Operator secret provisioning verbs → [deployment/deployment-tool/cli/verbs.md](../../deployment/deployment-tool/cli/verbs.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand the ref model, contracts, and rollout phases | [plan.md](./plan.md) |
| Check what has landed and what is still open | [plan.md](./plan.md) § Rollout status |
| Understand why a ref must be both deterministic and reversible | [plan.md](./plan.md) § Design |
| See how the `entityid` primitive behaves | [overlay.md](./overlay.md) § Shared entity id helpers |
| See how a surface behaves after a phase lands | [overlay.md](./overlay.md) |
