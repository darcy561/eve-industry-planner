# #8 — Websocket rollout, affinity reconnect, and drain

**Roadmap:** [../roadmap.md](../roadmap.md) `#8`  
**Status (mirror):** **done** for #8 product + promote (2026-08-04) — drain slice, soak (`cmd/ws_soak`), live SoT promoted from [`../promote/`](../promote/README.md). Evacuate CLI → #21/#18. **Locked:** no Redis mirror of hosted tenants.

**Not live SoT.** On overlap with live docs, this overlay wins until promote.

**Rules:** Read and following [`../../documentation-rules.md`](../../documentation-rules.md) and [`../../technical-rules.md`](../../technical-rules.md) (migration-plans). Design accepted — implement from checklist below; promote live SoT only with go-ahead after code lands.

Live today: [websocket.md](../../../backend/websocket/websocket.md), [ws-router.md](../../../backend/ws-router/ws-router.md). Stack roll knobs: [`docker-stack.yml`](../../../../docker-stack.yml) `x-app-deploy` / `x-app-stop-grace`.

---

## What changed

### Landed this slice (2026-08-04) — lifecycle + watchers + SIGTERM drain + soft divert

| Claim | Code |
|-------|------|
| App holds `*Server`; cleanups call `DrainForRoll` then `Shutdown(ctx)` **before** HTTP/probes/deps | `services/websocket/app.go` |
| `Shutdown(ctx)` closes `shutdownChan`, stops sync pool, **honours cleanup ctx** | `server/shutdown.go` |
| Process `shutdownTimeout` = **60s** (matches `x-app-stop-grace`) | `app.go` |
| Removed unused `sessionConnections` map | `server/types.go` |
| `NewServer` starts cordon drain + slot-full maintainer | `server/server.go` |
| Cordon watcher cancels via `contextUntilShutdown` | `drain.go`, `shutdown.go` |
| Full + soft flag SET/DEL on connect/disconnect + 30s maintainer | `handler.go`, `reader.go`, `slot_flags.go` |
| Local `draining` flag; Ready fails with `draining` | `drain.go`, `app.go` (`startServer` before `startProbes`) |
| Upgrade refuse **503**: `draining` / `cordoned` / `at_cutoff` | `handler.go` |
| SIGTERM path: `ForceCloseLocalClients(action=roll, via=sigterm)` + wait Clients empty or cleanup ctx | `drain.go` |
| Force-close is close-first (fast empty); `please_reconnect` best-effort via Send; wait re-kicks late joiners | `drain.go`, `writer.go` (`writeFrame`) |
| Soft divert: `target_clients` → `WS_SLOT_TARGET_CLIENTS` → `eip:ws:soft:v1`; router prefer-non-soft | config apply, `wsplacement.SoftPrefix`, `ws-router` |
| Validate `target_clients` ≥ 0; when both > 0 require ≤ `client_cutoff` | `deployment-tool/internal/config` |
| Hosted-tenant query view over `userConnections` / `corpToClients` / `allianceToClients` | `hosted_tenants.go`, `wsplacement` tenant keys — **in-process only; no Redis write (locked)** |

