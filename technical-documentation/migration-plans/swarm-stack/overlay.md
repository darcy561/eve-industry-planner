# Overlays — Swarm stack migration

Per-ticket behaviour overlays for [roadmap.md](./roadmap.md) backlog **#1–#36**. **Not live SoT.** On overlap with live docs, the ticket overlay wins until promote.

Index: [contents.md](./contents.md).

| Ticket | Status (mirror) | Overlay |
|--------|-----------------|---------|
| #1 | done | [01-eip-core.md](./overlays/01-eip-core.md) |
| #2 | **done** — identity + placement signal + live SoT promote (2026-08-07) | [02-replica-identity.md](./overlays/02-replica-identity.md) · [promote/](./promote/README.md) |
| #3 | done | [03-secrets-configs.md](./overlays/03-secrets-configs.md) |
| #4 | done | [04-traefik-ws-router.md](./overlays/04-traefik-ws-router.md) |
| #5 | done | [05-stack-file.md](./overlays/05-stack-file.md) |
| #6 | absorbed into #23 | [06-rolling-update.md](./overlays/06-rolling-update.md) |
| #7 | done | [07-worker-concurrency.md](./overlays/07-worker-concurrency.md) |
| #8 | **done** — drain + soak + live SoT promote | [08-websocket-drain.md](./overlays/08-websocket-drain.md) · [promote/](./promote/README.md) |
| #9 | done | [09-core-singleton.md](./overlays/09-core-singleton.md) |
| #10 | done | [10-core-ready.md](./overlays/10-core-ready.md) |
| #11 | done | [11-scheduler-lease.md](./overlays/11-scheduler-lease.md) |
| #12 | done | [12-changestream-lease.md](./overlays/12-changestream-lease.md) |
| #13 | done | [13-core-hot-swap.md](./overlays/13-core-hot-swap.md) |
| #14 | done | [14-core-cli.md](./overlays/14-core-cli.md) |
| #15 | done | [15-obs-labels.md](./overlays/15-obs-labels.md) |
| #16 | done | [16-frontend-swarm.md](./overlays/16-frontend-swarm.md) |
| #17 | done | [17-operator-surface.md](./overlays/17-operator-surface.md) |
| #18 | partial — A–D landed; WS soak + pin/move remain | [18-capacity-controller.md](./overlays/18-capacity-controller.md) · [18-capacity-controller/](./18-capacity-controller/) · [promote/](./promote/README.md) |
| #19 | **done** — sync + Load + mount + promote | [19-operator-yaml-sync-controller-schema.md](./overlays/19-operator-yaml-sync-controller-schema.md) |
| #20 | **done** — product + live SoT promote (2026-08-08) | [20-selective-fanout.md](./overlays/20-selective-fanout.md) · [20-selective-fanout/](./20-selective-fanout/) · [promote/](./promote/README.md) |
| #21 | partial — evacuate/`eip capacity` + promote; pin/move + WS soak open | [21-controller-evacuate-ops.md](./overlays/21-controller-evacuate-ops.md) · [18-capacity-controller/evacuate-ops.md](./18-capacity-controller/evacuate-ops.md) |
| #22 | **done** — absorbed into `eip update` / #23 | [22-data-plane-updates.md](./overlays/22-data-plane-updates.md) |
| #23 | done | [23-app-image-ship.md](./overlays/23-app-image-ship.md) |
| #24 | done | [24-secrets-day2.md](./overlays/24-secrets-day2.md) |
| #25 | done | [25-test-suite-foundation.md](./overlays/25-test-suite-foundation.md) |
| #26 | **done** — hold + limits + co-location fail-on-split | [26-ws-affinity-sim.md](./overlays/26-ws-affinity-sim.md) |
| #27 | **done** — Evaluate/Fake + managed-gate Apply + ctl plan + management sim | [27-capacity-dry-run.md](./overlays/27-capacity-dry-run.md) · [18-capacity-controller/dry-run-fixtures.md](./18-capacity-controller/dry-run-fixtures.md) |
| #28 | done | [28-core-failover-tests.md](./overlays/28-core-failover-tests.md) |
| #29 | **done** — Fake playbook + docs promote | [29-management-ops-sim.md](./overlays/29-management-ops-sim.md) |
| #30 | **done** — Observe/Scale + Cordon/Drain/Uncordon (Phase C) | [30-cluster-abstraction.md](./overlays/30-cluster-abstraction.md) · [18-capacity-controller/cluster-api.md](./18-capacity-controller/cluster-api.md) |
| #31 | done | [31-traefik-ingress.md](./overlays/31-traefik-ingress.md) |
| #32 | done | [32-eip-sync-secrets.md](./overlays/32-eip-sync-secrets.md) |
| #33 | done | [33-eip-rebuild.md](./overlays/33-eip-rebuild.md) |
| #34 | **done** — Prom on obs + live docs promote | [34-obs-addon.md](./overlays/34-obs-addon.md) |
| #35 | done | [35-buildx-bake.md](./overlays/35-buildx-bake.md) |
| #36 | **done** — promoted | [36-network-plane-polish.md](./overlays/36-network-plane-polish.md) · [promote drafts](./overlays/36-promote-draft.md) (history) |

## How to use

1. Keep roadmap status / size / acceptance on [roadmap.md](./roadmap.md).
2. Put detailed design, land notes, and missing-SoT drafts in the matching `overlays/NN-*.md`.
3. Prefer live SoT after promote; overlays remain history / remainders.
