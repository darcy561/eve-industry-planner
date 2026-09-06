# Maintenance mode — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Maintenance mode currently parks the SPA behind a banner and refuses API requests. Everything else on
the stack carries on: WebSockets connect and stay connected, clients keep mutating documents through
the realtime path, and core keeps publishing cron work to the worker. This project makes maintenance
a state the whole stack observes:

- **ws-router** refuses `/ws` upgrades.
- **websocket** refuses upgrades and closes the sessions already open.
- **core** stops publishing scheduled cron tasks, so nothing new starts during the window.
- The flag becomes **runtime state an operator toggles without a redeploy**, so entering and leaving
  maintenance no longer restarts the services it governs.

The point of the window is that the stack is still while an operator runs release work against it.
Redeploying four services to enter it, and four again to leave, defeats that.

## Starting position

`MAINTENANCE_MODE` already reaches the Go services and is further along than "frontend only".

| Surface | Today |
|---------|-------|
| `shared/appconfig` | `MaintenanceModeEnabled()` parses `MAINTENANCE_MODE` (`1/true/yes/on`, case-insensitive; empty or unknown is false) |
| `api` | `middleware.MaintenanceModeConstructor` returns 503 `{"error":"maintenance_mode"}` for everything except `/health`, `/healthy`, `/ready`, `/api/v1/app-config` |
| `api` app-config | `maintenance_mode` in the `/api/v1/app-config` body, read from the env per request |
| `core` | An OTel gauge reports the env value alongside the feature flags |
| SPA | `App.jsx` swaps `<Outlet/>` for `<MaintenanceMode/>` on the app-config value |
| `websocket`, `ws-router`, core scheduler | **No gate at all** |
| Stack | `MAINTENANCE_MODE` is in the `x-app-public-env` anchor, so `api`, `websocket`, `worker` and `core` receive it. **`ws-router` does not** — its environment block carries NATS, logging and OTel only |
| Deployment Tool | `EnvFields` describes it as "API maintenance mode when true-ish" |

The SPA does not carry the flag in its bundle: `x-frontend-public-env` has no such key, so the banner
is a runtime read of app-config and the frontend container is unaffected by a toggle. Note the
cadence, because it matters at Stage G: `App.jsx` asks for app-config on mount and then only on the
30-minute version-check timer, so an open tab can sit on a stale value for half an hour.

### `go fix` — in-scope debt to clear first

Run against the packages this plan touches, before the feature work (migration-plans
[`technical-rules.md`](../technical-rules.md)). Two hits, both in packages a later stage edits:

| Package | Fix |
|---------|-----|
| `api/middleware` (`types.go`) | `slices.Backward` in place of the reverse index loop in `Chain` |
| `core/metrics/appconfig` (`gauge.go`) | `any` in place of `interface{}` in `featureFlagAsFloat` |

`shared/appconfig`, `ws-router`, `websocket/server` and `core/scheduler` report an empty diff. Land
these two with Stage B and Stage E respectively, in those packages only.

## Decision — the flag becomes runtime state

An environment variable is a boot-time value. Changing it means editing `.env` and re-syncing, which
redeploys every service carrying it — so entering maintenance restarts `api`, `websocket`, `worker`,
`core` and (once it carries the env) `ws-router`, and leaving it restarts them again. Three
consequences decided this:

- The stack churns hardest at exactly the moment the window exists to keep it still.
- "Close live sessions on entry" has no honest implementation: the restart *is* the disconnect, and
  the client cannot tell it from a network blip.
- The API rolls while tabs are polling it to ask whether maintenance is on.

**Decision:** Redis holds the flag and is the source of truth. `MAINTENANCE_MODE` becomes the boot
seed for a database that has never held the key. An operator toggles it through a core task under the
existing `eip cli` surface, and a NATS topic tells every service the moment it changed.

The alternative — keep the env and accept the redeploys — was considered and rejected on the above.
It is smaller by roughly one shared package and one operator command, and it is the fallback if the
Redis path proves unstable in the window it is meant to protect.

### Redis is the source of truth, and it can be missing

Two rules, both worth a test:

- **Seeding is once per database, not once per boot.** The key is written from `MAINTENANCE_MODE`
  only when absent. A service restarting mid-window must not re-read its env and quietly take the
  stack out of maintenance. If the key is genuinely gone (a flushed Redis), re-seeding from the env
  is correct.
- **A read failure holds the last known value.** A Redis outage must not flap the stack out of
  maintenance. Services cache what they last saw and keep it; a process with no cached value yet
  falls back to its env seed.

### ws-router holds a boolean, not a client

