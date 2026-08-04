# #23 — Day-2 image ship (Swarm rolls)

**Roadmap:** [../roadmap.md](../roadmap.md) `#23`  
**Status (mirror):** **done** — absorbs **#6** and **#22**.

**History.** Live behaviour → [verbs.md](../../../deployment/deployment-tool/cli/verbs.md).

## What changed

Day-2 ship is **`eip update`** (binary → kit stack YAML → pull `LiveImageRefs` → digest-reconcile) and **`eip rebuild`** (app bake + rematerialize). **#22** closed as the same update path for data pins (no separate playbook).

## How this part works after the change

See live [verbs.md](../../../deployment/deployment-tool/cli/verbs.md) § Day-2 images.

## Still open

_None for ship path._ Controller soft-cutover remains **#18**.

## Missing live SoT discovered mid-work

_None — verbs Day-2 section corrected when #22 closed._

## Notes / decisions

- `LiveImageRefs` = app + data (+ obs when on).
- Do not invent a data-only ship verb.
- **Removed (2026-08-04):** Redis advertised-version key/channel + websocket PUBLISH fan-out (`eip:app:advertised_version:v1`). Not part of day-2 ship. Version surfaces: bake/`APP_VERSION`, `GET /api/v1/app-config`, WS `connected.app_version`.
- **Later (FE):** `realtimeClient.js` still handles WS `{type: app_version}` for the deleted fan-out — see roadmap Follow-ups § frontend realtime polish; not blocking day-2 or #8.
