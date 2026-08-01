# Docker Swarm migration - roadmap & backlog

> **Handoff status (2026-07-26):** Swarm **data + app** fragments live; prefer **`eip`**. **#3 / #4 / #5 / #7 / #16 / #17 / #21 / #24 / #31** done. **Core boxed off (#9–#14 + #28).** Data-plane ensure = admintool `EnsureS3` ‖ `EnsureMongo` (Ready). **#8** cutoff+divert (partial). **#19/#32** sync/secrets. **`APP_VERSION` SoT is `.env`**. **#35/#33** bake/promote. **#23/#6** app-train dual-warm. **Object store:** SeaweedFS + `objectstore`. **Next:** **#18** capacity-controller; least-privilege `*_API` DB users (Ensure follow-up). Make/scripts legacy until retired. Docs: admintool ENGINEERING, CORE_REBUILD, STACK, ENV, ROADMAP, DEPLOYMENT.

Tracks the single-host Swarm cutover: **data fragment** (mongo/redis/nats/SeaweedFS/Prometheus) + **app fragment** (Traefik, api, websocket, worker, ws-router, core, frontend); optional Compose observability addon. Preferred host tool: **`eip`**. Make/scripts remain legacy reference until retired.

Later, Swarm’s fixed replica counts are driven by a **capacity controller** (not a naive CPU HPA). Swarm does not autoscale by itself. Prep for the controller is **woven into earlier items** so Phase E is mostly policy + Docker/Traefik ops, not inventing identity or metrics from scratch.

**Scope (intentional):** **one host forever** for this product (current design; multi-node HA / multi-manager are out of scope). Multi-node overlay, Mongo multi-host, K8s, replacing NATS stay out of scope.

