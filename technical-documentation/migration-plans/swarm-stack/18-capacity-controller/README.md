# #18 — Capacity controller decision pack

**Rules:** Read and following [`../../documentation-rules.md`](../../documentation-rules.md) and [`../../technical-rules.md`](../../technical-rules.md) (migration-plans). Phase 1 (project folders/docs) before any product work. For Go surfaces in scope only: `go fix -diff` before planned work ([go-fix-pretest.md](./go-fix-pretest.md)); again on edited packages (not unrelated code). Live SoT will not be edited until this project is complete and promotion is approved.

**Roadmap:** [../roadmap.md](../roadmap.md) `#18` (track: `#19` → `#30` → `#27` → `#18` → `#21` → `#29`)  
**Overlay pointer:** [../overlays/18-capacity-controller.md](../overlays/18-capacity-controller.md)

Each doc separates:

1. **Where / how** it is used today (facts)
2. **What must be true for correctness**
3. **Trade-offs**
4. **Outcome** — locked for implement plan

## Vocabulary (locked)

| Concept | Canonical name | Do not call it |
|---------|----------------|----------------|
| Process / scale target | **`container_id`** / `container.ID()` | slot |
| Desired replica count | **desired** for role `worker` / `websocket` / `api` | HPA target |
| Pure decision fn | **`policy.Evaluate`** | autoscaler |
| Moby / Observe seam | **`cluster.Cluster`** (own code under `services/capacity-controller`) | Swarm client in policy / `docker` CLI / **importing deployment-tool** |
| Ordered Apply | **`executor`** | policy side effects |
| Per-role Apply gate | **`services.*.capacity_controller_managed`** | global arm env |
| Leadership | **`lease:capacity:primary`** | core primary lease |
| Cooldown state | Redis **`eip:capacity:cooldown:v1`** | in-memory only |
| Operator front door | **`eip` → Moby exec → capacity-controller** | Host NATS client / Traefik admin HTTP / `eip` Moby-scaling managed services |
| Fleet health sample | NATS **`health.command.ping`** | Redis hosted-tenant directory |
| WS planned control | NATS **`ws.command.cordon`** / **`drain`** / **`uncordon`** | SIGTERM-only as planned evacuate |
| In-mesh controller API | **`capacity.command.*`** (optional; sims) | how host `eip` talks |

## Phases (after this pack)

| Phase | Tickets | Deliverable | Status |
|-------|---------|-------------|--------|
| **A** | `#19` consume → `#30` → `#27` | Policy + fake cluster + dry-run | **done** 2026-08-09 |
| **B** | `#18` | Service / proxy / lease / Moby / health expand / **worker armed** / **Prom → obs** | **done** 2026-08-09 |
| **C** | `#21` | WS cordon/drain/uncordon + `eip` Moby-exec verbs | **done** 2026-08-09 |
| **D** | `#29` + promote | Management sim + promote / project close | **done** 2026-08-09 |

## Working correctness sketch (locked Outcomes)

| Topic | Locked? |
|-------|---------|
| [v1-scope](./v1-scope.md) | **Yes** — managed default true for worker/websocket/api |
| [packages-loop](./packages-loop.md) | **Yes** — policy / cluster / executor; loop |
| [cluster-api](./cluster-api.md) | **Yes** — #30 interface; Moby + NATS ws.command |
| [observe-signals](./observe-signals.md) | **Yes** — Moby + Redis Asynq + NATS health; no Prom |
| [prometheus-placement](./prometheus-placement.md) | **Yes** — Prom data → obs (supersedes decision 25) |
| [nats-control-plane](./nats-control-plane.md) | **Yes** — health + ws.command; eip=exec |
| [policy-yaml](./policy-yaml.md) | **Yes** — #19 consume semantics |
| [config-mount](./config-mount.md) | **Yes** — Swarm config mount |
| [worker-thresholds](./worker-thresholds.md) | **Yes** — pending/active formulas |
| [arming-proxy](./arming-proxy.md) | **Yes** — eip-docker-capacity + arm flag |
| [lease-hotswap](./lease-hotswap.md) | **Yes** — lease + cooldown |
| [evacuate-ops](./evacuate-ops.md) | **Yes** — scale-in playbook landed |
| [dry-run-fixtures](./dry-run-fixtures.md) | **Yes** — #27 golden cases |
| [go-fix-pretest](./go-fix-pretest.md) | **Yes** — scoped `go fix` each Go phase |