`ws-router` has NATS but no Redis and no `REDIS_PASSWORD` in its secret list. Giving it Redis means a
new secret attach and a wider blast radius for a service whose entire need is one boolean. It takes
the state over NATS instead: the env seed at boot, a subscription for changes, and a request/reply
ask for the current value on start and on every NATS reconnect. `topics.go` already has both shapes —
`PublishPlacementState` / `SubscribePlacementState` for the broadcast and `gather` for the ask.

### Probes are never gated

`ws-router` and the other services answer orchestration probes on port 19100. Traefik's loadbalancer
healthcheck and the Swarm container healthcheck both hit `/ready` there. Failing them during
maintenance would get tasks pulled from the router and restarted by Swarm — the opposite of a still
stack. The gates sit on the traffic paths only; probes answer normally throughout.

### What stays reachable

| Reachable during maintenance | Why |
|------------------------------|-----|
| `/health`, `/healthy`, `/ready` (all services) | Orchestration and edge health, as above |
| `/api/v1/app-config` | The SPA reads the banner state, and its recovery poll, from here |
| `eip cli` core commands | Release work is what the window is for |
| Core singleton jobs and the changestream watcher | Not cron publishing; parking them buys nothing and complicates recovery |

## Phases

Phase 1 is this folder. Later stages run only after that gate.

Stage A gates every other stage. Stage F should follow immediately so the rest can be exercised by
hand rather than by editing Redis.

### Stage A — The runtime flag

`shared/appconfig` grows a runtime state type beside the existing env reader: read the flag, set it,
subscribe to changes, and seed a key that is absent. Redis key `appconfig:maintenance_mode`, flat
prefix in the style already used by `shared/core/documentlock` and `shared/esiclient`. The change
broadcast is a new topic pair in `shared/nats/topics.go` next to the placement-state pair, with a
request/reply ask for current state so a late or reconnecting subscriber can catch up.

Consumers that hold Redis read through a short in-process cache; the broadcast is what drives active
behaviour such as Stage C's force-close. `MaintenanceModeEnabled()` stays as the seed reader and
keeps its truthy parsing — one place decides what "true-ish" means.

Tests: precedence (Redis wins, env is only a seed), the once-per-database seed rule, the
hold-last-known behaviour on a Redis error, and subscriber delivery.

Wire compatibility: additive. New Redis key, new NATS subject; nothing existing changes shape.

### Stage B — API reads the runtime flag

`middleware/maintenance.go` and `v1endpoints/appConfig.go` read the runtime flag instead of the env,
so maintenance starts and ends without an API redeploy and the SPA banner tracks the live value. The
bypass path list is unchanged.

`api/helper/maintenance.go` is a pure forwarder to `shared/appconfig`. It goes, and the middleware
calls the shared reader directly — master [`../../technical-rules.md`](../../technical-rules.md)
§ Package layout, no legacy wrappers.

Carries the `api/middleware` `go fix` item.

Tests: middleware blocks and bypasses against a fake flag source; app-config reports the runtime
value.

Wire compatibility: additive. `app_config.maintenance_mode` keeps its shape and only changes source.

### Stage C — WebSocket rejects and closes

`HandleWS` gains a maintenance branch in `upgradeBlockReason`, so rejection flows through the existing
`rejectUpgradeBlocked` path and inherits its reject metrics and log fields rather than growing a
second refusal shape.

On the flag turning true, open sessions are closed through `ForceCloseLocalClients` with a
maintenance action, and `drainExplainMessage` gains the matching wording.

#### Closing sessions is not draining the container

`DrainForRoll` deletes durables, stops intake, flushes outbound shards and stops workers, because the
container is going away. A maintenance container is not going away — it stays healthy, answers
probes, and must be ready to serve the moment the flag clears. Stage C uses the close-clients step
only. Reusing the whole drain path here would leave the container unable to resume without a restart.

Tests: an upgrade during maintenance is refused with the maintenance reason; flipping the flag closes
local clients; the container still answers `/ready`; clearing the flag lets a new upgrade through
without a restart.

Wire compatibility: additive, but client-visible — a new close action clients must not read as a
"please reconnect immediately" kick. Paired with Stage G.

### Stage D — ws-router rejects upgrades

A gate at the top of `handleProxy`, before `resolveBackend`, returning 503 for `/ws`. State arrives as
Stage A describes: `MAINTENANCE_MODE` added to the service's environment block in `docker-stack.yml`
as the boot seed, then NATS.

Tests: `/ws` refused while the flag is set, probe port unaffected, and state adopted from a broadcast
and from the reconnect ask.

Wire compatibility: additive, client-visible — a 503 on the upgrade path. Paired with Stage G.

### Stage E — Core stops publishing cron work

