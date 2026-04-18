# Release Notes

## v0.8.11 (Development → Public)

This release squashes all `Development` changes since `Public` (`origin/Public`) into one deployable release commit.

### Patch Notes

#### Frontend and UX

- Upgraded core frontend stack (React 19, MUI v9, Vite 8) and aligned build/runtime configuration.
- Layout settings: job stage name edits now run `useOptimistic` updates inside `startTransition`, matching React 19 expectations and removing the “optimistic state update outside a transition” warning.
- Reworked planner drag-and-drop to `@dnd-kit`, including provider/hooks updates and cleaner job status handling.
- Added/expanded feedback and crash-report dialog flows with improved client-side error capture.
- Removed legacy service worker/PWA artifacts and related wiring.
- Refactored route/app shell composition and shared dialog/event utilities for more consistent behavior.

#### API and Backend

- Added backend endpoints and wiring for frontend analytics ingestion and explicit logout flow.
- Refined SSO/auth handling and error response behavior for improved reliability and observability.
- Updated telemetry instrumentation to include new frontend event metrics.

#### Worker and ESI Reliability

- Introduced shared retry path improvements for ESI calls (including Do/POST retry coverage).
- Restored/adjusted stream error behavior and strengthened ESI task helper coverage with new tests.
- Added canonical compatibility-date handling in worker ESI components and related tests.

#### Build, Deployment, and Ops

- Updated release/build artifacts and scripts to keep compose/version sync behavior consistent.
- Refreshed container publish workflow and deployment support files (`Makefile`, compose/dev config, env examples).
- Updated runtime/deployment frontend assets and Docker packaging inputs.
- `docker-compose.dev.yml`: baked `APP_VERSION` / `FRONTEND_APP_VERSION` build args set to **0.8.11** so local dev images match `VERSION.json`.
- Removed the empty root `package-lock.json` (no root `package.json`; lockfiles live under `frontend/`).

#### Documentation

- Documentation under `wiki/` is tracked in-tree (no git submodule), so clone and sync tools no longer hit missing `.gitmodules` errors.

### Scope Compared to Public

- Commit delta: 23 commits from `origin/Public` to the previous `Development` tip (`debe6e89d`).
- Includes major frontend refactors, API endpoint additions (`logout`, `frontend_analytics`), worker retry/test expansions, and deployment/build fixes.
