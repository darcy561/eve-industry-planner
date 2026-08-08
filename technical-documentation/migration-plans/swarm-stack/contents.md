# Swarm stack migration

## Owns

In-flight backlog, decisions, handoffs, and behaviour overlays for the single-host Swarm stack cutover (data + app + optional obs fragments, Deployment Tool operator surface, capacity-controller prep). **Not live SoT** until promoted.

Named for the **work**, not a git branch. **Project close** = roadmap finished + live-SoT **promote** (go-ahead). Git merge is separate; after close, other work may continue on the same branch.

## Does not own

- Live stack / Deployment Tool / testing SoT → promote after go-ahead ([stack/contents.md](../../stack/contents.md), [deployment/contents.md](../../deployment/contents.md), [testing/contents.md](../../testing/contents.md))
- Unrelated feature work that happens to share a branch (before or after this project closes)

## Task map

| I need to… | Read |
|------------|------|
| Backlog, handoff, pickup order, ticket status | [roadmap.md](./roadmap.md) |
| All ticket overlays (index) | [overlay.md](./overlay.md) |
| One ticket’s detail / land notes | [overlays/](./overlays/) (`NN-*.md` for `#N`) |
| #2 replica identity decision pack | [02-replica-identity/](./02-replica-identity/) |
| #20 selective fan-out decision pack | [20-selective-fanout/](./20-selective-fanout/) |
| Promote drafts (go-ahead copy into live) | [promote/README.md](./promote/README.md) |
| Phase 1 gate checklist | [roadmap.md](./roadmap.md) § Phase 1 |
| When this project is “done” | Roadmap complete → promote live SoT (not “merge the branch”) |
