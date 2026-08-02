# Frontend

## Owns (SoT)

SPA behaviour: React auth/session UX, document-lock UI, frontend lifecycle roadmaps.

## Does not own

- Auth vocabulary / wire contract / HTTP sessions → [backend/api/auth](../backend/api/auth/overview.md)
- Document-lock Redis/HTTP → [backend/api/document-lock](../backend/api/document-lock/overview.md)
- Stack/ops → [stack/](../stack/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Change SPA auth, bootstrap, refresh UX, realtime auth client | [auth/spa.md](./auth/spa.md) |
| Change document-lock UI / Zustand / hooks | [document-lock/spa.md](./document-lock/spa.md) |
| Plan moving auth clocks out of `useEffect` | [lifecycles/roadmap.md](./lifecycles/roadmap.md) |
| Frontend test entrypoints / depth (placeholder) | [../testing/frontend/contents.md](../testing/frontend/contents.md) |
