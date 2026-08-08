# Websocket service (`eip_websocket`)

Live SoT for the **websocket** service: per-replica soft/full placement signals, upgrade refuses, SIGTERM drain (outbound flush + durable cleanup), session handoff, in-process hosted-tenant query view, and selective JetStream doc fan-out. Code: [`services/websocket`](../../../services/websocket/). Placement / eligible set → [ws-router.md](../ws-router/ws-router.md). Edge `/ws` → [traefik.md](../../stack/traefik.md). Stop grace → [stack.md](../../stack/stack.md). Identity → [stack.md](../../stack/stack.md) § Replica identity. Changestream publish subjects → [core.md](../core/core.md). Document-lock publish → [document-lock/locks.md](../api/document-lock/locks.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-websocket:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.websocket.image` |
| Replicas | `2` (`EIP_WEBSOCKET_REPLICAS`, from config `min`) | Template: [`yamldefaults.DefaultConfig`](../../../deployment-tool/internal/kit/templates/yamldefaults/default.go). Live: `eip.config.yaml` |
| Capacity min / max | template `2` / `4` | same (`services.websocket.min` / `max`) |
| `target_clients` | `1500` (`WS_TARGET_CLIENTS`; `0` = soft divert off) | same → **`eip sync`** / bring-up |
| `client_cutoff` | `2000` (`WS_CLIENT_CUTOFF`; `0` = unlimited) | same → **`eip sync`** / bring-up |
| `reserve_capacity` | `0.20` | same (capacity-controller policy only; not enforced here) |
| `drain_timeout` | `10m` | same (ops budget for evacuate wait; not the process stop timer) |
| `capacity_controller_managed` | `false` | same |
| Process stop budget | **60s** (`shutdownTimeout`; matches stack `x-app-stop-grace`) | [`app.go`](../../../services/websocket/app.go) |
| Volume | `api_data` → `/data` | stack YAML |
| Networks | `eip-core` only | [network.md](../../stack/network.md) |

When both `target_clients` and `client_cutoff` are > 0, config validate requires `target_clients` ≤ `client_cutoff`. Stack YAML may keep bootstrap literals; **operator SoT** is `eip.config.yaml` via sync. Secret attach: `x-secrets-websocket` (mongo + redis). Full service block → `services.websocket` in that YAML.

## Traffic

```text
Browser ──Traefik /ws──► eip_ws_router ──► eip_websocket task :4001
                                              probes :19100/ready
                                              GET :4001/placement (router reconcile)
                                              metrics / OTel on the process
```

Process identity: `container.ID()` (in-container `HOSTNAME` = Docker short container id). Same string is OTel `service.instance.id`, JetStream durable suffix, and placement `container_id`. No Traefik labels on this service. Swarm `Task.Slot` is orchestration-only — not identity SoT.

## Soft divert vs hard cutoff

One **connected-client** counter drives placement flags and process refuse. Flags publish on NATS subject `ws.placement.state` as raw `PlacementState` JSON (`container_id`, `clients`, `soft`, `full`, `draining`). Router also reconciles via `GET /placement`. Small drift under race is acceptable.

| Band | Placement signal | Process upgrade | Router |
|------|------------------|-----------------|--------|
| `connected` < `target_clients` | soft=false, full=false | allow | normal place |
| `target` ≤ `connected` < `cutoff` | **soft=true** | **allow** (soft does not refuse) | place **stick**; new homes **prefer non-soft** |
| `connected` ≥ `client_cutoff` (and cutoff > 0) | **full=true** | **503** `at_cutoff` | hard-skip full + reassign off |

`0` target = soft divert off. `0` cutoff = unlimited (no full flag / no at_cutoff refuse). Flags refresh on connect/disconnect and a short maintainer; publish is deduped (state updated only after successful publish).

`reserve_capacity` is not enforced by this binary (capacity controller later).

## Upgrade refuses (503)

Before / after session auth as applicable, this process refuses upgrades with HTTP **503** and a clear body reason when:

| Reason | When |
|--------|------|
| `draining` | Local SIGTERM / roll drain in progress |
| `at_cutoff` | Connected clients ≥ `client_cutoff` (> 0) |

Soft does **not** refuse. SPA reconnects with backoff on failed upgrade; next attempt goes through the router again.

## SIGTERM / roll drain

On Swarm stop / start-first replace (process **SIGTERM**), cleanup budget shares the **60s** stop grace (`DrainForRoll` then `Shutdown`):

1. Set local **draining** → `:19100/ready` fails; new upgrades **503**; publish `PlacementState` with `draining=true` on NATS (router hard-skips).
2. Delete this container’s JetStream durables (`doc-live-updates-{container.ID()}`, `doc-lock-{container.ID()}`).
3. Stop **intake only** (pull loops); keep outbound shard workers up.
4. Flush outbound shard FIFOs + in-flight work (bounded by cleanup ctx) while sockets are still open.
5. `ForceCloseLocalClients` — sync `please_reconnect` (includes `container_id`) then close (**1001** GoingAway); wait until local clients empty or cleanup ctx done (re-kick late joiners).
6. Stop shard workers / consume loops; `Shutdown` (sync pool) then HTTP/probes/deps teardown.

Router drops non-ready backends on probe refresh and skips draining via placement state → reconnects land on remaining/new backends (prefer newest bake among eligible).

```text
Swarm start-first roll
  NEW task up (ready)
  OLD task SIGTERM
    → draining + NATS PlacementState + /ready 503 + refuse upgrades
    → delete durables → flush outbound → ForceCloseLocalClients
    → clients reconnect → router places on eligible (prefer NEW)
    → OLD exits before stop_grace (60s) elapses
```

Do **not** `docker service scale eip_websocket=N-1` on a hot replica that may be the only home for an alliance. Prefer waiting for clients to leave (or a future evacuate path), then shrink a cold empty replica. Leave ≥1 healthy non-draining backend. SIGTERM drain is the last mile of a stop.

## Hosted-tenant query view

In-process only: `HostsTenant` / `HostedTenants` over connection indexes (`account:` / `corporation:` / `alliance:` key shapes from `wsplacement`). **No Redis write** of hosting interest. Cross-replica census for capacity/ops is a separate control-plane concern (NATS and/or internal API) — not required for local JetStream filter updates.

## JetStream doc fan-out (selective pull)

Each replica keeps **one** durable for live updates and **one** for locks, named with `container.ID()` (`doc-live-updates-{id}`, `doc-lock-{id}`). Interest is the durable’s **FilterSubjects** list, not a second durable per tenant.

| Stream | Publish subject (core / API) | Per-hosted filter pattern |
|--------|------------------------------|---------------------------|
| `doc-update-stream` | `doc.update.{tenantString}.{collection}.{docID}` | `doc.update.{tenantString}.>` |
| same stream | `doc.lock.{accountID}` (account id segment; not `account:` prefix) | `doc.lock.{accountID}` for each hosted `account:{id}` |

`tenantString` matches placement / hosted keys (`account:{id}` / `corporation:{id}` / `alliance:{id}`). Colon is one subject token.

**Empty hosted set:** filters use inert subjects that match no traffic (`doc.update.__none__.>` / `doc.lock.__none__`). Never empty `FilterSubjects` (JetStream treats that as all stream subjects). Never keep `doc.update.>` / `doc.lock.>` as catch-all on these durables.

**Reconcile:** connect / disconnect / org-scope changes schedule a **debounced** (~100ms) `UpdateConsumerFilterSubjects` from `HostedTenants()`. Durable **name** stays fixed; filters widen/shrink in place (no delete+recreate on every join). Corp/alliance keys widen **update** filters; **lock** filters today are account-only (corp/alliance lock subjects are a later document-lock change).

**Delivery:** JetStream filter is cost control. After pull, in-process indexes still decide who gets the frame. Outbound parse prefers payload `collection` / `docID` (subject carries tenant for filtering).

**Miss window:** live-update durables use `DeliverNew`. Between index update and a successful filter widen, those messages for a newly hosted tenant are not pulled and are not replayed from JetStream — clients rely on existing HTTP load / session handoff / resume. Lock durables use `DeliverLast` (a newly filtered `doc.lock.{accountID}` may still receive the latest message for that subject). Filter updates are not a zero-gap bus.

**Ops inspect (dev/stack):** `GET :4001/placement` for clients; JetStream `consumer info doc-update-stream doc-live-updates-<container_id>` for live Filter Subjects (NATS CLI / nats-box on `eip-core`).

## Keepalive

Writer sends websocket **Ping** every `PingPeriod` (1m). Reader read deadline is `PongWait` (90s), extended on app data and on **Pong** (`SetPongHandler`). SPA also sends text `"ping"` every 45s (server replies `"pong"`). Idle peers that neither pong nor send app traffic are closed as stale.

## Session handoff

Redis `ws:session_handoff:v1:…` (~25s TTL: reconnect window + slack) lets a reconnect resume subscriptions across backends when the handoff is still present. This is auth/session continuity — not the placement signal plane.

## Health

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` | Liveness (stays up while draining) |
| `GET :19100/ready` | Readiness — fails when draining, or when Redis / NATS / Mongo deps fail Swarm healthcheck |
| `GET :19100/debug/pprof/*` | Go pprof (heap/profile/goroutine/…) when `ENVIRONMENT=development` only — probe port; off on live |
| `GET :4001/placement` | `PlacementState` JSON for router status reconcile |

Traefik does not LB this service directly.

## Ops soak (optional)

Against a live stack: `services/testing/ws_soak` — `hold` (reconnect endurance), `limits` / `pressure` (soft/full + divert after temporarily lowering synced thresholds), `fanout` (phased connect then JetStream → WS exact delivery; default via Traefik `/ws`). Place observation uses `connected.container_id` + NATS soft/full — not Redis placement keys. Not a substitute for unit/integration tests. How to run / read reports → [testing/services/websocket.md](../../testing/services/websocket.md) + [testing/harness.md](../../testing/harness.md).
