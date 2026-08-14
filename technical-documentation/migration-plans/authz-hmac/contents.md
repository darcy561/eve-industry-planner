# AuthZ HMAC

## Owns

Plan, stage notes, and behaviour overlays for moving authorization onto deterministic internal
entity refs: HMAC-derived `char_ref` / `corp_ref` / `alliance_ref`, the entitlements snapshot that
replaces token-embedded scope lists, login-time backfill for legacy accounts, and the key rotation
policy behind the refs.

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
| Know what the shared HMAC helper needs before it can land | [plan.md](./plan.md) § Shared helper implementation |
| See how a surface behaves after a phase lands | [overlay.md](./overlay.md) |