The gate goes inside the job function built by `scheduleCronJob`, so each fire logs and returns
without publishing. Jobs stay registered and scheduled: the scheduler's health component and metrics
keep describing what is actually configured, and nothing needs restarting to resume. The alternative
— not starting the scheduler in `StartUnderPrimary` — makes the primary and service-manager view of
what is running conditional on a flag, and was rejected for that.

The appconfig gauge reads the runtime flag so the metric matches the behaviour it names.

Untouched, deliberately: the changestream watcher, the singleton jobs (doc-lock expiry subscriber,
auth session maintenance), and the `eip cli` core commands. Work already queued in JetStream and
asynq drains normally — the gate stops new publishes, it does not empty a queue. An operator who
needs the queues empty has `tasks purgeWorkerQueues`.

Carries the `core/metrics/appconfig` `go fix` item.

Tests: a cron fire during maintenance publishes nothing and logs the skip; clearing the flag resumes
publishing on the next fire without a restart; the gauge follows the runtime flag.

### Stage F — The operator surface

A core command under the existing `eip cli` surface to turn maintenance on, turn it off, and report
its current state — `commands/cli`, alongside `sde_lock.go` and the other direct-action commands
rather than the task dispatch table, because this writes state rather than publishing a worker task.
No new host verb; master [`../../technical-rules.md`](../../technical-rules.md) § Host ops.

`EnvFields` help for `MAINTENANCE_MODE` is reworded: it is the boot seed for a database that has
never held the key, not the live switch.

Tests: the command sets, clears and reports; setting publishes the broadcast.

Wire compatibility: **behaviour change worth calling out** — after this stage, editing
`MAINTENANCE_MODE` in `.env` and re-syncing only sets a seed. The live value survives a redeploy, and
the CLI is the switch.

### Stage G — The SPA

Two changes, both consequences of earlier stages:

- Poll app-config on a short interval while `maintenance_mode` is true, so a parked tab recovers on
  its own instead of waiting on the 30-minute version-check timer.
- The realtime layer treats a 503 upgrade and the maintenance close action as *parked*: stop
  retrying on the normal reconnect schedule, and do not let it read as an auth failure that triggers
  ESI token refreshes.

Read the frontend rules pair before starting this stage.

## Done when

- ws-router and websocket both refuse `/ws` while maintenance is on, and probes stay green.
- Sessions open when maintenance starts are closed, and the SPA shows the banner rather than an error.
- Core publishes no cron work for the duration, and resumes without a restart.
- An operator turns maintenance on and off through `eip cli` with no service redeploy.
- A parked tab returns to the app by itself once maintenance clears.
- Tests ship with each stage; `go fix -diff` is empty on the packages each stage edited.

## Risks

| Risk | Handling |
|------|----------|
| Redis unavailable while it is the flag's SoT | Hold last known value (Stage A), explicit test. A read failure must never flap the stack out of maintenance |
| A redeploy mid-window re-seeds from the env and clears maintenance | Seed only when the key is absent (Stage A), explicit test |
| Gating a probe path pulls tasks out of the router or restarts them | Gates sit on traffic paths only; Stage C and D tests assert `/ready` still answers |
| SPA reads the maintenance close as a kick and reconnect-storms the router | Stage G lands with C and D, not after |
| Operator expects `.env` to still be the switch | Stage F rewords `EnvFields`; promote map carries it into live docs |

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — runtime flag in `shared` | Not started |
| B — API reads the runtime flag | Not started |
| C — WebSocket rejects and closes | Not started |
| D — ws-router rejects upgrades | Not started |
| E — core stops publishing cron work | Not started |
| F — operator surface | Not started |
| G — SPA parking and recovery | Not started |

## Recommended pickup order

A → F → B → E → D → C → G. Stage A gates everything; Stage F makes the flag operable so the later
gates can be exercised by hand. C and D are last of the backend stages because they are the
client-visible ones, and G lands with them.

## Promote map

| Overlay section | Live home |
|-----------------|-----------|
| Flag storage, seeding, broadcast, hold-last-known | `backend/shared/` topic doc |
| API gate and app-config source | `backend/api/` topic doc |
| Upgrade rejection and maintenance close | `backend/websocket/` topic doc |
| Router gate and its state source | `backend/ws-router/` topic doc |
| Scheduler gate and what keeps running | `backend/core/` topic doc |
| `MAINTENANCE_MODE` as a boot seed; the `ws-router` env row | `stack/` topic doc and the Deployment Tool env docs |
| The toggle command | `deployment/deployment-tool/cli/` task map |
| Banner, recovery poll, parked realtime | `frontend/` topic doc |

On go-ahead: fold the overlay into those homes, then delete this folder and its row in
[`../contents.md`](../contents.md).
