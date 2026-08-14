# Swarm stack migration

**Status: closed (2026-08-14).** Roadmap **#1–#36** landed; live SoT promoted. This folder is **history only** — not operator SoT. Git merge of the carrying branch (`swarm/hard-cutover` → Development) is separate shipping.

## Owns

Closed migration log for the single-host Swarm stack cutover (data + app + optional obs fragments, Deployment Tool operator surface, capacity controller).

## Does not own

- Live stack / Deployment Tool / testing SoT → [stack/contents.md](../../stack/contents.md), [deployment/contents.md](../../deployment/contents.md), [testing/contents.md](../../testing/contents.md)
- Unrelated feature work that happens to share a branch
- Optional later remainders that were never this project’s close gate (pin/move scrapped; auth affinity widen; frontend realtime polish; API ObjectStore on `apideps.Deps`) — see [roadmap.md](./roadmap.md) Follow-ups

## Task map

| I need to… | Read |
|------------|------|
| Current stack / operator behaviour | [stack/contents.md](../../stack/contents.md), [deployment/guide.md](../../deployment/guide.md) |
| Ticket status / decisions / land notes | [roadmap.md](./roadmap.md), [overlay.md](./overlay.md), [overlays/](./overlays/) |
| #2 replica identity decision pack | [02-replica-identity/](./02-replica-identity/) |
| #18 capacity controller decision pack | [18-capacity-controller/](./18-capacity-controller/) |
| #20 selective fan-out decision pack | [20-selective-fanout/](./20-selective-fanout/) |
| Promote snapshots (copies of live at promote time) | [promote/README.md](./promote/README.md) |