**Non-goals for v1:** multi-active core scheduler/changestream (lease-gated single-primary is the design — see [CORE_REBUILD.md](./CORE_REBUILD.md)); letting every replica call the Docker API to scale itself; auto-scaling the data plane; polishing data-plane live swaps before a basic Swarm cutover works; **Redis on the changelog / JetStream hot path** (placement GET on `/ws` connect is intentional - see [WS placement](#ws-placement-model-router--redis)); treating Phase E as a naive CPU “autoscaler” instead of a **capacity controller**; teaching public operators a Compose-vs-Swarm mental model; maintaining compose-only elastic as a first-class product path (removed - hybrid only).

**Dev vs prod (same product):** `make dev` **builds and runs** the app locally (images from Dockerfiles). **Prod** runs the **same service set / same built images** with live secrets/config and published tags - not a different architecture. Staging ≃ local/dev shape; orchestration after hard cutover stays **hybrid** (same manifests; scale/addons via operator config).

---

## Start here for a new session

1. **Goal of next implementation slice:** start **#18** capacity-controller prep (**#19/#30/#27**). **#3 + #16 + #17 + #24** done. Hosted-tenant / soft divert parked with **#18**. **Core boxed off** (#9–#14 + #28).

2. **Pickup order:** [Recommended pickup order](#recommended-pickup-order) - **Phase 0 closed**; core closed; **#3/#16/#17/#24 done**. Next: **#18** track.

3. **WS placement (locked):** Redis **tenant -> websocket slot** via Swarm **`eip_ws_router`**; Traefik routes `/ws` -> router. Cookie `eip_tenant_affinity` is the key. Sticky = fallback. During app-train waves, router **prefers newest bake** among eligible slots (reassign sticky off OLD); look-ahead cordon + evacuate for OLD columns. Drain + force-close: [WEBSOCKET.md](./WEBSOCKET.md).

4. **Auth** rolls **in parallel** - account-key cookie now; widen when corp/alliance claims exist.

5. **Related roadmaps:** [document-lock](../document-lock/ROADMAP.md) (multi-tenant #30-#37, especially #32), [auth](../auth/ROADMAP.md), [DEPLOYMENT.md](../../DEPLOYMENT.md), current [docker-compose.yml](../../docker-compose.yml).

6. **Code anchors already in tree:** `services/shared/core/instanceid`, `services/core/singleton` + `redis/lease`, websocket JetStream durables, `tenant_affinity_cookie.go`, `services/ws-router/` (`preferNewestSlots`), stack Traefik `/ws` -> `eip_ws_router` labels, `scripts/swarm/release.sh`, `scripts/swarm/rebuild.sh`.

7. **Testing:** grow [Testing & simulation](#testing--simulation) / **#25-#29** as you implement; weave tests into PRs for #4/#8/#18/#21/etc.



Companion context:



- Current prod path: `docker-compose.yml` + `make up` (`DEPLOYMENT.md`)

- Shared network contract: [NETWORK.md](./NETWORK.md) (`eip` external **overlay** for hybrid)

- Replica identity: [IDENTITY.md](./IDENTITY.md) + `services/shared/core/instanceid` -> JetStream durables / OTLP `service.instance.id`

- Elastic Swarm stack (live): [STACK.md](./STACK.md) + [`docker-stack.yml`](../../docker-stack.yml) - Traefik + api/websocket/worker/ws-router/**core**/**frontend**

- Entry points: [MAKE.md](./MAKE.md) - hybrid `make up` / `make dev` (bring-up); day-2 **`make swarm-sync` / `make swarm-secrets-sync` / `make rebuild` / `make dev-release`** (#32 / #33 / #23)
- Edge: [TRAEFIK.md](./TRAEFIK.md) - Swarm `eip_traefik` (ingress); `/ws` -> [WS_ROUTER.md](./WS_ROUTER.md); frontend via swarm provider

- WS placement: [WS_ROUTER.md](./WS_ROUTER.md) - Redis tenant->slot; sticky fallback; prefer-newest bake mid-wave

- App-train: [APP_TRAIN.md](./APP_TRAIN.md) - dual-warm 2R (FE in `WARM_ORDER`) then advertise then drain; core stop-first before dual-warm

- Secrets / apply: [ENV.md](./ENV.md) - **`.env` = secrets**; prefer **`eip secrets`** / **`eip sync`** (Make verbs legacy); FE public knobs via `x-frontend-public-env`; optional `*_API` keys when set (user creation = Ensure follow-up). S3 buckets: **`eip ensure-s3`**. Mongo root/app users + indexes: **`eip ensure-mongo`**

- Core control plane: [CORE_REBUILD.md](./CORE_REBUILD.md) — `lease:core:primary` + `servicemanager`; nested singleton leases in `services/core/singleton`; changestream resume in `core/primaryhandoff`

- **Multi-tenant product:** [document-lock ROADMAP Strategic direction](../document-lock/ROADMAP.md#strategic-direction--multi-tenant-locks-account--corporation--alliance)

- Public deploy: **`.env` = secrets**; separate **operator config YAML** = replicas/addons/tunables (#19 / #34); day-2 YAML via **`make swarm-sync`**, secrets via **`make swarm-secrets-sync`** (not full `make up`)



> Per item: **status** - **size** (S/M/L) - **where** - **why** - **how** - optional **acceptance**.  
> Add **new** open items at the bottom **without renumbering** existing ids.  
> All backlog items are **open / not started** unless marked otherwise.

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [Start here](#start-here-for-a-new-session) | Handoff entry for a new agent/session |
| [Current state](#current-state) | What Compose does today and the pains |
| [Target shape](#target-shape-single-host) | What “done” looks like on one machine |
| [WS placement model](#ws-placement-model-router--redis) | How connections reach the right websocket (Redis + ws-router) |
| [Multi-tenant fit](#multi-tenant-fit-account--corp--alliance) | How Swarm/scale/placement anticipates product direction |
| [Changelog delivery](#changelog-delivery-core--jetstream--ws) | How Mongo changes reach containers (today vs #20) |
| [Principles](#principles) | Guardrails while migrating |
| [Phases](#phases) | Ordered delivery |
| [Capacity controller build-up](#capacity-controller-build-up-woven) | How earlier work feeds Phase E |
| [Testing & simulation](#testing--simulation) | How we prove cutover, affinity, scale, and management |
| [Backlog](#backlog) | Numbered work items **#1-#34** |
| [Impact map](#impact-map) | What improves vs what breaks |
| [Pickup order](#recommended-pickup-order) | Suggested sequencing |
| [Follow-ups](#follow-ups-detail-later) | Design notes still to write |
| [Decisions log](#decisions-log) | Locked decisions from planning |

---

## Current state

| Layer | Today | Pain |
|-------|--------|------|
| Deploy | `make up` / `make dev` hybrid bring-up (Compose data plane + Swarm elastic) | Day-2: **`make swarm-sync`**, **`make swarm-secrets-sync`**, **`make rebuild`**, **`make dev-release` / `make release`** (#32 / #33 / #23) — avoid full bring-up as a sledgehammer |
| api / websocket / worker / ws-router / Traefik / **core** / **frontend** | Swarm stack `docker-stack.yml` (hybrid live) | #4/#21 min/#7/#16 done; #8 docs; #8 code next; #6 absorbed into #23; core Phase B/C done |
| websocket identity | `OTEL_SERVICE_INSTANCE_ID` -> … -> `HOSTNAME` (`instanceid.Replica`) | Unstable names; orphan durables need `InactiveThreshold` + reconcile |
| core | Swarm `eip_core` (`replicas: 1`, `start-first`); probes `:19100`; primary lease + Redis changestream resume | Optional warm `replicas: 2` parked; **#28** dual-publisher failover tests done |
| Edge | Swarm `eip_traefik` (docker + swarm providers); `/ws` -> **ws-router** | #4/#21 min done; sticky fallback; mid-wave **prefer newest bake** |
| Observability | Full Grafana/Loki/Alloy/exporters always on Compose today | Lean installs want **addon off** (#34 = omit obs fragment); Prom on Swarm **data** fragment with #18 |
| Dev | `docker-compose.dev.yml` + local builds (`make dev`) | Same app as prod; **`make rebuild`** for day-2 code (cache; no data-plane bounce by default) |

Elastic / dynamic process set (by design): **api**, **websocket**, **worker**, **ws-router**.  
Control plane: **core** — Swarm singleton with lease-gated hot-swap (`lease:core:primary`); scheduler/changestream run on the primary only (not multi-active).

---

## Target shape (single host)

```mermaid
flowchart TB
  subgraph edge [Edge]
    T[Traefik]
    FE[frontend]
  end
  subgraph elastic [Rolling app services - Swarm]
    API[api N]
    WSR[ws-router 1]
    WS[websocket N]
    W[worker N]
  end
  subgraph control [App control plane - Swarm]
    CORE[core 1 primary lease]
    CC[capacity controller 1 - Phase E]
  end
  subgraph data [Data plane - Compose + Swarm data fragment]
    M[(mongo)]
    R[(redis)]
    N[(nats)]
    SW[seaweedfs]
    P[prometheus]
  end
  subgraph obsAddon [Observability addon - optional #34 omit fragment]
    G[grafana loki alloy exporters]
  end
  T --> API
  T -->|"/ws"| WSR
  WSR -->|"placement"| R
  WSR --> WS
  T --> FE
  API --> M & R & N & SW
  WS --> R & N
  W --> M & R & N & SW
  CORE --> M & R & N
  P -.->|metrics| CC
  CC -.->|desired replicas + drain/cordon| API & WS & W
  CC -.->|optional pin overrides| R
```

| Service | Replicas | Update order (target) | Identity |
|---------|----------|----------------------|----------|
| api | ≥1 (later capacity-controlled; defaults in operator config) | `start-first` | `api-{{.Task.Slot}}` -> `OTEL_SERVICE_INSTANCE_ID` |
| ws-router | **1** (v1; `start-first` handover; scale to 2 later OK) | `start-first` | `ws-router-{{.Task.Slot}}` |
| websocket | ≥1-2 (capacity-controlled + drain; lean default 1) | `start-first` | `websocket-{{.Task.Slot}}` |
| worker | ≥1 (first capacity-control target) | `start-first` | `worker-{{.Task.Slot}}` (tune Asynq concurrency if N>1) |
| core | 1 | `start-first` (primary lease handoff) | fixed `core` (or slot `1`) |
| capacity-controller | 0 until Phase E; then 1 | `start-first` (lease-gated; same spirit as core Phase C) | singleton slot; owns desired shape (replicas, drain, optional pins) - Swarm executes |
| prometheus | 1 (data fragment) | Swarm **data** fragment | lean scrapes + current Compose exporters until #34; **not** gated by addon |
| frontend | 1-2 | `start-first` | optional |
| mongo / redis / nats | 1 | rare / manual | keep stable DNS names (Compose) |
| observability addon | 0 unless enabled | Compose obs fragment (toggle = omit) | Grafana, Loki, Alloy, exporters, asynqmon UI (#34) — **no Prometheus** |

**Current topology:** Swarm **data fragment** (mongo/redis/nats/SeaweedFS/Prometheus) + **app fragment** (Traefik + api/websocket/worker/ws-router/core/frontend) on external `eip`. Frontend on Swarm (**#16**) with `x-frontend-public-env`. Data-plane desired state via admintool **`EnsureS3`** / **`EnsureMongo`**. Preferred operator UX is **`eip`** (Make legacy). Optional Compose observability addon (#34).

---

## WS placement model (router + Redis)

Traefik **already** terminates TLS and can load-balance `/ws`, but Traefik v3 **cannot hash cookie values** (sticky + IP `hrw` only). Opaque sticky cookies group **browsers**, not **corps**. Org co-location needs a tenant-aware balancer.

### Default (locked - Redis placement on connect)

1. At login / session create, set cookie **`eip_tenant_affinity`** whose **value** is the primary affinity key: `alliance:{id}` -> else `corporation:{id}` -> else `account:{id}` (app already sets `account:{id}`).
2. Traefik routes `PathPrefix(/ws)` to Swarm service **`eip_ws_router`** (not directly to websocket tasks).
3. Router **GET/SET** Redis placement `tenant -> websocket slot` (TTL + refresh on successful place). Miss or dead slot -> pick a ready slot and write Redis. See [WS_ROUTER.md](./WS_ROUTER.md).
4. Router reverse-proxies the WebSocket upgrade to `websocket-N:4001`. Session auth still runs on the websocket process (existing Redis session path).

Sticky (`eip_ws_affinity`) is **fallback** when the affinity cookie is missing or Redis is down - not the steady-state org model.

### Why Swarm for the router

Compose recreate of a singleton proxy would drop every live `/ws` tunnel. Router uses `start-first`, **replicas: 1** (handover on roll; dual replicas optional later), slot id `ws-router-{{.Task.Slot}}`, same class as other elastic Swarm services.

### Ops / scale-in (#21 - minimum landed)

Controlled **cordon / drain / evacuate / pin overlays** sit on the same Redis map. Instant reassign on connect keeps the balancer correct when a slot dies; #21 is required for **safe scale-in** (do not cold-kill a hot alliance). Placement map + acceptance **done** (#4). **#21 minimum + force-close:** Redis cordon/pin/evacuate + `make ws-placement-ops` (+ drain PUBLISH / WS bounce). Later: CLI talks to **#18 controller**; Redis stays SoT.

Capacity controller (#18) later may write pins / desired replicas; it does not replace the router.

### Separation of concerns

- **Swarm** schedules containers.
- **Traefik** TLS + `/ws` -> router (CORS labels live on the router with `/ws`).
- **ws-router** tenant->slot placement + proxy.
- **Capacity controller** (Phase E) desired cluster shape (replica counts, cordon/drain, reserve, optional pins).

### Not the design

- Waiting for Traefik native hash-on-cookie-value (unavailable in v3).
- Per-browser Traefik sticky as the long-term model.
- Placement scout / core Redis SCAN to derive live occupancy.
- Redis on the **changelog** hot path (#20 still: JetStream filters; interest registry on connect/move only).
- Live TCP teleport of sockets between containers (reconnect + existing `ws:session_handoff` instead).
- Compose-hosted router in hybrid mode (Compose-hosted router is out of scope (hybrid only)).

---

## Changelog delivery (core -> JetStream -> WS)

**Today:** core changestream publishes once to `doc.update.{collection}.{docID}` (JetStream). Each websocket replica has its own durable on `doc.update.>` so **every** replica receives **every** message, then filters locally to connected clients.

**With affinity alone:** co-location improves in-process density; the bus firehose remains until #20.

**Target (#20):** tenant (or shard) in subject; each slot keeps **one durable** with a **mutable filter set** for hosted tenants; core still publishes once - **no Redis on the changelog hot path**. Interest registry in Redis is for connect/move/ops. Dead slots: Redis TTL + JetStream `InactiveThreshold` + reconcile (same spirit as today’s orphan durable cleanup). On filter change after a move, define stream `MaxAge` and new-only vs backlog policy so reconnects don’t dump history or skip events.

**Core hot-swap:** core is the publisher leader (`lease:core:primary` + `start-first`; scheduler/changestream leader-only). Websocket consumers do not move with core.

---

## Multi-tenant fit (account | corp | alliance)

Product direction (locks, docs, WS fan-out) is **one planner** that serves **personal**, **corporation**, and **alliance** scopes together - not three separate apps. Infra choices here must not paint us into an account-only corner.

| Concern | Implication for Swarm / Traefik / capacity controller |
|---------|------------------------------------------|
| Tenants chatty on the same docs/locks | Prefer **placing clients that share a corp/alliance on the same WS replica within reason** so in-process fan-out hits more of that org’s tabs |
| **Today’s JetStream WS path** | Each replica uses its own durable on `doc.update.>` / `doc.lock.>` so **every** replica receives **every** message, then discards if no local listeners - correct when sticky scatters users; becomes a **worthless bottleneck** once affinity groups orgs |
| Selective fan-out (follow-on) | Know **which replicas host which tenants** and deliver only there (plus overflow/miss path) - see **#20**; pairs with affinity (#4) and tenant subjects (document-lock **#32**) |
| Personal + corp + alliance open at once | A session may need **multiple tenant subscriptions**; placement key is a **primary affinity** (e.g. largest/most-active org for that session), not “only one tenant forever”; interest registry must track **all** tenants with live sockets on that replica |
| Cookie sticky (`eip_ws_affinity`) | Pins a **browser**, not an **org** - random relative to corp mates. **Fallback only** (#4 router owns steady-state placement) |
| Scale signals | Global client/queue depth first; later add **hot-tenant** pressure (clients or backlog attributed to `corporation:*` / `alliance:*`) in #8 / #19 / metrics so one large alliance cannot silently soak a replica without scale-up |
| Workers | Today personal/Asynq queues; leave policy room for **per-tenant or per-queue-family** triggers when corp/alliance job pipelines exist (#7 / #19) |
| Drain / scale-down | Must consider **tenant concentration** - do not shrink away the only replica hosting a hot alliance without drain (#8 / #21); interest map must drop that replica’s tenants on drain |
| **Move / rebalance tenants** | Redis placement is sticky until reassigned; **#21** cordon/evacuate/pin overrides + reconnect. Prefer reconnect over live teleport |

**Affinity key (target):** `alliance:{id}` -> else `corporation:{id}` -> else `account:{id}` (same encoding as lock tenants). **Default routing = Redis placement via ws-router (#4).** Controlled overrides / evacuate = **#21**.

**Rebalance model (target):** ops / capacity controller change pin or cordon (#21), signal clients to reconnect, router honours Redis map. Session handoff/resume already exists. Scale-in always **drains** first (#21).

**Why selective fan-out matters with affinity:** Co-location alone does not cut NATS/CPU if every `websocket-N` still pulls `doc.update.>`. #20 narrows delivery; see [Changelog delivery](#changelog-delivery-core--jetstream--ws).

Cross-links: document-lock **#32** (WS fan-out by tenant), **#30** (tenant string encoding). Placement can ship with **account-key affinity** before corp collections exist, then widen the key as membership claims land in session/auth - without going back to per-browser sticky as the primary model.

---

## Principles

1. **Single host is the product** - design for one machine; no multi-node volume/network designs.
2. **Stable slot IDs** for JetStream durables / `ws_instance_id` (and sane scale-up naming).
3. **Never run two core leaders** until scheduler + changestream are lease-gated.
4. **Same app, two run modes** - `make dev` builds/runs locally; prod runs the same images with live env. After cutover, keep topology/env contracts aligned so staging isn’t a different animal.
5. **Product safety over clever rollouts** - never run two primary publishers; standby may overlap under `start-first` while waiting on `lease:core:primary`.
6. **Deep-dive before coding each phase** - detailed designs land in follow-ups / ADRs as items are picked up.
7. **Centralise capacity decisions** - a singleton **capacity controller** (or operator) owns desired replica counts, drain/cordon, reserve capacity, and optional placement overrides. App replicas must not call the Docker API to scale themselves.
8. **Lay capacity-controller groundwork early** - metrics, Traefik, drain, YAML policy feed Phase E (see [Capacity controller build-up](#capacity-controller-build-up-woven)).
9. **Operator-owned policy file** - ceilings, targets, reserve %, cooldowns in mounted YAML (#19), including **host resource headroom**.
10. **Design for multi-tenant from day one** - tenant-shaped placement/scale keys; auth claims roll in parallel.
11. **Org-aware WS placement over sticky** - Redis tenant->slot via **ws-router** (#4); Traefik only terminates `/ws` to the router. Sticky is fallback. **#21** evacuate/move for safe scale-in (next).
12. **Selective WS bus delivery follows affinity** - #20; no Redis on changelog hot path; one durable per slot + mutable filters.
13. **Tenant placement is movable** - #21 evacuate/move on the same Redis map; lock UX during moves with doc-lock corp/alliance work.
14. **Hard cutover, then deepen** - minimal Swarm first; then GHCR app-train waves (#23), affinity depth, capacity controller.
15. **Two public config surfaces** - **`.env` = secrets**; separate **operator config YAML** = replicas, capacity, addon toggles, non-secret tunables (#19 / #24 / #34). Day-2: **`make swarm-sync`** (YAML) / **`make swarm-secrets-sync`** (`.env`) (#32), not full `make up`.
16. **This roadmap is the handoff** - implement from here; don’t re-derive from chat.
17. **Test as we build** - every major capability gets automated coverage and a **simulation/harness** path (affinity, connections, scale, evacuate/move, core failover). Prefer dry-run / fake Docker / load generators over “try it in prod.” Weave tests into item acceptance; grow the suite under **#25-#29**.
18. **Bring-up vs apply** - `make up` / `make dev` create the world; **`make swarm-sync` / `make swarm-secrets-sync` / `make rebuild`** mutate it. Do not use full bring-up as the config apply hammer.
19. **Public UX hides hybrid** - operators learn one command set + config files; NETWORK/STACK are implementer docs.
20. **Same make verbs on Windows, Linux, and macOS** - Git Bash + Docker Desktop on Windows (existing `$(BASH)` path); no OS-specific public commands or PowerShell parallel toolchain (#17 / #32 / #33 / #35).
21. **Observability is an optional addon** - default off for lean self-hosts (#34). **No separate metrics toggle.** Prometheus lives on the Swarm **data** fragment (with SeaweedFS), **not** in the observability fragment — so #34 is “omit that Compose fragment.” Apps must run with observability off.

---

## Phases

### Phase 0 - Prep (**closed**)

Prepare files/network/identity for the **hard cutover**. Defer ordered multi-service roll sophistication, data-plane live swaps, and full corp affinity until after cutover is boring.

- Pin / document replica env vars ([IDENTITY.md](./IDENTITY.md); compose singleton pins) - **done**.
- Inventory bind mounts -> configs/volumes plan (#3) - **done** ([BIND_MOUNTS.md](./BIND_MOUNTS.md)); adminSDK binds removed; Swarm secrets + narrow Go config landed.
- External attachable `eip` (#1) - bridge bootstrap + **overlay** for hybrid - **done**.
- Minimal stack file (#5) + Traefik swarm (#4/#31) + **ws-router** - **done**; account-key **cookie** done; sticky is router fallback only.
- Document `.env` → Swarm secrets + day-2 apply (#24) - **done** ([ENV.md](./ENV.md), [DEPLOYMENT.md](../../DEPLOYMENT.md)); **`make swarm-secrets-sync`** / **`make swarm-sync`**.

**Phase 0 exit:** prep artifacts + hybrid smoke + tenant affinity cookie + bind-mount inventory. Met. (ws-router + Swarm Traefik + Swarm secrets + day-2 apply verbs landed; observability addon still #34.)

### Phase A - Hard cutover: basic Swarm for elastic path

**Hard cutover** to Swarm for **Traefik + api / websocket / worker / ws-router**. Core + mongo/redis/nats stay Compose (intentional hybrid).

**Landed (local / branch `swarm/hard-cutover`):** hybrid `make up`/`make dev`, stack with Traefik ingress (#31), api/websocket/worker + ws-router + core + frontend (#4/#5/#16), affinity cookie, Redis placement path, Desktop localhost publish.

- Slot-stable identity (#2) - env verified; durable continuity across scale still open.
- `start-first` rolls for elastic services - in stack config; day-2 roll **playbook (#6) deferred** with #23.
- Traefik swarm + **ws-router Redis placement** (#4) - **done** (incl. same-tenant acceptance); sticky = fallback only.
- Capacity envelope drafted (#7 / #19) — **#7 done** (50 concurrency; worker max 2); **#8 docs** (drain checklist + websocket YAML); example YAML seeded.

**Exit criteria:** hybrid Swarm path is the working prod/dev shape; recover with make up/dev. Day-2 image rolls / waves are **#23** (+ deferred #6), not a hard-cutover gate. (Stay inside the #7 envelope — do not scale workers blindly.)

**Then build outward:** **#8 code**, **GHCR app-train waves (#23)** (+ #6), #20, **capacity controller** (core Phase B/C closed). (#24 day-2 apply done.)

### Phase B - Core as Swarm singleton — **done**

Goal: **replace core without bouncing the whole stack**.

- Core in app fragment; orchestration probes on `:19100`; graceful SIGTERM cleanup.
- Compose `depends_on: core healthy` replaced by HTTP `/ready` (#10).
- Interim used `stop-first`; superseded by Phase C.

### Phase C - Core hot-swap / active-passive — **done**

Goal: **new core becomes handoff-ready before old releases**, then takes `lease:core:primary`.

| Workload | Landed |
|----------|--------|
| `singleton/*` | Nested Redis leases on every replica |
| Scheduler / changestream | `primarycontroller` + `servicemanager` — leader only |
| In-flight cron | gocron job `context.Context` cancelled on lose-primary / Shutdown (market-prices micro-batch stops early) |
| Changestream resume | Redis tokens `eip:core:handoff:v1:cs:resume:{groupID}` + Mongo `StartAfter`; cancel watch on lose-primary; at-least-once |
| Soft reports (schema lag / keyring) | Standby OK; not primary-gated. App Mongo indexes: admintool `EnsureMongo`, not core. |
| Swarm roll | `order: start-first`; healthcheck `/ready` = standby handoff (not `is_leader`) |

JetStream **consumers** stay on websocket slots; only the **publisher** (core) moves.

**Exit criteria (met):** core image roll with resume-bounded handoff (no intentional cold Watch gap); no dual watchers; mid-publish lose-primary cancels scheduler work without gocron stop timeout; rollback if new never Healthy. **#28** done — unit/miniredis + dual-replica Managed publisher harness (`core/leadership`).

### Phase D - Remainder (optional)

- Alloy/label mapping for swarm tasks when the **observability addon** is on (#15 / #34).
- ~~Optionally fold mongo/redis/nats into Swarm~~ **done** (data fragment).
- **Capacity-controller prep:** app/Asynq series Prometheus will scrape (and #15 labels where needed); host headroom / node-exporter later. Full Grafana stack is **not** required for the controller.

Frontend on Swarm (**#16**) **done** — stack service + bake/train; public knobs only (`x-frontend-public-env`).

### Phase E - Capacity controller (optional)

Swarm does **not** autoscale and does not understand org co-location. After elastic services are stable, add a **dedicated singleton Swarm service** for the **capacity controller** (#18) driven by operator YAML (#19) - **its own container**, not a sidecar of core/api/worker. **Prometheus comes up with this setup** as a Swarm **data** fragment service (lean scrapes: apps / Asynq) — same plane as SeaweedFS, outside the observability fragment. The **observability addon** (#34) remains optional (omit that Compose fragment) and is **not** a Phase E prerequisite.

**Roll / swap:** same class of problem as core. From day one use **lease-gated hot-swap** (core Phase C pattern): `replicas: 1` (or 2 with warm standby), `order: start-first`, Redis lease so only one controller mutates Docker; new task acquires lease -> becomes active -> old loses lease / SIGTERM -> exits. Brief dual-process overlap is fine; **dual armed mutators are not**. A stop-first gap is acceptable only as an emergency fallback, not the design target.

It is **not** a simple CPU watcher. It manages **cluster shape**:

| Decision | Examples |
|----------|----------|
| Replica counts | worker / websocket / api min-max from queue depth, client load, host headroom |
| Spare capacity | e.g. keep ~20% WS headroom (`reserve_capacity`) before average utilisation forces scale-up |
| Soft vs cutoff | `target_clients` vs `client_cutoff` per WS slot |
| Scale-up | raise desired replicas; wait healthy; optionally prefer **new** slot for new tenants (pin / cordon policy) |
| Scale-down | **never** instant kill - cordon -> drain (#21) -> when empty `service scale` down |
| Migrate / evacuate | which tenant leaves which slot under imbalance or deploys |
| Kill switches | per-service `capacity_controller_managed: false` in YAML |

**Division of labour**

- **Swarm** - schedules/runs the desired task count  
- **Traefik** - routes `/ws` -> **ws-router**; router owns Redis tenant->slot  
- **Capacity controller** - decides what the cluster *should* look like  

Similar spirit to K8s splitting scheduler vs HPA vs cluster-autoscaler, without adopting Kubernetes.

**Exit criteria:** capacity-controller service rolls via Swarm hot-swap with single lease holder; worker and WS desired state converge under policy without hand-scaling; scale-down always drains; dry-run (#27) proven before armed Docker mutations; operators edit YAML not code.

---

## Capacity controller build-up (woven)

Do not wait for Phase E to invent signals. Each earlier item owns a slice:

| When doing… | Also leave behind… | Feeds |
|-------------|-------------------|--------|
| **#2** slot identity | Continuous `ws_instance_id` / OTLP instance series as replica count changes | WS utilisation math |
| **#4** Traefik swarm + **ws-router placement** | Redis tenant->slot; sticky fallback; no per-browser sticky as end state | WS scale-up + co-located orgs; **prerequisite for #20 / #21** |
| **#5** stack file | Mount point for policy YAML; optional label mirrors | #18 / #19 |
| **#6** roll playbook | Manual `service scale`; note affinity impact on reconnect | Operator + controller parity |
| **#7** worker capacity | **done** — 50 concurrency default+cap; replicas max 2; [WORKER.md](./WORKER.md); draft `worker:` in `yamldefaults.DefaultConfig` | #19 worker section |
| **#8** WS reconnect / drain | **partial** — docs/YAML + force-close; soft caps / hosted-tenant open ([WEBSOCKET.md](./WEBSOCKET.md)) | #19 WS; feeds #20 / #21 |
| **#15** Swarm metric/log labels | Trustworthy series for Prom scrapes + addon dashboards | #18 inputs; #34 when addon on |
| **#17** Makefile/docs | `make swarm-sync` / `rebuild`; YAML edit/reload (scale via YAML; auto = #18) | Ops path (#32 / #33) — **done** |
| **#11-#13** core leases | Same lease-election pattern reused by capacity controller (#18) | #18 hot-swap |
| **#19** operator config YAML | Schema: mins/maxes, targets, reserve %, drain, host ceilings, **addons** | #18 + #34 source of truth |
| **#30** cluster abstraction | Observe/Apply API hiding Docker; fake impl for #27 | #18 packages |
| **#20** selective fan-out | Interest map + tenant-scoped delivery | Honest per-slot load |
| **#21** drain / evacuate / move | Ops the controller invokes on scale-in / rebalance | Management under affinity |
| **#25-#29** testing harness | Sims for connections, dry-run capacity decisions, management drills | Confidence for #18 / #21 |

Phase E (#18) should **evaluate cluster health periodically** from metrics + policy (#19), then call Swarm/Traefik-facing ops (scale, cordon, drain, optional pins) - not react to a single CPU sample. Prefer **dry-run** (#27) before armed mutations.

---

## Testing & simulation

Swarm, affinity, and capacity control are easy to get subtly wrong. Build a **layered suite** as features land - not a single big-bang QA project at the end.

### Layers

| Layer | What | Examples |
|-------|------|----------|
| **Unit** | Pure logic | Affinity key selection; placement pick_slot / TTL refresh; capacity-controller policy decisions from fake cluster state; lease acquire/release; filter-set reconcile; YAML schema validate |
| **Integration** | Real Redis/NATS/Mongo in CI (or testcontainers) | Session handoff; JetStream durable create + InactiveThreshold; hosted-tenant interest TTL; core lease failover for #11/#12 |
| **Contract / component** | HTTP/WS against running services (`make dev` or compose profile) | Traefik routes `/ws` -> router; two clients same affinity key -> same WS slot; sticky fallback when cookie/Redis missing; app-train wave dry-run (#29) |
| **Simulation / load** | Generators + harnesses | N concurrent WS clients with corp/account keys; queue depth fake for Asynq; capacity dry-run printing `would scale websocket 2->3` then `drain WS-3`; evacuate/move without prod Docker socket |
| **Chaos / failover drills** | Scripted fault injection | Kill websocket slot; kill core leader; assert recover within SLA; orphan durable cleanup |

### What must be simulatable (management surface)

Operators and CI should be able to exercise without hoping traffic appears:

1. **Connections** - spawn many WS clients with chosen affinity keys; assert co-location / reconnect / handoff.
2. **Capacity control** - feed synthetic per-slot metrics into the policy engine; assert full decisions (scale, drain, reserve headroom, optional pins); **dry-run mode** that never calls Docker until explicitly armed (#27).
3. **Manual scale** - Makefile/`service scale` paths covered by integration or documented script tests.
4. **Evacuate / move / cordon (#21)** - script or API to move a fake tenant between slots; assert reconnect + interest map.
5. **Core leadership** - two core processes in test; kill leader; assert single changestream/scheduler.
6. **`.env` apply (#24)** - scripted recreate path in CI smoke where feasible.
7. **Selective fan-out (#20)** - publish tenant-keyed messages; assert non-hosting slot pull count ≈ 0.

### Woven into other items

When implementing #4, #6-#8, #11-#13, #18-#21, #23: add/extend tests in the same PR when practical. Track harness foundations under **#25-#29** so work isn’t orphaned.

### Dev mirror

`make dev` should be able to run (or invoke) the same harnesses against local stacks so prod Swarm behaviour isn’t only testable on the live box.

---

## Backlog

### Prep & platform

#### #1 - External attachable `eip` network
- **status:** **done** (2026-07-19) - overlay `eip` + hybrid DNS; Compose data plane + stack services resolve by name
- **size:** S
- **where:** `docker-compose.yml` networks; `scripts/swarm/ensure-eip-network.sh` / `ensure-eip-overlay.sh`; `make ensure-eip-network` / `ensure-eip-overlay`; [NETWORK.md](./NETWORK.md)
- **why:** Hybrid Compose data plane + Swarm app services need shared DNS
- **how:** Define external network; document create-once bootstrap; point both runtimes at it. Phase 0 uses **bridge** so Compose keeps working without Swarm; recreate as **attachable overlay** before `docker stack deploy` (documented in NETWORK.md).
- **acceptance:** `api` (stack) resolves `mongo` / `redis` / `nats` (compose) by name - **verified local smoke 2026-07-19** (overlay `eip` + stack `eip` beside Compose data plane).

#### #2 - Replica identity contract (prod)
- **status:** partial - contract + compose singleton pins; Swarm slot templates in `docker-stack.yml`; live durable reuse verification pending smoke
- **size:** S
- **where:** `instanceid.Replica`, [IDENTITY.md](./IDENTITY.md), `docker-compose.yml` env pins, [`docker-stack.yml`](../../docker-stack.yml), websocket JetStream durables
- **why:** Unstable HOSTNAME/container IDs thrash durables and Grafana series; capacity control also needs continuous per-slot series
- **how:** Standardise on Swarm `{{.Task.Slot}}` (and Compose-era overrides for transitional hybrid); document env priority already implemented; verify metrics stay on `websocket-1`…`N` when scaling up/down manually
- **acceptance:** After recreate **or** `service scale`, durables/metrics reuse `doc-live-updates-websocket-<slot>` (etc.) for each live slot - **slot env verified** on local smoke (`api-1`, `websocket-1`/`websocket-2`). Durable continuity across scale still to confirm.
- **capacity-controller build-up:** required input for per-slot WS utilisation averages without orphan label explosion

#### #3 - Secrets / configs instead of fragile bind mounts
- **status:** **done** (2026-07-23) — inventory/adminSDK/mesh; narrow Go loaders + `swarmsecret`; real Swarm `docker secret` objects + per-service attach (no `env_file`); **#16** FE on Swarm. Optional `MONGO_*_API` / `REDIS_*_API` prefer-when-set with fallback; attach api-only when present. **Creating** those DB/ACL users is deferred (Ensure follow-up). Root/app mongo users + indexes: `EnsureMongo` (done).
- **size:** L
- **where:** [BIND_MOUNTS.md](./BIND_MOUNTS.md); [ENV.md](./ENV.md); [`docker-stack.yml`](../../docker-stack.yml); `scripts/swarm/lib/secrets.sh`; `services/shared/core/swarmsecret`; `services/shared/core/config`
- **why:** Swarm stacks handle bind mounts poorly; full `.env` on every elastic task over-shares secrets; a god `LoadConfig()` that requires every credential fights per-service Swarm secrets; frontend build/runtime env is part of the same attachment story
- **how (landed):**
  - Dropped `./adminSDK*.json` from stack/Compose (migration-only).
  - **Mesh networking from stack** (required): `x-mongo-env` / `x-redis-env` / `x-nats-env` / `x-objectstore-env`.
  - **Narrow loaders + `swarmsecret`:** env then `/run/secrets/<name>`; no god `LoadConfig()`. Api `ConnectAPI` for optional `*_API` creds (fallback to shared).
  - **Swarm secrets:** `make swarm-secrets-sync` / `stack-deploy` → versioned `eip_<KEY>_<hash>` + `.eip-swarm-secrets.yml` per-service attach. Elastic services dropped `env_file`.
  - **#16 frontend on Swarm:** `x-frontend-public-env` (public knobs only); no docker secrets for FE.
- **deferred (Ensure follow-up):** create `MONGO_*_API` / `REDIS_*_API` users in Mongo/Redis when wanted (root/app mongo users + indexes already via `dataplane.EnsureMongo`). Obs file mounts with #34 playbooks.
- **acceptance:** App services deploy without `./file` host binds for secrets; `make swarm-secrets-sync` rotates without teaching raw `docker secret`; frontend on stack — **met**. Least-privilege DB users — **opt-in later** (app works on shared creds until then).
- **pairs with:** #16 (done), #24 (apply UX), #32 (day-2 verbs), Ensure follow-up
#### #4 - Traefik swarm provider cutover + ws-router tenant placement
- **status:** **done** (2026-07-19): swarm provider; affinity cookie; Swarm `eip_ws_router` + Traefik `/ws` cutover ([WS_ROUTER.md](./WS_ROUTER.md); replicas **1**, `start-first`); Redis placement + sticky fallback; acceptance via `make smoke-ws-placement`.
- **size:** L
- **where:** `docker-stack.yml` Traefik + `deploy.labels`; `services/ws-router/`; Redis placement keys; [TRAEFIK.md](./TRAEFIK.md); [WS_ROUTER.md](./WS_ROUTER.md); `services/api/helper/auth/tenant_affinity_cookie.go`
- **why:** Stack tasks need swarm provider; opaque sticky groups browsers not orgs; Traefik cannot hash cookie values so Redis + thin router is the placement path
- **how:**
  1. Enable `providers.swarm`; network `eip`; `/api` + frontend via swarm provider (#16) - **done**
  2. App affinity cookie `account:{id}` (widen to corp/alliance later) - **done** (Phase 0)
  3. **Default placement:** Swarm `eip_ws_router` (replicas **1**, `start-first` handover); Traefik `/ws` -> router; Redis GET/SET tenant->slot with TTL + refresh; dead slot -> reassign on connect; sticky fallback; CORS labels on router with `/ws` - **done** (local smoke: stack healthy, `/ws` reaches router, placement backends=2)
  4. Remove opaque sticky as steady-state (emergency / escape-hatch / Redis-down fallback only)
  5. Redis session handoff / SPA resume when reconnect moves slots - handoff exists
  6. Track local hosted-tenant set for future #20 - deferred (websocket in-memory maps -> gauges under #8)
  7. **#21 next** - cordon/evacuate/pin overrides on the same Redis map (not in router MVP)
- **acceptance:** Swarm routing works - **verified locally**. Cookie set at session - **done**. Two clients same affinity key -> same WS replica - **done** (make smoke-ws-placement). No Compose-elastic escape hatch - recover with make up / make dev.
- **capacity-controller build-up:** lean router `/metrics` + later WS occupancy gauges; scale-down needs #21 evacuate

### Elastic services (Phase A)

#### #5 - Stack file for api / websocket / worker
- **status:** **done** for data+app Swarm fragments (mongo/redis/nats on data fragment; `EnsureMongo` for mongo). Historical note: 2026-07-19 smoke was hybrid Compose data plane. Day-2 roll playbook (#6) with #23.
- **size:** M
- **where:** [`docker-stack.yml`](../../docker-stack.yml); [STACK.md](./STACK.md); `scripts/swarm/stack-deploy.sh`; `make stack-deploy` / `stack-rm` / `ensure-eip-overlay`
- **why:** Need Swarm-honoured `deploy.update_config` and slot templates
- **how:** Extract elastic services; pin images via `APP_VERSION`; wire volumes (`api_data`, `worker_data`) on single node as **external** Compose project volumes; SDE in SeaweedFS (`objectstore`); reserve `capacity_config` volume for `#19`; optional `eip.capacity.*` deploy labels. Deploy expands `.env` via `docker compose config` and strips top-level `name:` for Swarm.
- **acceptance:** `docker stack deploy` runs Traefik + elastic + ws-router beside data plane - **verified local smoke** (STACK.md). `/ws` -> ws-router - **done** (#4). Remaining: durable continuity / ops polish.
- **capacity-controller build-up:** config mount path + optional label mirrors for #18 / #19

#### #6 - Rolling update playbook (api / ws / worker)
- **status:** **absorbed into #23** (2026-07-19) — [APP_TRAIN.md](./APP_TRAIN.md) + `make release` / `make dev-release`
- **size:** S
- **where:** [APP_TRAIN.md](./APP_TRAIN.md); [MAKE.md](./MAKE.md); pairs with **#23**
- **why:** Operators need a release path that is not `make up` sledgehammer
- **how (landed):** Documented train order + `make rebuild` / `make release` / `make dev-release`; WS scale-in stays on #21 evacuate
- **acceptance:** Playbook exists; wave script dry-run prints ordered steps without data-plane bounce
- **capacity-controller build-up:** controller later automates the same scale/drain path operators already practice

#### #7 - Worker replica vs Asynq concurrency policy
- **status:** done (2026-07-19) — cap **50** for now; raise later with evidence
- **size:** S
- **where:** `services/worker/asynq` (`MaxConcurrency` / `WORKER_ASYNQ_CONCURRENCY`); stack `eip.capacity.max=2`; [WORKER.md](./WORKER.md); `kit/templates/yamldefaults.DefaultConfig`
- **why:** Each process already uses a large concurrency pool; N replicas can overwhelm Redis/ESI; this envelope is the capacity controller’s ceiling; corp/alliance workloads will add more queue families later
- **how (landed):** Default + hard-cap **50** per process; Swarm replicas **1** (labels min 1 / max **2**); cluster inflight ≈ `replicas × concurrency`; document that raising both multiplies ESI pressure; draft `worker.concurrency: 50` + lean max in example YAML; day-2 via `make swarm-sync` → `docker service update` (not sync-env / not `.env`)
- **acceptance:** Written min/max replicas and concurrency; YAML draft includes extensibility notes for multi-tenant queues. (asynqmon/Grafana soak = optional ops follow-up, not blocking the envelope lock)
- **capacity-controller build-up:** **primary** worker section for #19 -> #18

#### #8 - Websocket rollout, affinity reconnect, and drain
- **status:** partial (2026-07-19) — docs + YAML + **force-close on cordon/evacuate**; soft caps / hosted-tenant set still open
- **size:** M
- **where:** [WEBSOCKET.md](./WEBSOCKET.md); `kit/templates/yamldefaults.DefaultConfig` `websocket:`; `services/websocket/server/cordon_drain.go`; `scripts/swarm/ops/ws-placement-ops.sh` PUBLISH; Redis `ws:session_handoff:v1`
- **why:** Replica rolls and scale-down still drop sockets; org co-location makes “which replica we drain” product-sensitive (do not evaporate the alliance’s home replica carelessly)
- **how (landed):** Drain checklist; websocket YAML; ops SET cordon + **PUBLISH** `eip:ws:drain:v1` → matching slot `ForceCloseLocalClients` (`please_reconnect` + 1001); refuse upgrades while cordoned; startup EXISTS catch for missed publish. **Redis pub/sub notify is temporary** — SoT stays Redis; NATS drain notify is the #18 target (avoid a second long-term fan-out bus).
- **how (still open):** Soft `target_clients` still policy-only (no soft divert). **Client cutoff + router full divert landed** (`WS_SLOT_CLIENT_CUTOFF` + Redis `eip:ws:full:v1`). Per-slot gauges polish; mid-edit roll soak. **Hosted-tenant query surface parked** until capacity-controller design (#18): in-process indexes already exist (`userConnections` / corp / alliance); do **not** pick HTTP vs Redis interest mirror yet — that choice must fit how #18 observes and how #20 interest lands. Until then ops uses placement Redis + gauges.
- **acceptance (partial):** Drain/cordon checklist + YAML + force-close + **client_cutoff refuse** + **router skip-full** exist; sticky called out as fallback. Remaining: soft divert / hosted-tenant surface with #18; soak evidence
- **acceptance (partial):** Drain/cordon checklist + YAML + force-close path exist; sticky called out as fallback. Remaining: soft caps; hosted-tenant set for #20; soak evidence
- **capacity-controller build-up:** WS section for #19 -> #18; hosted-tenant set feeds #20/#21; no automatic scale-down until drain + affinity rules are real

### Core (Phase B / C) - switching core on the fly

Core is the **control plane** (changestream -> JetStream, scheduler -> tasks, singleton jobs). It is not scaled like websocket. “Switch on the fly” means **safe ownership transfer**, not N active cores.

#### #9 - Core Swarm singleton (Phase B)
- **status:** done
- **size:** M
- **where:** `docker-stack.yml` `core`; graceful SIGTERM via lifecycle group
- **why:** Ship core image bumps without whole Compose reconcile
- **how (landed):** `replicas: 1` in app fragment; `stop_grace_period: 60s`; probes on `:19100` (was `:4010`). Interim `stop-first` superseded by #13.
- **acceptance:** Core rolls alone; dependents survive

#### #10 - Ready signal without Compose `depends_on`
- **status:** done
- **size:** M
- **where:** `shared/orchestrationprobes`; all app roles `:19100`; Traefik `healthcheck.port=19100` for api/ws-router
- **why:** Swarm lacks Compose health depends_on; probes must stay off traffic ports
- **how (landed):** Thin HTTP probes on dedicated listener. Core `/ready` = **handoff-ready standby** (deps + election loop + managed changeover) — **not** “holds primary.” Gated NATS health census bus scaffolded (`health.command.ping`, Enabled=false).
- **acceptance:** api/worker start order-independent; Swarm can Healthy a standby core during `start-first`

#### #11 - Lease-gate scheduler (leader only)
- **status:** done — validated on live roll
- **size:** L
- **where:** `core/scheduler` + `core/servicemanager` + `core/primarycontroller`
- **why:** Two cores would double-fire gocron / duplicate schedule publishes
- **how (landed):** Follow `lease:core:primary` state channel; start/stop under leader only; sticky Ready fail on bad leader start. Cron/one-time jobs take `context.Context` so gocron cancels in-flight work on Shutdown (e.g. market-prices micro-batch).
- **acceptance:** Two core processes may overlap; exactly one runs scheduler; kill/release leader -> standby takes over; mid-publish lose-primary stops early (no sustained dual publishers)

#### #12 - Lease-gate changestream watcher
- **status:** done — lease gate validated live; Redis resume + cancel-on-stop landed
- **size:** L
- **where:** `core/changestream` + `servicemanager` / `primarycontroller` + `core/primaryhandoff`
- **why:** Two watchers duplicate `doc.update` publishes; cold Watch on handoff misses oplog
- **how (landed):** Same primary gate as #11. Resume tokens in Redis (`eip:core:handoff:v1:cs:resume:{groupID}`) + `StartAfter` on acquire; cancel watch on lose-primary. At-least-once (rare dups OK). #20 remains separate (selective fan-out).
- **acceptance:** Kill leader -> standby resumes without sustained dual-watcher storm; bounded gap closed via resume

#### #13 - Core `start-first` / warm standby (Phase C hot-swap)
- **status:** done — validated on live roll
- **size:** M
- **where:** core `deploy.update_config` in `docker-stack.yml`
- **why:** Remove intentional dark window for live fan-out and schedules
- **how (landed):** `order: start-first`; healthcheck `/ready`; explicit primary lease release on Stop + unhealthy grace. Optional `replicas: 2` warm standby still parked.
- **acceptance:** Core image roll with resume-bounded handoff; no dual watchers; rollback if new never Healthy

#### #14 - Core CLI / one-shot job ops under Swarm
- **status:** done — validated mid-roll wait + one-shot
- **size:** S
- **where:** `make cli` → `scripts/swarm/ops/core-cli.sh`; [MAKE.md](./MAKE.md); core `tasks` wrapper unchanged
- **why:** `docker exec` + Compose `container_name: core` breaks under Swarm task IDs
- **how (landed):** Core-only (no api/worker/websocket CLI). Uses `lib/require.sh` + `STACK_NAME`. Resolve sole running `eip_core` via Swarm service label; on `UpdateStatus=updating` (or multiple tasks) announce mid-roll, snapshot baseline, wait until the **new** task is sole owner; fail on pause/rollback/timeout. One-shots: `make cli ARGS='list'` → container `tasks list` (no typed `tasks` prefix). Bare `make cli` = interactive shell escape. Not generalized to other Swarm roles.
- **acceptance:** Common migrations/tasks runnable without Compose container names; safe during `start-first` overlap

### Observability & edge (Phase D-ish)

#### #15 - Alloy / Loki / Prom label compatibility for Swarm tasks
- **status:** **done** (2026-07-24) — with Swarm obs/data stack move (`docker-stack.obs.yml` / Alloy on `eip-core`)
- **size:** M
- **where:** [`observability/alloy/config.alloy`](../../observability/alloy/config.alloy); Loki OTLP index labels; Prom scrape notes; Grafana log dashboards (`compose_service`)
- **why:** Compose label `com.docker.compose.service` missing on Swarm tasks broke LogQL filters
- **how (landed):** Alloy `discovery.docker` status filter + relabel: Swarm `eip_<role>` → `compose_service` / `swarm_service` / `task_slot` / `swarm_stack`; keep Compose labels during hybrid; drop Go OTLP services + socket proxies from docker-log scrape; Loki indexes `compose_service` (+ swarm labels); apps already set OTLP `compose_service` via telemetry
- **acceptance:** Stack task logs filter as `{compose_service="traefik"|"frontend"|…}`; Go services stay OTLP-only; Prom still scrapes Traefik + obs exporters when addon is up
- **capacity-controller build-up:** Prom + Asynq/Traefik series ready for #18; independent of full Grafana UI

#### #16 - Frontend on Swarm (with #3 secrets/config track)
- **status:** **done** (2026-07-23) — Swarm service in `docker-stack.yml` / `docker-stack.dev.yml`; bake group `swarm` includes frontend; app-train dual-warm; public runtime env only
- **size:** M (env/secret attachment + bake/release path; not just a YAML service block)
- **where:** frontend in app fragment [`docker-stack.yml`](../../docker-stack.yml); `x-frontend-public-env`; [ENV.md](./ENV.md); [APP_TRAIN.md](./APP_TRAIN.md) / #23; [MAKE.md](./MAKE.md) rebuild/bake
- **why:** Same rolling-deploy story as api; FE needs public client knobs at start — under the Swarm env model, not a second Compose-only path
- **how (landed):** `frontend` on stack (`start-first`, Traefik swarm labels); `x-frontend-public-env` (public knobs only — no docker secrets for FE); bake/promote like other app roles (`dev_app_services`); app-train `WARM_ORDER` includes FE (no Compose FE-first); `make dev` bakes FE then Compose data plane then `stack-deploy --dev`; `make rebuild` default = Swarm app roles only
- **acceptance:** Frontend on Swarm; rolls with app train without data-plane bounce; required boot env from stack public env attachment (not a full shared god `.env` dump) — **met**
- **pairs with:** #3 (done; `*_API` user creation = Ensure follow-up), #23/#33/#35 (train/bake), #24/#32 (apply verbs)

#### #17 - Makefile / DEPLOYMENT.md operator surface
- **status:** **done** (2026-07-23) — public Make thinned; scripts layout; docs + cross-OS smoke notes. Scale helpers **dropped** (YAML + `make swarm-sync`; automatic scale = **#18**).
- **size:** M
- **where:** `Makefile` (`make help` / `help-dev`); `scripts/{bootstrap,lib,swarm,ops,test}/`; `DEPLOYMENT.md`; [MAKE.md](./MAKE.md)
- **why:** Public users need one bring-up story and clear day-2 apply/rebuild - without learning hybrid internals or OS-specific commands
- **how (landed):**
  - **Bring-up:** `make up` / `make dev` → `scripts/bootstrap/compose-data-plane.sh` + internal stack rematerialize (no public `make stack-deploy`)
  - **Day-2:** `make swarm-sync` + `make swarm-secrets-sync` (#32); `make rebuild` (#33); `make release` / `dev-release` (#23)
  - **Scale:** edit `eip.config.yaml` → `make swarm-sync` (no `scale-*` Make targets)
  - **Refresh:** `make update-files` → whole-folder `scripts/` replace via `lib/public-bundle.sh`
  - **Layout:** `scripts/lib`, `bootstrap/`, `swarm/`, `ops/`, `test/`
  - **Docs:** DEPLOYMENT/ENV/MAKE paths aligned; [MAKE.md cross-OS smoke](./MAKE.md#cross-os-smoke-public-verbs)
- **acceptance:** Docs describe bring-up vs apply vs rebuild; no public dual-name for env apply; public verbs smoke-documented on Windows/Linux/macOS; no Compose-elastic product path — **met**
- **capacity-controller build-up:** #18 will own automatic scale; operators already have YAML + `swarm-sync` as the manual path

### Capacity controller (Phase E)

#### #18 - Capacity controller (singleton Swarm service)
- **status:** open - blocked on Phase A practicals (#2, #4-#8), trustworthy metrics (#7, #15), and policy schema (#19); WS scale-down blocked on #8 drain / #21 evacuate
- **size:** L
- **where:** **dedicated** app image/service (`capacity-controller`); Docker API via its **own** allowlisted proxy (`capacity-controller-docker-proxy` — pencil stub in `docker-stack.yml`); **Prometheus on Swarm data fragment** (`docker-stack.data.yml`, with SeaweedFS) + Prom query client; mounted YAML from #19; Redis lease + optional pin overrides
- **why:** Swarm only holds a desired replica count. Something still must decide **cluster shape**: how many worker/WS/api replicas, when to drain/remove a slot, how much spare capacity to keep, and (later) which replica should receive a new or migrated tenant. That is richer than watching CPU. Own container keeps Docker privileges and scale loops out of core/api/worker, and lets Swarm replace it like other singletons.
- **how:** Dedicated **capacity controller** service only (no app replica calls Docker to scale itself). **Docker socket pattern (locked with Traefik/ws-router):** one `tecnativa/docker-socket-proxy` per trust boundary on its **own** overlay (`eip-docker-traefik` / `eip-docker-ws` / `eip-docker-capacity`) — never mount the sock on the controller, never put proxies on `eip`, never share docker nets across consumers, and never widen `traefik-docker-proxy` / `ws-docker-proxy` for Apply. Controller proxy is the only one that may enable `POST` (scale/update) after **#27** dry-run + **#30** executor. **Swap model (locked):** lease-gated **hot-swap from day one** - same spirit as core Phase C (`start-first`, single leader via Redis lease; optional warm standby). New task acquires lease before arming mutations; old task releases lease on SIGTERM. Cooldown/hysteresis state may live in Redis so a roll does not forget recent scale decisions.

  **Internal shape (same binary, three packages - not three services):**

  ```text
  capacity-controller/
    policy/     // "what should happen?" - pure Evaluate(state, yaml) -> desired
    cluster/    // "what exists?" - read observations + Apply mutations via #30
    executor/   // "make reality match desired" - ordered scale/drain/pin ops
  ```

  **Reconciliation loop (golden rule):** `Observe -> Evaluate -> Apply -> Wait`. Policy evaluation is **deterministic and side-effect free**; Docker (and later drain/pin side effects) live only behind the cluster/executor boundary (#30). That keeps #18 coherent as one product owner without one undifferentiated blob.

  Periodically evaluate the cluster against YAML (#19), not a single metric sample. Responsibilities:
  1. **Desired replica counts** - worker / websocket / api within min-max from queue depth, client load, host headroom.
  2. **Reserve / spare capacity** - e.g. keep `reserve_capacity` headroom before average WS utilisation forces scale-up.
  3. **Scale-up sequence** - raise desired replicas -> wait healthy -> optionally prefer the new slot for **new** tenants (soft pin / cordon policy).
  4. **Scale-down sequence** - cordon -> drain/evacuate (#21) -> when empty `docker service scale` down (never instant kill of a hot slot).
  5. **Optional placement overlays** - Redis pins / migrate targets written for #21 / controller; **default placement remains ws-router Redis map (#4)**.
  6. **Kill switches & lease** - per-service `capacity_controller_managed: false`; only the lease holder mutates Docker; hot-reload config.
  7. **Human ops CLI** - keep **`make ws-placement-ops`** as the operator surface; when the controller is armed it should **call the controller** (same evacuate/cordon/pin verbs), not write Redis/Docker in parallel. Direct Redis from the script stays a **break-glass** (unarmed / emergency) path only — do not teach two steady-state writers.
  
  Signals: Asynq queue depth/age; per-slot WS clients / hot-tenant; optional API latency/CPU. **Prometheus is part of this setup** — Swarm **data** fragment service (lean scrapes), independent of #34. **node-exporter / host headroom later** - not v1. Observability addon (#34) not required. Introduce order: **worker -> websocket (up first, down only with drain) -> api**.

  Illustrative loop: two WS slots at ~90% of `target_clients` -> decide scale to 3 -> wait WS-3 healthy -> place new tenants on WS-3; later average ~30% -> drain WS-3 -> when empty scale to 2.
- **acceptance:** Controller is its own Swarm service and rolls via `service update` without bouncing the stack; hot-swap transfers lease with no dual Docker mutators; packages keep policy pure (fixture-tested) and Docker confined to cluster/executor; worker and WS desired state converge under YAML without hand-scaling; operators can disable/clamp via YAML; scale-up respects host ceilings when configured; WS scale-down always drains; no replica stampede; **#27 dry-run** + **#30** fake cluster proven before arming Docker mutations in any environment

#### #19 - Operator config YAML (capacity + addons + tunables)
- **status:** partial (2026-07-20; sync-env ephemeral 2026-07-23) — example + **make swarm-sync** consumes replicas/capacity/bridges **and** ports/paths; durable **`.eip-sync.env` retired**; addon apply still open
- **size:** M
- **where:** [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go); `eip.config.yaml` (local); `services/eipconfig` + `services/cmd/eipconfig`; `scripts/swarm/lib/eip-config.sh` (`eip_sync_env_temp` / `eip_write_sync_env`); [ENV.md](./ENV.md); [MAKE.md](./MAKE.md)
- **why:** Ceilings, targets, reserve %, drain timeouts, kill-switches, **and addon toggles** must be tunable without rebuilding images; multi-tenant product will need more knobs than “global clients > N”; secrets stay in `.env`
- **how (seeded):** Versioned example; Go validate/sync-env; `make swarm-sync` / stack expand → **ephemeral** sync-env temp (not a durable `.eip-sync.env`). Sync-env bridges: replicas=`min`, `eip.capacity.*`, Traefik host publish + dashboard/Grafana paths. Concurrency / client cutoff applied as task env via `apply.go` (`docker service update`), not sync-env. Compose data plane uses `--env-file .env` only.
- **how (still open):** addon toggle (#34); production mount for #18; richer schema / dry-run policy print for controller
- **acceptance:** Example YAML in-repo; sync applies capacity + ports/paths without data-plane bounce. Remaining: addon + #18 consume path.

### Multi-tenant realtime efficiency (after affinity)

#### #20 - Selective JetStream / WS fan-out (interest-based)
- **status:** open - blocked on usable affinity (#4) + hosted-tenant tracking (#8); strongly paired with document-lock **#32** (tenant subjects / WS subscribe set)
- **size:** L
- **where:** websocket JetStream consumers (`doc.update.>`, `doc.lock.>` today); Redis interest registry (connect/move path only); changestream / lock publishers; tenant (or shard) in subject
- **why:** Today each replica’s durable filters `doc.update.>` / `doc.lock.>` so **every container receives every message**, then `deliverOutbound*` no-ops when no local clients - fine when sticky scatters users; once orgs are co-located, this is pure firehose cost on replicas that will never deliver
- **how (direction - prefer no Redis on changelog hot path):**
  1. **Interest registry in Redis** - updated on connect/disconnect/move/heartbeat only. **Not** queried per changelog. Used for placement (#4/#21), ops visibility, and reconciling what a slot *should* be subscribed to.
  2. **Preferred delivery: dynamic subscribe on the WS side** - core still publishes **once** to a tenant-keyed (or shard-keyed) subject. Each slot consumes only what it hosts. Avoid publish-time Redis lookup.
  3. **Keep consumer cardinality small (cleanup hygiene):**
     - **Do not** mint one long-lived JetStream durable per `(slot, tenant)` - that is what gets messy (orphans × tenants × deploys).
     - **Prefer one durable per slot** (same naming generation as today: `doc-live-updates-websocket-N`) whose **filter set** is updated as tenants join/leave that slot (JetStream `FilterSubjects` / consumer update, or equivalent). Dead **slot** -> one durable to reap, not thousands.
     - **Alternative if filter churn hurts:** coarse **shards** (`doc.update.shard.{0..K}.>`), slot subscribes to a few shard subjects; tenants map to shards via hash - fewer subscribe mutations, slightly less precise than per-tenant.
     - **Ephemeral / pull consumers tied to process lifetime** where JS allows - vanish when the task dies; less durable garbage.
  4. **Dead subscriber cleanup (layered, reuse what you already have):**
     - Redis interest keys: **TTL + heartbeat**; failed slot disappears from the map without a delete message.
     - JetStream: set **`InactiveThreshold`** on fan-out durables (already used for today’s per-replica durables) so abandoned pull consumers self-delete.
     - Startup / periodic **reconcile** (same idea as `DocUpdateFanoutKeepPolicy` / stream consumer reconcile): allowlist current slot durable(s); delete orphans from old slots or old naming generations.
     - On shutdown / cordon / evacuate (#21): explicitly remove interest + shrink filters before exit when possible; TTL/InactiveThreshold cover crashes.
  5. **Safety:** short grace or dual-interest while #21 moves; optional low-rate catch-all only for miss windows - not a permanent second firehose.
  6. **JetStream retention / replay:** selective filters change which messages a slot *pulls*, not what the stream *stores*. After a move/filter widen, a slot might see a backlog (or nothing if messages already aged out). Define stream `MaxAge` / limits and whether new filters start at “new only” vs resume - so #21 reconnect doesn’t dump hours of history or silently miss. Detail in the #20 design note.
  7. **Metrics:** messages pulled vs delivered per slot; filter/interest size; orphan durables deleted; miss/retry counts.
  8. **Not** required for Phase A hard cutover.
- **acceptance:** Hot corp load test: non-hosting slots pull ~zero for that tenant; kill a slot -> interest/durable cleanup clean; documented backlog vs new-only policy on filter change
- **capacity-controller build-up:** hot-tenant metrics honest; #18 / #8 / #21 know where tenants live without a Redis GET on every Mongo change

#### #21 - Tenant rebalance / evacuate / move (WS placement control plane)
- **status:** partial - **minimum + force-close landed** (2026-07-19). Hosted-tenant **query surface parked** with #18/#20; soft caps still open (#8). Stronger with #20.
- **size:** M
- **where:** Redis placement map + pin/cordon keys; WS control/close codes; SPA reconnect; ops / capacity-controller hooks; [WS_ROUTER.md](./WS_ROUTER.md)
- **why:** Router MVP **instant-reassigns** dead slots on connect (balancer stays correct). Safe **scale-in** needs controlled cordon / drain / evacuate so a hot alliance is not cold-killed when shrinking or migrating.
- **how (direction - prefer reconnect over live TCP migrate):**
  1. **Default remains Redis placement** via ws-router (#4). Pins/cordon are **ops overlays** on the same map.
  2. **Operations:** evacuate slot / move tenant / rebalance - write overlays, cordon (refuse new upgrades), signal reconnect; clients land via router using updated Redis state. Today: `make ws-placement-ops` writes Redis (+ drain PUBLISH). **When #18 is armed:** same make target should talk to the **capacity controller** (controller applies Redis + NATS drain notify); do not delete the CLI or leave it as a second write path.
  3. Instant reassign on connect remains the crash/miss fallback - not a substitute for planned evacuate.
  4. **Safety** + doc-lock coordination; dual-interest grace for #20.
  5. Not required for basic place-to-live-slot; **required** before automated WS scale-down (#18).
- **acceptance:** Evacuate/move works without cold-killing a hot slot; scale-in playbook evacuates before `service scale` down
- **capacity-controller build-up:** #18 WS scale-down should call evacuate when shrinking would leave a hot slot dying cold

### Release / ops (after basic cutover)

#### #22 - Data-plane container updates (mongo / redis / nats) - later
- **status:** open - **low priority** - after elastic Swarm cutover is routine
- **size:** M
- **where:** mongo / redis / nats; named volumes; deploy docs
- **why:** One DB per deployment stays; bumping the DB **container** without taking the whole app down would help
- **how:** Volume-preserving **stop-first** replace; brief gap OK (same spirit as core Phase B). No data-plane capacity control. Explicit “touch rarely.” **Not** a Phase A blocker.
- **acceptance:** Playbook to bump mongo/redis/nats image without full-stack down; data intact

#### #23 - App-train rolling release (GHCR waves; data plane untouched)
- **status:** partial (2026-07-20; FE Swarm dual-warm 2026-07-23) — **unattended dual-warm wave** landed in `scripts/swarm/release.sh`; absorbs **#6**. Controller soft dual-run / HTTP train cookie still open
- **size:** M
- **where:** [APP_TRAIN.md](./APP_TRAIN.md); `scripts/swarm/release.sh` (`make release` / `make dev-release`); [MAKE.md](./MAKE.md); pairs with #33 rebuild, #21 drain
- **why:** `make up` can recreate Compose and bounce mongo/redis/nats. Day-2 must ship a new **app train** without taking the data layer offline
- **how (landed):** Build/pull all images first (`--no-cache` on local version rolls); Swarm **core stop-first** before elastic dual-warm; dual-warm `WARM_ORDER` includes **frontend** (no Compose FE-first / PASS1); dual-warm scale **R -> 2R**, roll until bake >= R NEW; **advertise once** before any OLD tear-down; look-ahead cordon; drain passes then scale to R; column advance uses `ADVANCE_GAP` (never delay 0); ws-router **prefers newest bake** (reassign sticky off OLD; OLD SPA may use NEW); FE snackbar still fires but **does not block** WS reconnect; unattended (no operator gates)
- **how (still open):** Controller soft cutover / soak (#18); HTTP train cookie; deepen #29 wave dry-run; optional dual-warm overshoot polish if Swarm races past R NEW
- **acceptance (partial):** Unattended dual-warm + advertise-before-drain + look-ahead + prefer-newest place proven on local bake-tag waves. Remaining: controller soft-cutover automation; GHCR soak evidence

#### #24 - Secrets apply + day-2 config refresh (public deploy)
- **status:** **done** (2026-07-23) — mechanics + public docs: **`make swarm-secrets-sync`** / **`make swarm-sync`**; DEPLOYMENT / ENV / STACK / BIND_MOUNTS aligned (`.env` schema = `EnvFields` Go SoT). Optional `*_API` user creation = Ensure follow-up (out of #24).
- **size:** M
- **where:** [ENV.md](./ENV.md); `Makefile` / #32; [DEPLOYMENT.md](../../DEPLOYMENT.md); [`docker-stack.yml`](../../docker-stack.yml); operator config YAML (#19)
- **why:** Public tool - operators edit secrets and config. Swarm tasks do not auto-reload; need a clear apply path that is not full `make up`
- **how (landed):** **`.env` = secrets** → Compose data plane (`--env-file .env`) + elastic via **`make swarm-secrets-sync`** (versioned Swarm secrets + `/run/secrets/<KEY>`); non-secrets in operator YAML (#19) via **`make swarm-sync`** (ephemeral sync-env). Mesh hosts/URLs from stack anchors. Frontend public knobs via `x-frontend-public-env` (#16). Operators taught day-2 verbs, not public `stack-deploy` / raw `docker secret`.
- **acceptance:** Following the doc, a user changes a documented secret via `make swarm-secrets-sync` or config via `make swarm-sync` without bouncing the data plane unnecessarily — **met**.
- **pairs with:** #3, #16, #32 (done); #17 (broader operator-surface polish)

### Testing & simulation harnesses

#### #25 - Swarm test suite foundation
- **status:** open - start alongside Phase 0/A (do not defer entirely)
- **size:** M
- **where:** e.g. `services/...` Go tests + `scripts/swarm/` or `tests/swarm/`; CI job; `make` targets (`make test-swarm`, `make sim-ws`, …)
- **why:** Need one place for unit/integration + entrypoints to sims so features don’t ship untestable
- **how:** Package layout; shared fixtures (fake metrics, mini Redis/NATS where needed); document how to run against `make dev`; CI runs unit + cheap integration on PR
- **acceptance:** `make test` (or documented target) runs the foundation green in CI; README section in this roadmap or `docs/swarm/TESTING.md` pointer linked from Start here

#### #26 - WebSocket connection / affinity simulator
- **status:** open - pairs with #4 / #8
- **size:** M
- **where:** load/sim tool (Go or existing stack) that opens many `/ws` with chosen affinity cookies; asserts backend co-location and reconnect/handoff
- **why:** Cannot validate Redis placement co-location or drain behaviour with a handful of manual browsers
- **how:** Configurable N clients, affinity key distribution (same corp vs many accounts), reconnect storms, optional mid-test kill of a slot; report which backend each client landed on (via debug header, metrics, or server-side counter)
- **acceptance:** Script can prove “N clients with key K -> same slot”; reconnect after kill recovers; runnable via make against local stack

#### #27 - Capacity controller dry-run / simulation
- **status:** open - pairs with #18 / #19 / #30; **required before arming real Docker mutations** (`service scale`, drain, optional pins)
- **size:** M
- **where:** `policy.Evaluate` unit tests + capacity-controller flags (`--dry-run`); fake `#30` cluster impl that records Apply calls
- **why:** Must simulate full **cluster-shape** decisions (queue spikes, client floods, reserve headroom, drain-then-scale-down, host ceiling) without mutating prod Swarm
- **how:** Golden fixtures for pure `Evaluate` (e.g. “two slots @90% -> scale to 3”; “three slots @30% -> drain newest -> scale to 2”); dry-run wires Observe -> Evaluate -> Apply against a recording cluster; never opens Docker socket unless `EIP_CAPACITY_ARMED=1`
- **acceptance:** Full policy suite without Docker; documented sims of worker scale-up/down, WS reserve/scale/drain cycle, and host-ceiling pause

#### #28 - Core leadership / failover tests
- **status:** done (2026-07-22)
- **size:** M
- **where:** `core/primarycontroller`, `core/servicemanager`, `core/scheduler`, `core/health`, `core/changestream`, **`core/leadership`** (cross-package dual-publisher)
- **why:** Dual changestream/scheduler is catastrophic; must prove single-leader and takeover SLA
- **how (landed):** Dual-replica election + standby Ready; Managed lose-primary stop; scheduler in-flight cancel; `/ready` handoff HTTP; changestream resume + cancel-on-stop; **`leadership.TestDualReplica_exactlyOnePublisherAndTakeover`** (two controllers + Managed fake publishers on shared miniredis — never dual `IsLeader`, steady-state one armed publisher, Stop→takeover republish, no sustained dual arm); **`TestDualReplica_takeoverBoundOnStop`** (clean Stop SLA). Crash/TTL takeover covered by `lease.TestRunWhileHeld_TakeoverAfterLeaderDies`. Full OS dual-binary smoke not required — property is the mutual-exclusion gate.
- **acceptance:** Automated test fails on dual leader / sustained dual publisher; clean-Stop takeover within bound; in-flight cron cancel — **met**
- **run:** `go test ./core/leadership/ ./core/primarycontroller/ ./core/servicemanager/ ./core/health/ ./core/changestream/ ./core/scheduler/ ./core/primaryhandoff/` (from `services/`)

#### #29 - Management ops simulator (evacuate / move / cordon / app-train wave)
- **status:** open - pairs with #21 / #23 / #6
- **size:** M
- **where:** `scripts/swarm/` or service admin endpoints gated for non-prod
- **why:** Ops paths must be rehearsable without waiting for a real hot alliance incident
- **how:** CLI or make targets that: cordon a slot, move a synthetic tenant, run **app-train wave dry-run** (optional Traefik-first step + N+1 GHCR cohort), assert interest/map/client counts; use sim clients from #26 where needed
- **acceptance:** Documented drill: evacuate slot -> clients (#26) land elsewhere; app-train wave dry-run prints step list without applying; CI can run a subset without live Swarm

#### #30 - Cluster state abstraction (capacity controller)
- **status:** open - start with or just before #18 / #27; do **not** let Docker SDK types leak into `policy/`
- **size:** S
- **where:** `capacity-controller/cluster` (interface + Swarm impl + fake/recording impl)
- **why:** Before the Docker API leaks everywhere. Policy must not import Swarm client types; dry-run (#27) and future API/orchestrator churn stay confined. Not a bet on leaving Swarm - a seam for testability and executor hygiene.
- **how:** Define a small interface, e.g. observe workers/websockets/api (replica counts, slot IDs, client counts, health), plus Apply ops (`Scale`, `Cordon`, `Drain`, optional pin helpers). First impl talks to Docker Swarm (+ Prom/Redis reads as needed for Observe). Fake impl feeds fixtures and records mutations. Keep the surface minimal; grow only when #18/#21 need new ops.
- **acceptance:** `policy` package has **zero** Docker imports; #27 runs Evaluate + Apply against fake cluster; Swarm impl is the only production adapter

#### #31 - Docker Desktop host publish for Traefik on overlay `eip` 
- **status:** **done** (2026-07-19) - Swarm Traefik + **ingress** publish
- **size:** M
- **where:** `docker-stack.yml` service `traefik` -> `eip_traefik`; [TRAEFIK.md](./TRAEFIK.md); `make up` / `make dev`
- **why:** Compose Traefik `ports:` on attachable overlay hung from Windows Desktop (`SYN_SENT` to overlay IP). Blocked localhost app + Grafana `/grafana`.
- **how (landed):** Run Traefik as a Swarm service with `mode: ingress` publish for `80`/`443`/`81`. Keep dual providers (docker + swarm) on `eip`. DNS alias `traefik` for Prom. No Compose Traefik fallback (Desktop host publish broken on overlay). No permanent `eip-edge` nginx.
- **acceptance:** From Windows host, `curl http://127.0.0.1/ping`, `/`, and `/grafana/login` (dev) return timely HTTP; in-Docker path still works; no Compose Traefik fallback. **Follow-on (#19/#32):** configurable `ports` / `paths` applied by `make swarm-sync`.

#### #32 - `make swarm-sync` / `make swarm-secrets-sync` (day-2 config + secrets)
- **status:** partial (2026-07-20; ephemeral sync-env 2026-07-23) — YAML targeted apply (capacity + ports/paths) **and** secrets-only **`make swarm-secrets-sync`** landed; Swarm `secret` objects landed under **#3**
- **size:** M
- **where:** `Makefile` (`swarm-sync`, `swarm-secrets-sync`); `scripts/swarm/swarm-sync.sh`; `scripts/swarm/swarm-secrets-sync.sh`; `services/eipconfig`; `scripts/swarm/lib/eip-config.sh`; [MAKE.md](./MAKE.md); [ENV.md](./ENV.md); [BIND_MOUNTS.md](./BIND_MOUNTS.md); [TRAEFIK.md](./TRAEFIK.md)
- **why:** Full `make up` is a sledgehammer for config/secrets edits while the stack is running; secrets and YAML must not share one easy-to-mistype verb
- **how (landed):** `go run ./cmd/eipconfig` validate + sync-env + **apply**; sync-env is **ephemeral** (no durable `.eip-sync.env`); **`make swarm-secrets-sync`** → versioned Swarm secrets + stack rematerialize (no YAML; no data-plane bounce); adminSDK binds removed; cross-platform via `$(BASH)`
- **how (still open):** Compose secret recreate path end-to-end polish (data-plane `.env` bounce UX)
- **acceptance (partial):** Edit `eip.config.yaml` → `make swarm-sync` updates Swarm capacity/bridges and ports/paths without mongo/redis/nats bounce. Edit `.env` → `make swarm-secrets-sync` refreshes elastic — **public docs met under #24**. Optional `*_API` DB users = Ensure follow-up

#### #33 - `make rebuild` (dev scoped image rebuild + roll)
- **status:** done (2026-07-20; FE on Swarm default 2026-07-23) for **dev day-2** — default = `dev_app_services` (Swarm bakeable roles incl. frontend), Docker cache, smart recreate; prod GHCR rebuild path still with #23
- **size:** M
- **where:** `Makefile` (`rebuild`); `scripts/swarm/rebuild.sh`; [MAKE.md](./MAKE.md)
- **why:** Local code changes should not require full down/up of mongo/redis/nats
- **how (landed):** Default `SERVICES=` = `dev_app_services` only (api,websocket,worker,ws-router,core,frontend — **no** Compose `:local` FE). Docker/BuildKit **cache** by default (`--no-cache` opt-in). Default path: data plane `up -d --no-recreate`. Swarm: bake to `:bake`, promote per-role `TAG_*` only when that role’s digest changes (`docker image inspect`; `--roll-only` forces roll). `SERVICES=` accepts any Swarm name (`traefik` included) and any Compose service from `compose config --services`; explicit compose extras / data-plane **force-recreate**. No advertise
- **how (still open):** Dedicated GHCR/`APP_VERSION` rebuild path for prod day-2 if needed beyond `make release`
- **acceptance:** Cached rebuild of selected/full app train without bouncing healthy data plane; explicit `SERVICES=mongo` (etc.) can force that container

#### #34 - Observability addon (optional; default off)
- **status:** open - pairs with #19 / #15; **not Phase 0**
- **size:** M
- **where:** Compose **observability fragment** (split from always-on data plane); operator config `addons.observability`; app OTLP/Alloy coupling
- **why:** Lean self-hosts should not pay for Grafana/Loki/Alloy/exporters/asynqmon UI; controller needs Prom separately (#18), not the full addon
- **how:** Toggle = include/omit the observability Compose fragment (no Prom inside it). Addon = Grafana, Loki, Alloy (human/log path), mongo/redis/nats exporters, asynqmon UI. Apps must soft-fail OTLP / run correctly with addon off. **Prometheus stays on Swarm data fragment** with controller setup — always outside this toggle.
- **acceptance:** Default install runs core app path with observability fragment off; enabling addon via config + bring-up/sync starts only that fragment; apps healthy without Alloy; Prom (when present for #18) still scrapes lean app/Asynq targets

---

#### #35 - Buildx local bake for Swarm app images (separate `make up` / `make dev`)
- **status:** **done** (2026-07-20; frontend in bake group 2026-07-23) — bake group `swarm` = api/websocket/worker/ws-router/core/**frontend**
- **size:** M
- **where:** [`docker-bake.hcl`](../../docker-bake.hcl); `scripts/swarm/bake-local.sh`; `docker-stack.dev.yml`; `Makefile` `dev` / `rebuild`; [MAKE.md](./MAKE.md)
- **why:** Swarm does not build images. Compose `--profile build-elastic` coupled bring-up, stamped `com.docker.compose.*` on Swarm tasks, and forced unconditional `--roll-only` after deploy.
- **how (landed):** buildx bake group `swarm` → stable `:bake`, then per-role promote to `${APP_VERSION}-<timestamp>` only when digest changes; digests via `docker image inspect` (no python/node/jq). **`make dev`** bakes (incl. FE) then Compose data plane only then `stack-deploy --dev`; **`make up`** unchanged (GHCR pull, no bake); **`make rebuild`** calls `bake-local.sh` for `dev_app_services`. No `stack-force-local` (unique tags roll without `--force`).
- **acceptance:** Local Swarm images build without Compose service definitions for app train; `make up` and `make dev` diverge (pull vs bake); Desktop no longer implies app tasks are Compose-owned; Win/Linux/macOS via existing `$(BASH)` path; hybrid runtime unchanged
- **pairs with:** #17 (operator surface), #33 (rebuild), #16 (frontend on Swarm)

---

## Impact map

| Area | Swarm effect |
|------|----------------|
| JetStream WS durables / `ws_instance_id` | **Better** with slot IDs (#2); stays coherent under scale |
| Live doc/lock during **ws/api** roll | **Better**; brief reconnect (#8) |
| Live doc/lock during **core** roll | **Worse** gap until #11-#13 |
| Document locks / Redis sessions | Neutral -> better with more API replicas; tenant locks ([doc-lock #30+](../document-lock/ROADMAP.md)) need tenant-aware WS fan-out |
| Corp/alliance co-located WS | **Target** via ws-router Redis placement (#4); sticky fallback only |
| Full JetStream firehose to every WS replica | **Today’s design**; acceptable pre-affinity; **retire toward #20** once orgs are grouped |
| Asynq / ESI workers | Better throughput; overscale risk (#7); later capacity-controlled (#18); schema room for org queues (#19) |
| Websocket capacity | Affinity + manual/capacity control; drain must respect hot tenants (#8 -> #18); **moves** via #21 |
| Tenant pins stuck on one slot | Fixed by **#21** rebalance/evacuate; needed for scale-in |
| Alloy/`compose_service` logs | **Done (#15)** — Swarm → `compose_service` relabel |
| Observability footprint | **Target:** addon off by default (#34); Prom only with controller setup |
| `docker exec core` / fixed names | **Done (#14)** — `make cli ARGS='…'` / `make cli` |
| Traefik `/ws` routing | Swarm provider -> **ws-router**; not opaque sticky as end state |
| `make dev` vs prod | Same app/images; day-2 **`swarm-sync` / `rebuild`** (#32 / #33) vs full bring-up |
| Mongo/Redis/NATS data | One DB; touch rarely; optional later volume-preserving swaps (#22) |
| Version bumps | App-train GHCR waves (#23); Traefik rare/separate; data plane untouched |
| Public secrets / config edits | `.env` → **`make swarm-secrets-sync`**; YAML → **`make swarm-sync`** (#24 / #32) |
| Testing / sims | Required track **#25-#30**; dry-run capacity controller (#27) + cluster seam (#30) before real scale/drain |
| Local Desktop host -> Traefik | **Done (#31)** - Swarm ingress `eip_traefik` |
| Cross-platform make | Same verbs Win/Linux/macOS via Git Bash path (#17 / #32 / #33 / #35) |

---

## Recommended pickup order

1. **#1 / #2 / #5 / #24 (partial), #4 (impl), #3 inventory, #31, start #25** - Phase 0 closed; hard-cutover hybrid stack live on `swarm/hard-cutover`. Operator smoke: overlay + `make stack-deploy` (STACK.md).
2. **#4 done** - same-tenant to same-slot (`make smoke-ws-placement`)
3. **#21 minimum done** - cordon / evacuate / pin (`make ws-placement-ops`); then #8 hosted-tenant / reconnect polish
4. **draft #19, #8 code, #26** - #7 + #8 docs done; force-close / soft caps / sim later
5. **#3 + #16 + #17 + #24 done** — secrets/config + frontend on Swarm + bake/train + day-2 apply docs + operator Make/scripts surface. **#23/#33/#35** as needed.
6. **#34** (+ app-without-Alloy) when leaning installs / addon toggle - in parallel if needed
7. **#9–#14 + #28 done** - core boxed off
8. **#15 done** (Alloy Swarm → `compose_service` with obs stack move)
9. **#19 -> #30 -> #27 -> #18** - policy schema + cluster seam + **dry-run** before armed capacity controller (+ Prom with controller setup)
10. **#20** + extend #26/#29 - selective fan-out
11. **#22** data-plane updates - last
12. **#31 done** (already landed) - Swarm Traefik + ingress; recover with make up / make dev (no Compose-elastic hatch)

---

## Follow-ups (detail later)

1. **#4 done** - placement + acceptance ([WS_ROUTER.md](./WS_ROUTER.md); `make smoke-ws-placement`).
2. **Tenant evacuate / rebalance (#21)** - minimum done; deepen with #8 reconnect signal; cordon/drain/pins on same Redis map.
3. **Hard cutover ops polish** - stack live; secrets/config day-2 (#24/#32); roll playbook (#6) absorbed into #23 (dual-warm wave landed).
4. **Core readiness (#10)** — done.
5. **Scheduler lease (#11)** — done (incl. in-flight cancel).
6. **Changestream lease / resume (#12)** — done (Redis resume + cancel on lose-primary).
7. **Observability addon (#34)** — labels (#15) done with Swarm obs/data move.
8. **Worker + host capacity (#7 done / #19)** - node-exporter later.
9. **Operator runbooks** - cutover; **app-train** ([APP_TRAIN.md](./APP_TRAIN.md) / #23); **`make rebuild`** (#33); **`make swarm-sync`** / **`swarm-secrets-sync`** (#24/#32); **`make cli`** (#14); evacuate (#21).
10. **Capacity controller (#18/#19/#30)** - `policy`/`cluster`/`executor`; Observe->Evaluate->Apply->Wait; **dry-run first (#27)**; Prom with controller.
11. **Multi-tenant infra sync** - locks + auth + placement.
12. **Selective WS fan-out (#20)** - filters; retention policy.
13. **Core hot-swap (#9/#13) + failover tests (#28) + CLI (#14)** — done (core boxed off).
14. **Data-plane update (#22)** - later.
15. **Ensure — least-privilege API DB users** — when wanted: create `MONGO_*_API` / `REDIS_*_API` in admintool Ensure (Mongo user + Redis ACL), set keys in `.env`, `eip secrets`. App already falls back when unset (`ConnectAPI` / optional api-only secret attach). Mongo keyfile + root/app users + preimages + indexes already owned by `EnsureMongo`.
16. **Testing architecture (#25-#29)** - CI layout; WS load tool; capacity dry-run; chaos drills; make targets; what runs in PR vs nightly.
17. **Operator config split + make swarm-sync/rebuild** - secrets `.env` vs YAML; cross-platform scripting rules.
18. **Companion doc renames** - ENV.md / MAKE.md / STACK.md / DEPLOYMENT.md edited for #24/#32/#17 (public Make surface closed).
19. **Buildx local bake (#35) done** - Swarm via `docker-bake.hcl` → `:bake` + per-role `${APP_VERSION}-<timestamp>` in `.eip-local-build.env` + `docker-stack.dev.yml` (group `swarm` includes **frontend**); `make up` pull vs `make dev` bake/`stack-deploy --dev` (no force-local).
20. **`.eip-sync.env` bridge — done/closed (2026-07-23)** — durable file retired. Capacity/ports/paths bridges are **ephemeral** via `scripts/swarm/lib/eip-config.sh` (`eip_sync_env_temp` / `eip_write_sync_env`) at stack expand and `make swarm-sync`. Compose uses `--env-file .env` only.
21. **`eipconfig` package cleanup (defer)** — after stack / data / app / obs layer churn settles. Today `services/eipconfig` + `cmd/eipconfig` own operator YAML (`eip.config`), Swarm apply (capacity / Traefik / Grafana), Redis advertise, **and** stack-fragment parsing (`docker-stack*.yml`: capacity sync labels, file-config sync, service lists/images via yaml.v3). Bash (`configs.sh`, `yaml-services.sh`) shells into that CLI. **Cleanup:** split or rename so “operator config” is not the home for stack discovery + advertise; keep yaml.v3 as the only YAML parser; clarify public vs internal subcommands. Do **not** start this while still reshaping fragments and label opt-ins. **Public ops target:** host **`eip` / `eip.exe`** (one binary: desktop TUI + server CLI) from source folder [`admintool/`](../../admintool/) — **not** a Docker oneshot wrapper (deferred). Swarm stack/networks stay `eip`. See [`docs/admintool/`](../admintool/) and [`admintool/README.md`](../../admintool/README.md).

---

## Decisions log

Locked from planning (2026-07-19+). Keep unless deliberately revisited:

| # | Decision |
|---|----------|
| 1 | **Single host** is the permanent product topology. |
| 2 | One DB per deploy remains; **data-plane container swaps** are a **later** nicety (#22), not Phase A. |
| 3 | **Host resources** / node-exporter factor into capacity policy when aggressive control is real - **not v1**. |
| 4-6 | **Release model (#23)** - all app images (`APP_VERSION`) roll as one **app train** via **dual-warm 2R** (NEW cohort beside OLD) -> **advertise once** -> look-ahead drain -> scale to R. Not dual full blue/green stacks. OLD SPA may use NEW backends; FE snackbar does not block WS reconnect. |
| 5 | Public operators use **`.env` for secrets** and a separate **operator config YAML** for replicas/addons/tunables; day-2 apply via **`make swarm-secrets-sync`** (`.env`) and **`make swarm-sync`** (YAML) (#24 / #19 / #32). |
| 29 | **Edge vs app vs data** - Traefik = upstream image, rare, **first when changed**. Data plane (mongo/redis/nats) **never** in normal releases (`make up`/`dev` are bring-up/recovery only). App train = **GHCR library only**. |
| 7 | **Auth rollout runs alongside** Swarm; affinity widens as claims exist. |
| 8 | Lock behaviour during tenant moves factored with **doc-lock corp/alliance** work. |
| 9 | JetStream retention/replay under #20 (filters ≠ storage; define MaxAge / new-only). |
| 10 | **Hard cutover** to hybrid Swarm (this branch) first; deepen afterward - not a multi-PR phase-0-only deliverable. |
| 11 | `make dev` = build/run local same app; prod = same images + live secrets/config. |
| 12 | Multi-node / K8s / multi-DB / replacing NATS remain **out of scope**. |
| 13 | **WS placement default = Redis tenant->slot via Swarm ws-router (#4)** - Traefik terminates `/ws` to the router only. Sticky is fallback (missing cookie / Redis down). Traefik v3 cannot hash cookie values - do not block on native hash. **#21** cordon/evacuate is next (safe scale-in). See [WS_ROUTER.md](./WS_ROUTER.md). |
| 14 | **Changelog hot path:** no Redis; selective fan-out via JetStream filters (#20), one durable per slot. |
| 15 | **Phase 0 closed (2026-07-19)** - **#1** eip, **#2** identity, **#5** stack, Traefik swarm **basic**, **#24** minimal stack-deploy env expand, companion docs, **`eip_tenant_affinity` cookie**, **#3 inventory**. **Hard cutover branch** subsequently landed ws-router + Swarm Traefik (#4/#31). |
| 27 | **WS affinity cookie bridge** - App sets `eip_tenant_affinity=account:{id}` (format prefers alliance->corp->account). Key for Redis placement via ws-router; Traefik sticky `eip_ws_affinity` is router fallback only. |
| 28 | **ws-router on Swarm (replicas 1, start-first handover)** - not Compose in hybrid path. Occupancy balance metrics from websocket in-memory maps (#8), not a placement scout. |
| 16 | **Full testing + simulation track** (#25-#29): unit/integration, WS connection/affinity load sim, capacity-controller **dry-run** before armed Docker mutations, core failover tests, management ops drills. Weave into feature PRs; harnesses runnable via `make` / `make dev` where possible. |
| 17 | **Name it a capacity controller, not an “autoscaler.”** It owns replica counts, spare capacity, drain/remove, migrate targets, and optional pins - Swarm schedules; Traefik routes; the controller decides cluster shape (lightweight app control plane, not Kubernetes). |
| 18 | **Capacity controller is its own singleton Swarm container** (not inlined into core). Swap it like core: **lease-gated hot-swap from day one** (`start-first`; only lease holder mutates Docker). Stop-first gap is emergency-only, not the design target. |
| 19 | **Bring-up vs apply** - `make up`/`dev` create the world; `make swarm-sync`/`rebuild` mutate it. **`stack-deploy`** is an internal primitive — day-2 operator verb is **`make swarm-sync`**. |
| 20 | **Bring-up** — prefer **`eip up` / `eip dev`** (data → Ready/`EnsureS3`‖`EnsureMongo` → app). Make `up`/`dev` remain legacy. Data fragment owns mongo/redis/nats/SeaweedFS/Prometheus; app fragment owns Traefik + api/websocket/worker/ws-router/core/frontend. See [ENGINEERING.md](../admintool/ENGINEERING.md), [MAKE.md](./MAKE.md). |
| 36 | **Frontend on Swarm (#16) done** — stack service + bake/train; runtime via `x-frontend-public-env` (public knobs only; no docker secrets for FE). |
| 21 | **#31 done via Swarm Traefik + ingress** - no permanent `eip-edge` nginx. No Compose Traefik / Compose-elastic escape hatch - recover with make up / make dev. |
| 22 | **Public UX hides hybrid** - teach make + config files; NETWORK/STACK are implementer docs. |
| 23 | **Same make experience on Windows, Linux, and macOS** - bash scripts via Makefile `$(BASH)` / Git Bash on Windows; no OS-specific public command set. |
| 24 | **Observability is an optional addon** (default **off**). Toggle only in operator config (#34). **No separate metrics toggle.** Toggle mechanics = omit the Compose observability fragment. |
| 25 | **Prometheus is on the Swarm data fragment** (`docker-stack.data.yml` with SeaweedFS) — **not** in the observability fragment / #34 toggle. Lands ahead of the capacity controller so #18 can query it. Addon is Grafana/Loki/Alloy/exporters/asynqmon UI only. |
| 26 | **Apps must run correctly with observability off** (no hard Alloy/Grafana/Loki/exporter dependency for core behaviour). |
| 30 | **WS place mid-wave** - `preferNewestSlots` on eligible backends; reassign sticky off older bake; affinity key / pin / cordon / full still apply. Exact client bake match filter removed. |
| 31 | **`APP_VERSION` SoT is `.env`** (non-secret). `eip.config` capacity/ports/paths bridges are **ephemeral sync-env** at expand/swarm-sync (no durable `.eip-sync.env`). Local Swarm tags are per-role `${APP_VERSION}-<timestamp>` via bake + `.eip-local-build.env` + `docker-stack.dev.yml` (no `stack-force-local`). |
| 32 | **Core is single-primary** — Redis `lease:core:primary` + Swarm `start-first` health gate; `/ready` = handoff-ready standby (not lease holder). Changestream resume tokens in Redis (`eip:core:handoff:v1:`). Multi-active scheduler/changestream and peer-HTTP handoff on `:19100` are **rejected**. See [CORE_REBUILD.md](./CORE_REBUILD.md). |


When an item above is explored, link the resulting note from the related backlog id and keep this roadmap as the index.
)