**Removed (not #8 scope):** Redis advertised-version WS fan-out + shared SET/PUBLISH helpers — deleted 2026-08-04. Marked removed on roadmap **#23**. Version surfaces remain bake / `app-config` / `connected.app_version` ([verbs.md](../../../deployment/deployment-tool/cli/verbs.md)). FE still listens for `{type: app_version}` — Follow-ups § frontend realtime polish (not this ticket).

### Live in process (ops / placement)

| Claim | Code |
|-------|------|
| Cordon key + drain PUBLISH → `ForceCloseLocalClients` | `server/drain.go` (watcher started) |
| Startup EXISTS → force-close once | `runCordonDrainWatcher` |
| Force-close only when own cordon key still present | `trigger` / `isOwnSlotCordoned` |
| Client cutoff → SET/DEL `eip:ws:full:v1:{slot}` | `server/slot_flags.go` |
| Soft divert → SET/DEL `eip:ws:soft:v1:{slot}` | `server/slot_flags.go` |
| ws-router eligible = Docker `running` ∩ `/ready` 200 ∩ not cordon ∩ not full (soft **not** a skip) | `ws-router/…` |
| Session handoff `ws:session_handoff:v1:…` | `server/session_resume.go` |

**Process refuses (landed):** cordon + `client_cutoff` + local draining — all **503** in `handler.go`. Soft does **not** refuse.

### Stack — stop grace (YAML landed; document here)

**Decision:** every service that uses start-first rolls (`x-app-deploy`) also merges service-level **`stop_grace_period: 60s`** via `x-app-stop-grace` (same budget as core used alone).

| Piece | Value |
|-------|--------|
| Anchor | `x-app-stop-grace` → `stop_grace_period: 60s` |
| Consumers | traefik, api, websocket, ws-router, worker, core, frontend |
| Not applied | `x-proxy-deploy` socket proxies (stop-first, short-lived) |

Compose puts grace **outside** `deploy:` — hence a separate service-root merge, not inside `x-app-deploy`.

**YAML status:** already in [`docker-stack.yml`](../../../../docker-stack.yml). **Websocket process:** `shutdownTimeout` / cleanup ctx budget = **60s** (aligned); SIGTERM kick + empty-or-deadline wait share that budget with `Shutdown`. Other start-first services may still use shorter in-process timers (sanity in implement plan step 8).

### Accepted — SIGTERM drain (landed)

Goal: Swarm rolls / task stop drain clients without requiring Redis cordon/pubsub for that path.

On websocket **SIGTERM** (Docker stop / start-first replace of the old task):

1. **Not-ready** — fail `:19100/ready` immediately (same `ReadyCheck` used by probes; NATS census bus would see the same once enabled).
2. **Refuse new upgrades** on that process (local flag; no Redis).
3. **Force-close** local sockets — reuse `ForceCloseLocalClients` (`please_reconnect` + 1001).
4. **Wait** within the remaining stop-grace budget for close/handoff work, then exit cleanly.

ws-router already drops non-ready backends on probe refresh → new `/ws` goes to other slots. SPA reconnects on non-manual close.

```text
Swarm start-first roll
  NEW task up (ready)
  OLD task SIGTERM
    → /ready 503 + refuse upgrades + ForceCloseLocalClients
    → clients reconnect → router places on eligible (prefer NEW)
    → OLD exits before stop_grace (60s) elapses
```

### Accepted — soft divert at `target_clients` (landed)

**Intent:** when a slot is “getting full,” slow **growth** of new homes; do **not** kick or hard-refuse (that stays at `client_cutoff`). Org Redis stickiness wins over soft.

| Piece | Design |
|-------|--------|
| Config SoT | `eip.config.yaml` → `services.websocket.target_clients` (TUI Settings / Websocket). `0` = soft divert off. **Not** a stack-YAML literal as operator SoT — same family as `client_cutoff` |
| Apply | **`eip sync`** (and bring-up expand) sets task env `WS_SLOT_TARGET_CLIENTS` — mirror cutoff’s apply path in config/sync. Stack may keep a bootstrap default only if expand needs a placeholder; live value is config |
| Redis | New key `eip:ws:soft:v1:{slot}` in `wsplacement` (same TTL refresh pattern as `eip:ws:full:v1`) |
| Websocket | Same **connected-client counter** as full hint. ≥ target (and target > 0) → SET soft; under → DEL. Drift of a few connections is fine |
| Process | **No** upgrade refuse at target — only at cutoff / cordon / draining |
| Validate | If both > 0: require `target_clients` ≤ `client_cutoff` |

**Router rule (locked) — soft is not full:**

1. Build eligible as today: ready ∩ not cordon ∩ not full; then prefer-newest bake. Soft does **not** remove a slot from eligible.
2. **Pin** (if eligible) → honor; **ignores soft**, but **does not ignore max** — pin only when slot is eligible (not cordoned, not full). Full/cutoff still blocks pin.
3. **Place hit** and home still in preferred (eligible + newest) → **stick**, even if soft. Soft must not reassign them away.
4. **Miss / reassign / first pick** → among preferred, **prefer non-soft**; if every preferred slot is soft, pick among all preferred.
5. Sticky-cookie fallback uses the same prefer-non-soft list when picking.

```text
connected < target              → neither soft nor full
target ≤ connected < cutoff     → soft marked; place/pin stick; new homes divert if a non-soft exists
connected ≥ cutoff              → full (hard-skip + reassign off) + process refuse; pin ignored
```

Move a corp on purpose → SET **place** (and optional **pin**); soft does not block that. `reserve_capacity` stays policy-only for #18.

### Implementation locks (this slice)

| Topic | Lock |
|-------|------|
| Refuse response | HTTP **503** + clear reason (draining / cordoned / at_cutoff) — same class as other upgrade refuses |
| Counter | One connected-client count for soft hint, full hint, and cutoff refuse. Not exact; small drift OK |
| `target_clients` home | **Operator config** (`eip.config.yaml` / sync), not a stack-file operator knob |
| Probe lag on SIGTERM | Upgrade refuse on draining task → connection **fails** (no WS open). SPA **reconnects with backoff** (`realtimeClient`); next attempt goes through router again (often lands on NEW). Not a silent proxy move |
| Pin vs soft vs max | Pin ignores **soft**; pin does **not** ignore **full/cordon** (must stay eligible) |

---

## How this part works after the change

### Rolls (`eip update` / Swarm update, start-first)

1. Replacement websocket task becomes probe-ready.
2. Old task receives SIGTERM → not-ready + kick (no Redis cordon required).
3. Router stops offering the dying slot; clients land on remaining/new slots.
4. Docker SIGKILL only if the process outlives **60s** grace.

### Intentional evacuate / scale-down (ops — still Redis for pre-stop)

When you need “don’t place here” **while the task is still running and ready** (evacuate before shrink):

1. SET cordon + PUBLISH drain (existing path) **or** future #18 NATS notify.
2. Wait within operator `drain_timeout` for reconnects.
3. Then scale / stop the cold slot (SIGTERM path above as the last mile).

SIGTERM path does **not** replace pre-stop cordon for careful alliance-home evacuates.

### What Redis is / is not for

| Concern | Redis? |
|---------|--------|
| Placement map, pin, full hint, **soft hint**, session handoff | Yes |
| Pre-stop ops cordon / evacuate notify | Yes today; #18 may move notify to NATS |
| SIGTERM roll drain (not-ready + kick) | **No** — local process only |

### NATS health census

`orchestrationprobes.StartBus` remains **Enabled=false** until #18. Same `Ready` callback as HTTP `/ready`. Not used by ws-router for placement (router uses HTTP probe).

---

## Implement plan (design accepted — do in order)

**Done already:** `x-app-stop-grace` 60s on start-first services in [`docker-stack.yml`](../../../../docker-stack.yml).

| # | Work | Notes |
|---|------|--------|
| 0 | Wire cordon + full watchers; sync full on connect/disconnect; shutdown-aware cordon loop | **Done** (Redis version advertiser **removed**, not wired) |
| 1 | Websocket draining flag + ReadyCheck | **Done** — `IsDraining` in Ready |
| 2 | Refuse upgrades **503** + reason | **Done** — `draining` / `cordoned` / `at_cutoff` |
| 3 | SIGTERM → `ForceCloseLocalClients` + wait ≤ **60s** | **Done** — `DrainForRoll` + shared cleanup budget |
| 4 | Soft divert | **Done** — config/sync/stack env + Redis soft + router prefer-non-soft |
| 5 | wsplacement + router tests | **Done** — `preferNonSoftSlots` / all-soft fallback (`router_test.go`) |
| 6 | Websocket unit tests | **Done** — see **Testing (in-flight)** unit table |
| 6b | Websocket integration suite | **Done** — 21 scenarios via `newIntegFixture`; inventory in **Testing (in-flight)**; live testing topic unchanged until promote |
| 7 | Stale comments | Cutoff “soft”→hard **done**; TUI help updated for soft divert |
| 8 | Smoke other start-first shutdown timers | Websocket budget aligned; others sanity only |
| 9 | Promote (go-ahead) | **Done** 2026-08-04 — live files replaced from [../promote/](../promote/README.md) |

**Limits (promote wording):**

| Knob | Role |
|------|------|
| `target_clients` / `WS_SLOT_TARGET_CLIENTS` | **Soft divert** — config SoT; Redis soft hint; **place/pin stick**; new pick prefers non-soft; **no** process refuse. `0` = off |
| `client_cutoff` / `WS_SLOT_CLIENT_CUTOFF` | **Hard** — Redis full + process refuse **503**. `0` = unlimited |
| `reserve_capacity` | Still #18 scale-up policy only (not this slice) |

### Still open on #8 (after this slice)

- none for #8 SoT (promoted 2026-08-04). Armed evacuate CLI → #21 / #18. Optional gauges / mid-soak roll polish.

**Hosted-tenant (done for #8 — do not re-open as Redis work):** local `HostedTenants` / `HostsTenant` query view only. **Rejected:** Redis SET of `account:` / `corporation:` / `alliance:` hosting keys. Cross-replica discovery for capacity / selective fan-out is **#20 / #18** via **NATS census and/or internal API** (see roadmap #8 lock + #20).

FE `please_reconnect` / dead `{type: app_version}` handler tidy lives under roadmap **Follow-ups § frontend realtime polish** — not this ticket.

---

## Testing (in-flight)

**Project SoT for websocket test depth while #8 is open.** Verified against code 2026-08-04 (`go test ./websocket/... ./ws-router/ ./shared/wsplacement/` green).

Live [`testing/services/websocket.md`](../../../testing/services/websocket.md) refreshed with #2 promote (NATS placement / soak). Historical Redis advertised-version fanout tests remain deleted (#23).

### Entrypoints

| Check | Command (from `services/`) | Notes |
|-------|----------------------------|--------|
| Websocket tree | `go test ./websocket/...` | No Docker |
| Server package | `go test ./websocket/server/` | Unit + Integration in same package |
| Integration only | `go test ./websocket/server/ -count=1 -run Integration` | 11 tests; all via `newIntegFixture` |
| Related (this slice) | `go test ./ws-router/ ./shared/wsplacement/` | Soft prefer + tenant keys |
| Live soak (ops) | `go build -o ../.tmp/ws_soak ./cmd/ws_soak` then docker-run on `eip-core` (see below) | Not CI; needs stack up |

### Live soak harness (`cmd/ws_soak`)

Operator evidence tool. Seeds Redis planner sessions, holds `/ws` clients (default via `ws-router:8080`), reconnects on `please_reconnect` / close, reports sticky-slot + Redis `soft` / `full` / `place` keys.

**Profiles**

| Profile | Purpose | Default clients |
|---------|---------|-----------------|
| `hold` (default) | Drain / reconnect endurance — does **not** hit prod soft/hard (1500/2000) | 50 |
| `limits` | Soft + hard pressure + divert asserts against lowered thresholds | fill=`cutoff` on one corp key; then mixed account/corp/alliance keys (place miss) assert off-soft / not-on-full via Redis place |

```bash
# from services/, stack up (eip up / eip dev)
go build -o ../.tmp/ws_soak ./cmd/ws_soak

# hold — roll/cordon mid-run for please_reconnect evidence
docker run --rm --network eip-core --env-file ../.env \
  -e REDIS_HOST=redis -e REDIS_PORT=6379 \
  -v "$PWD/../.tmp/ws_soak:/ws_soak:ro" --entrypoint /ws_soak alpine:3.20 \
  -profile hold -ws-url ws://ws-router:8080/ws -clients 50 -duration 5m

# limits — FIRST lower thresholds in eip.config.yaml and eip sync, e.g.:
#   services.websocket.target_clients: 20
#   services.websocket.client_cutoff: 40
docker run --rm --network eip-core --env-file ../.env \
  -e REDIS_HOST=redis -e REDIS_PORT=6379 \
  -v "$PWD/../.tmp/ws_soak:/ws_soak:ro" --entrypoint /ws_soak alpine:3.20 \
  -profile limits -expect-target 20 -expect-cutoff 40 -duration 2m
```

`limits` phases: (1) fill shared corp to target → soft via NATS (2) mixed new keys → assert ≥`-min-divert-ratio` place **off** soft (3) fill to cutoff → full via NATS (4) mixed keys → assert **none** place on full. Place observation uses `connected.container_id` (#2). Needs ≥2 websocket replicas. Fails if soft/full never appear or divert ratio fails. Use `-require-503` with direct websocket `-ws-url` for process refuse. Knobs: `-soft-divert`, `-full-probe`, `-corp` (fill corp id), `-min-divert-ratio`. Restore prod thresholds after. Unit helpers: `go test ./cmd/ws_soak/`. Broader affinity sims → **#26**.

### Harness SoT

| Piece | Path / API |
|-------|------------|
| Sole Integration entry | `server/integration_harness_test.go` → `newIntegFixture` |
| Surface | httptest `/ws`, `/ready`, `/healthy` |
| Deps | miniredis; NATS/Mongo Ready as injectable flags (not live processes) |
| Helpers | Env defaults in fixture (`instance` + cutoff/target=0); `setSlotLimits` override; `seedSession`, `connectAccount`, `dial` / `dialRefuse`, `writeJSON`, `readJSONMessage` / `readJSONOfType`, `waitClients`, Redis wait/assert, `register` / placement sync |
| Scenarios | Thin `integration_*.go` only — no second Server construction |

### Integration scenarios (`-run Integration`) — 21

| Test | Asserts |
|------|---------|
| `TestIntegrationConnectReceivesConnected` | Seeded session → HandleWS → `connected` JSON; hosts `account:`; disconnect clears |
| `TestIntegrationConnectMissingSessionUnauthorized` | Dial refuse → **401** |
| `TestIntegrationConnectRefusedWhileDraining` | `draining` → dial refuse **503** + body |
| `TestIntegrationConnectRefusedWhileCordoned` | Redis cordon key → dial refuse **503** `cordoned` |
| `TestIntegrationReadyHealthyWhenDepsOK` | `/healthy` + `/ready` → **200** OK |
| `TestIntegrationReadyFailsWhenDraining` | `/ready` **503** NOT_READY; `/healthy` still OK |
| `TestIntegrationReadyFailsWhenRedisUnavailable` | `f.Redis = nil` → `/ready` **503** |
| `TestIntegrationReadyFailsWhenNATSOrMongoFlaggedDown` | Flag deps down/up → Ready tracks |
| `TestIntegrationSoftHintDoesNotRefuseUpgrade` | Soft Redis set at target; real dial still gets `connected` |
| `TestIntegrationCutoffRefusesWhileSoftAlsoSet` | Soft+full set; dial refuse **503** `at_cutoff` |
| `TestIntegrationHostedTenantsWithSoftFullLifecycle` | Register + org scopes → 3 tenant keys + soft; unregister clears |
| `TestIntegrationDrainForRollClosesLiveSocket` | Live dial → `please_reconnect` (`action=roll`,`via=sigterm`) → read error + Clients empty |
| `TestIntegrationUpgradeScopesAckAndHosted` | `upgrade_scopes` → `scopes_ack`; hosts corp/alliance |
| `TestIntegrationSessionResumeRestoresScopes` | Disconnect handoff → reconnect `session_resume` → `resume_ack` + scopes |
| `TestIntegrationDocLockWaitlistPulseSetsRedis` | Invalid pulse no Redis key; valid pulse SET |
| `TestIntegrationDocLockViewerArrivedAndDeparted` | Viewer ZSET add then remove |
| `TestIntegrationDocLockLockStateBatchAckOK` | Ack `ok` + `jobResults` |
| `TestIntegrationDocLockLockStateBatchAckEmpty` | Ack `ok=false` empty error |
| `TestIntegrationDocLockLockStateBatchAckTooMany` | Ack `ok=false` too-many error |
| `TestIntegrationDocLockLockStateBatchMissingRequestID` | No ack; later valid batch still works |
| `TestIntegrationDocLockFanoutBroadcastsToAccount` | Wire + `broadcastRawToAccount` → both tabs get `document_lock` |

ReadyCheck shape mirrors `websocket/app.go` **inside the fixture** — `app.go` / `main.go` themselves are not under test.

### Unit coverage landed / extended this slice (`server/`, `server/config/`)

| File | Covers |
|------|--------|
| `drain_test.go` | `DrainForRoll`; ForceClose/explain; cordon parse/subscribe/own-slot; HandleWS refuse draining/cordoned/at_cutoff |
| `slot_flags_test.go` | soft + full Redis SET/DEL; `contextUntilShutdown` |
| `shutdown_test.go` | Shutdown closes chan, idempotent, cancelled ctx |
| `hosted_tenants_test.go` | Account via `userConnections`; corp/alliance indexes + refcount |
| `config/constants_test.go` | `client_cutoff` + `target_clients` defaults/off/at-threshold |
| `doclocklogic/` | Parse presence/batch; ack marshal; WaitlistPulse; batch empty/ok/too-many/nil redis |

### Pre-existing websocket units (unchanged this slice; still run in tree)

| Area | Covers |
|------|--------|
| `subscribe_auth_test.go` | Singleton account docs; unknown collection denied; jobs need Mongo |
| `outgoinglogic/` | Suppress self-recipient; decode scopes; alliance/corp downward match |
| `natslogic/` | Document-lock wire; fanout consumer inactive-threshold |

### Related packages (implement plan #5 / hosted keys)

| Package | Covers (relevant to #8) |
|---------|-------------------------|
| `ws-router` | `preferNonSoftSlots` + all-soft fallback; eligible ignores soft; still drops cordon/full |
| `shared/wsplacement` | `TenantKey*` / prefix helpers (`tenant_test.go`) |
| `deployment-tool/internal/config` | `target_clients` validate (≥0; ≤ cutoff when both >0) + apply → `WS_SLOT_TARGET_CLIENTS` |

### Gaps vs landed behaviour (honest)

| Landed claim | Test depth |
|--------------|------------|
| Soft does not refuse | Integration dial at soft **yes**; unit soft SET/DEL **yes** |
| Cutoff / cordon / draining refuse | Unit + Integration dial for draining / cutoff / cordon **yes** |
| SIGTERM ForceClose + empty wait | Integration: `please_reconnect` + close + empty **yes**; unit re-kick **yes** |
| App Ready wiring order (`startServer` before probes) | Fixture Ready only — **not** `app.go` |
| Soft router prefer | `ws-router` unit **yes** — not cross-process with websocket |
| Hosted-tenant Redis interest | **Rejected** — local query view only; census/API is #20 / #18 |
| Doc-lock WS + fanout delivery | Integration pulse/viewer/batch + `broadcastRawToAccount` **yes**; JetStream subscribe→loop **no** |
| Session resume / scope upgrade over wire | Integration **yes** |
| Swarm multi-replica roll smoke | **ops:** `cmd/ws_soak` (manual mid-soak roll) |

### Still thin / later

- `nats_doc_lock` JetStream subscribe loop in fixture (delivery half covered)
- Real NATS/Mongo Ready (fixture flags only today)
- Cross-package `resolveSlot` with live soft/full keys
- Recorded soak evidence + gauges polish; #26 co-location asserts

---

## Missing live SoT discovered mid-work

**Promote drafts assembled** (current-behaviour only; copy on go-ahead): [../promote/README.md](../promote/README.md)

| Draft | Live target |
|-------|-------------|
| [../promote/backend/websocket/websocket.md](../promote/backend/websocket/websocket.md) | `backend/websocket/websocket.md` |
| [../promote/backend/ws-router/ws-router.md](../promote/backend/ws-router/ws-router.md) | `backend/ws-router/ws-router.md` |
| [../promote/stack/config.md](../promote/stack/config.md) | `stack/config.md` (`target_clients` sync) |
| [../promote/stack/stack.md](../promote/stack/stack.md) | `stack/stack.md` (`x-app-stop-grace` 60s) |
| [../promote/testing/services/websocket.md](../promote/testing/services/websocket.md) | `testing/services/websocket.md` |

**Promoted 2026-08-04** into live paths listed above. Drafts under `promote/` remain as the promote snapshot.

---

## Notes / decisions

0. **Testing depth for this slice stays in this overlay** until promote — do not edit live `testing/services/*.md` mid-project (restored 2026-08-04 after mistaken live edits).
0b. **Server package file tidy (2026-08-04):** `slot_flags.go` (was soft+full); `logging.go` (upgrade/op/fanout logs); `doc_lock_logging.go`; `upgrader`→`handler.go`; `writeFrame`→`writer.go`.
0c. **Doc-lock adapter peel (2026-08-04):** pure `server/doclocklogic` (parse / presence / batch / ack + wire type SoT); thin WS handlers in `doc_lock_ws.go`; NATS in `nats_doc_lock.go`. Domain SoT: `shared/core/documentlock` (keys, failure classes, StatusBatch). Viewer WS matches domain best-effort (no Stack-nil refuse). HTTP document-locks uses same failure-class constants.
0d. **Drain consolidate (2026-08-04):** one `drain.go` — `upgradeBlockReason` / `rejectUpgradeBlocked` (refuse SoT), `kickAndWait(signalFn)` (shared kick; cordon refreshes active signal), `ForceCloseLocalClients`. SIGTERM sets `draining` and owns stop wait; cordon watcher skips wait when draining; re-kicks while cordon key holds. HandleWS: draining → session → Redis → block reason (incl. post-auth); post-Upgrade uses block reason without cutoff.
0e. **Hosted-tenant Redis rejected (2026-08-04):** #8 query view is enough locally. Do not invent Redis hosted-tenant interest keys. #20 filter updates use the local view; #18 / #20 cross-replica census uses NATS and/or internal API.
0f. **ForceClose please_reconnect (2026-08-04):** sync `writeFrame` before `Close` so the explain frame is on the wire under stop grace (Send-queue raced Close). Integration asserts `action=roll` / `via=sigterm`.
0g. **Soak tool (2026-08-04):** `services/cmd/ws_soak` — `-profile hold` (drain/reconnect) and `-profile limits` (fill corp → soft; mixed account/corp/alliance keys assert soft divert; fill → full; mixed keys assert not-on-full). Run on `eip-core` against `ws-router`. Does not replace Integration; ops evidence for #8 / feeds #26.
1. **SIGTERM = local drain signal for rolls.** Prefer this over inventing a second Redis publish on every Swarm stop.
2. **Keep Redis cordon for pre-stop ops.** Router eligibility needs an explicit skip while the task can still be `/ready` 200.
3. **60s stop grace is the app start-first standard** (`x-app-stop-grace`). Same number as former core-only grace.
4. **YAML grace + process budget aligned (60s).** Drain kick + wait + sync-pool stop share one cleanup fn under that budget.
5. **Optional later:** router retry another backend on dial/502 (race before probe refresh). Not required for v1 of this slice if not-ready + refuse-upgrade are prompt.
6. **Rejected for this slice:** using NATS census as the router placement signal (wrong consumer; bus still off). Using SIGTERM alone as the only evacuate tool (too late for pre-stop placement skip). Soft divert must not hard-skip (would collapse to cutoff).
7. **Soft divert in this slice** — Redis soft hint; stick on place/pin; prefer non-soft only when assigning/reassigning. Not a hard skip (unlike full). `reserve_capacity` stays for #18.
8. **Design accepted 2026-08-03** — implement plan above; refuse 503; config SoT for `target_clients`; pin ignores soft not max; SPA reconnects on refused upgrade.
