# Patch Notes

## Summary (Public / live — synced from Development, 2026-04-04)

This release promotes the current **Development** line to **Public** (the live deployment branch). It splits realtime WebSocket handling into its own service, hardens background task execution with configurable timeouts, improves market price and locale behavior in the UI, and updates Docker/CI accordingly. Earlier SDE-oriented notes are preserved below for reference.

## Highlights

### Dedicated WebSocket service

- Added **`services/websocket`** as a standalone Go service (Dockerfile, entrypoint, `VERSION`) and moved server/sync code out of the API binary.
- WebSocket process includes its own **auth and SSO** helpers (JWT, JWKS, keys, refresh) so connections authenticate without running inside the API.
- **API** no longer hosts the WebSocket server in-process (`wsServer..go` removed; `main` / `apiServer` simplified).
- **API package layout** flattened: `services/api/api/...` → `services/api/...` (helper, middleware, migration, v1endpoints, staticdata) with import updates across handlers and the worker.

### Docker and deployment

- **`docker-compose.yml`** and **`docker-compose.dev.yml`**: WebSocket image/service, dependency and naming alignment; dev compose exposes **`asynqmon`** for local queue inspection.
- **`publish-containers-merge`** workflow adjusted for the new service; **Firebase merge workflows** removed from this branch line.

### Worker tasks and messaging

- **`TaskMessage`** supports an optional **timeout override** (seconds); **default worker task timeout** for tasks without one.
- **Task routing** clamps timeouts to min/max bounds; enqueue/server paths and **NATS task payloads** updated; **`routing_test.go`** added.

### Frontend

- **Locale normalization** in application settings and price history for consistent formatting.
- **Price entry flow**: better handling of unconfirmed entries so user edits stay coherent when market-driven updates apply.
- **`itemRow`**: uses **`useRef`** for prior-value tracking to stabilize updates.

### Other

- **`updateCorporationClaims`** import updates for the new API paths.
- **`wiki`** submodule pointer updated alongside the locale and price-entry changes.

## Operator notes

- Deploy/build the **WebSocket** image and run it as a separate container alongside API, worker, core, etc., per `docker-compose.yml`.
- Ensure environment and secrets needed for WebSocket auth/SSO match what the API used when WebSocket was in-process.
- Review **Asynq** timeout defaults and any per-task overrides now that routing enforces bounds.

---

## Earlier release: SDE maintenance and static-data

### Summary

This patch updates the SDE maintenance workflow, renames the in-container task runner interface, improves static-data versioned asset URLs, and refreshes local development bootstrap behavior.

### Highlights

- Added a forced SDE rebuild path that can rebuild the currently active static-data build in place while atomically swapping `live_data`, archiving the displaced snapshot, and preserving unique version labels such as `123456_v2`.
- Extended SDE storage/version helpers so archived versions and regenerated live versions receive deterministic names, and added coverage around replace-current rebuild behavior.
- Registered the new `rebuildCurrentSDEVersion` worker task and exposed it through the renamed `tasks` CLI wrapper and updated task subcommands.
- Updated static-data metadata responses to prefer `BuildVersion` when generating cache-busting versioned asset URLs.
- Refreshed project bootstrap/update scripts so `make update-files` also updates `scripts/version-tracker.sh`, and `version-tracker.sh` now tracks `scripts/download-setup-scripts.sh`.
- Refreshed Go and frontend lockfiles/dependencies alongside the task and SDE pipeline changes.

### Operator notes

- The old `services/core/eip-tasks.sh` wrapper has been replaced by `services/core/tasks.sh`.
- The task command surface now uses names like `tasks sdeVersion`, `tasks workerQueues`, and `tasks forceSdeRebuild`.
- Rebuilding the current SDE version archives the replaced snapshot before publishing the regenerated live dataset.