## Files

| Doc | Question |
|-----|----------|
| [v1-scope.md](./v1-scope.md) | What is in / out of armed v1 |
| [packages-loop.md](./packages-loop.md) | Package boundaries + Plan types |
| [cluster-api.md](./cluster-api.md) | #30 Observe/Apply surface |
| [observe-signals.md](./observe-signals.md) | Signal SoT for Evaluate |
| [prometheus-placement.md](./prometheus-placement.md) | Where Prometheus lives |
| [nats-control-plane.md](./nats-control-plane.md) | NATS subjects + eip path |
| [policy-yaml.md](./policy-yaml.md) | YAML key → Evaluate behaviour |
| [config-mount.md](./config-mount.md) | How YAML reaches the container |
| [worker-thresholds.md](./worker-thresholds.md) | Worker scale math |
| [arming-proxy.md](./arming-proxy.md) | Stack proxy + arm gate |
| [lease-hotswap.md](./lease-hotswap.md) | Leadership + hysteresis across rolls |
| [evacuate-ops.md](./evacuate-ops.md) | #21 evacuate / scale-in |
| [dry-run-fixtures.md](./dry-run-fixtures.md) | #27 fixtures |
| [go-fix-pretest.md](./go-fix-pretest.md) | Scoped `go fix -diff` |

## Explicitly out of this pack / all product phases

- Hosted-tenant **id list** census (count on health OK)
- Pin / move tenant verbs (after evacuate)
- Api autonomous scale
- Node-exporter host headroom
- Controller ↔ `deployment-tool` Go linking
- Live SoT edits until Phase D promote go-ahead — **promoted 2026-08-09**

## Outcome checklist

Pack Outcomes locked (Phase 0). Phases A–D landed 2026-08-09:

- [x] v1-scope — Apply when managed; template default **true** for worker/websocket/api (api Evaluate still holds)
- [x] packages-loop — main loop under `lease:capacity:primary`; scale-in plan kinds cordon/drain/scale
- [x] cluster-api — Swarm Observe/Scale + Cordon/Drain/Uncordon via NATS Request; Fake Uncordon + drain-state updates
- [x] observe-signals — Moby + Redis Asynq + NATS health (`StartBus` + StatusFill)
- [x] prometheus-placement — Prom on obs fragment (dual-home `eip-obs`+`eip-core`); live stack docs promoted
- [x] nats-control-plane — `ws.command.cordon|drain|uncordon`; `eip capacity` Moby-exec → ctl
- [x] policy-yaml
- [x] config-mount — Swarm config `eip_config_yaml` → `/etc/eip/eip.config.yaml`
- [x] worker-thresholds
- [x] arming-proxy — `eip-docker-capacity` + `capacity-docker-proxy` (`POST=1`) + controller service
- [x] lease-hotswap — lease + Redis `eip:capacity:cooldown:v1`
- [x] evacuate-ops — playbook + ctl/`eip capacity` verbs; Apply gated by managed
- [x] dry-run-fixtures — Evaluate/Fake; unmanaged roles skip Apply
- [x] go-fix-pretest (scoped `go fix -diff` each Go phase; D clean)
- [x] #29 management sim + **live SoT promote** (stack / network / config / verbs / websocket / guide / testing)

**Remainders (not pack blockers):** WS managed soak flip; pin/move tenant; hosted census parked.
