# Service import boundaries

## Owns

Plan and stage notes for removing the imports that reach from one service under `services/` into
another, and for the shared homes the moved code needs.

## Does not own

- Live behaviour of the code being moved — sessions, SSO validation, request middleware → [backend/contents.md](../../backend/contents.md)
- The `services` ↔ `deployment-tool` no-cross rule, which is separate and already documented → [technical-rules.md](../../technical-rules.md)
- Splitting `shared/` into local modules → [service-library-modules/contents.md](../service-library-modules/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand the rule and why these break it | [plan.md](./plan.md) |
| See every crossing import and what it uses | [plan.md](./plan.md) § The crossings |
| Know where each piece is going | [plan.md](./plan.md) § Destinations |
| Check what has landed | [plan.md](./plan.md) § Stage status |
