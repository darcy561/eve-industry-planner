# #23 — Day-2 image ship (Swarm rolls)

**Roadmap:** [../roadmap.md](../roadmap.md) `#23`  
**Status (mirror):** **done** — absorbs **#6** and **#22**.

**History.** Live behaviour → [verbs.md](../../../deployment/deployment-tool/cli/verbs.md).

## What changed

Day-2 ship is **`eip update`** (binary → kit stack YAML → pull `LiveImageRefs` → digest-reconcile) and **`eip rebuild`** (app bake + rematerialize). **#22** closed as the same update path for data pins (no separate playbook).

## How this part works after the change

See live [verbs.md](../../../deployment/deployment-tool/cli/verbs.md) § Day-2 images.

## Still open

_None for ship path._ Optional: Redis advertise polish; controller soft-cutover (#18).

## Missing live SoT discovered mid-work

_None — verbs Day-2 section corrected when #22 closed._

## Notes / decisions

- `LiveImageRefs` = app + data (+ obs when on).
- Do not invent a data-only ship verb.
