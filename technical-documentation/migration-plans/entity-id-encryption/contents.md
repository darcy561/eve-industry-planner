# Entity id encryption

## Owns

Plan, stage notes, and behaviour overlays for naming EVE entities internally by **ref** — a
deterministic, reversible encryption of a character, corporation or alliance id, stored in its
place. Covers the `entityid` primitive and its key, the `protectedfields` conversion framework and
the boundaries that use it, refresh-token encryption at rest, and the sweep that converts documents
written before refs existed.

## Does not own

- Session grants and how an account's access is decided → [shared-planners/plan.md](../shared-planners/plan.md); refs are the values inside its owner keys, nothing more
- Live auth and session behaviour → [backend/api/auth/overview.md](../../backend/api/auth/overview.md) (promoted only when this project closes)
- Archived job statistics → [archived-jobs-stats/contents.md](../archived-jobs-stats/contents.md)
- Operator secret provisioning verbs → [deployment/deployment-tool/cli/verbs.md](../../deployment/deployment-tool/cli/verbs.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand the ref model and what this project covers | [plan.md](./plan.md) |
| Check what has landed and what is still open | [plan.md](./plan.md) § Rollout status, § What is still owed |
| Understand why a ref must be both deterministic and reversible | [plan.md](./plan.md) § Design |
| Know why the entitlements phases are gone | [plan.md](./plan.md) § The authorization half is withdrawn |
| Convert documents written before refs, or judge whether a run is safe | [plan.md](./plan.md) § Converting stored documents |
| See how the `entityid` primitive behaves | [overlay.md](./overlay.md) § Shared entity id helpers |
| See how a surface behaves after a phase lands | [overlay.md](./overlay.md) |
