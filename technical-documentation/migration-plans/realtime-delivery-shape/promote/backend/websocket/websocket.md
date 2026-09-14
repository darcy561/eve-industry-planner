# Websocket service (`eip_websocket`)

Live SoT for the **websocket** service: per-replica soft/full placement signals, upgrade refuses, SIGTERM drain (outbound flush + durable cleanup), session handoff, in-process hosted-tenant query view, selective JetStream doc fan-out, and the one walk every delivered message goes through. Code: [`services/websocket`](../../../services/websocket/). Placement / eligible set → [ws-router.md](../ws-router/ws-router.md). Edge `/ws` → [traefik.md](../../stack/traefik.md). Stop grace → [stack.md](../../stack/stack.md). Identity → [stack.md](../../stack/stack.md) § Replica identity. Changestream publish subjects → [core.md](../core/core.md). Document-lock publish → [document-lock/locks.md](../api/document-lock/locks.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-websocket:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.websocket.image` |
| Replicas | `1` (`EIP_WEBSOCKET_REPLICAS`, from config `min`) | Template: [`yamldefaults.DefaultConfig`](../../../deployment-tool/internal/kit/templates/yamldefaults/default.go). Live: `eip.config.yaml` |
| Capacity min / max | template `1` / `5` | same (`services.websocket.min` / `max`) |
| `target_clients` | `1500` (`WS_TARGET_CLIENTS`; `0` = soft divert off) | same → **`eip sync`** / bring-up |
| `client_cutoff` | `2000` (`WS_CLIENT_CUTOFF`; `0` = unlimited) | same → **`eip sync`** / bring-up |
| `reserve_capacity` | `0.20` | same (capacity-controller policy only; not enforced here) |
| `capacity_controller_managed` | `true` | same |
| Process stop budget | **60s** (`lifecycle.AppStopGrace`; matches stack `x-app-stop-grace`) | [`app.go`](../../../services/websocket/app.go) / [`stop_grace.go`](../../../services/shared/lifecycle/stop_grace.go) |
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

`reserve_capacity` is not enforced by this binary — capacity-controller Evaluate uses it for WS (and api-linked) scale thresholds ([capacity-controller.md](../../stack/capacity-controller.md)).

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

Do **not** `docker service scale eip_websocket=N-1` on a hot replica that may be the only home for an alliance. Prefer planned evacuate (`eip capacity evacuate <container_id>`) or wait for clients to leave, then shrink a cold empty replica. Leave ≥1 healthy non-draining backend. SIGTERM drain is the last mile of a stop.

## Planned cordon / drain / uncordon

Separate from roll SIGTERM drain. Capacity-controller (or operator via **`eip capacity`**) targets a live **`container_id`** over NATS request-reply:

| Subject | Process effect |
|---------|----------------|
| `ws.command.cordon` | Soft-stop: refuse new upgrades; **Ready stays OK** (router can still see the backend); publish placement soft/draining as applicable |
| `ws.command.drain` | Kick local clients (`please_reconnect`) and clear load; Ready fails while draining; kick wait bounded by `lifecycle.AppStopGrace` (60s); ack after kick wait ends |
| `ws.command.uncordon` | Clear planned cordon/drain flags when empty / operator restores |

Scale-in playbook (controller Evaluate when websocket is managed): **cordon → drain → wait clients empty (or drain ack / stop-grace budget) → Moby Scale(desired−1)**. Controller NATS Drain waits for the websocket process ack (same stop-grace SoT + RTT slack) — no separate YAML drain timer. Default operator YAML has `services.websocket.capacity_controller_managed: true`. Set `false` to skip automatic Apply for that role.

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

**Delivery:** JetStream filter is cost control. After pull the message becomes an `Outbound` and goes through the one delivery walk, which decides who gets the frame — see § Message delivery. Outbound parse prefers payload `collection` / `docID` (subject carries tenant for filtering).

**Miss window:** live-update durables use `DeliverNew`. Between index update and a successful filter widen, those messages for a newly hosted tenant are not pulled and are not replayed from JetStream — clients rely on existing HTTP load / session handoff / resume. Lock durables use `DeliverLast` (a newly filtered `doc.lock.{accountID}` may still receive the latest message for that subject). Filter updates are not a zero-gap bus.

**Ops inspect (dev/stack):** `GET :4001/placement` for clients; JetStream `consumer info doc-update-stream doc-live-updates-<container_id>` for live Filter Subjects (NATS CLI / nats-box on `eip-core`).

## Message delivery

Every message a client receives arrives as one internal shape and is delivered by one walk, whatever
subject it came in on. Three subscriptions feed it, each with an adapter that knows only its own
payload: `doc.update.{tenant}.{collection}.{docID}` (JetStream), `doc.lock.{accountID}` (JetStream),
and `deliver.{audience}.{target}.{family}.{subtype}` (core NATS, unacknowledged).

```go
type Outbound struct {
    Family   string          // selects the delivery policy, never the recipients
    Subtype  string          // kind within that family, always from the subject
    Audience Audience        // everyone | subscribers, plus the internal by-name one
    Target   models.Owner    // who the message is about
    DocID    string          // the document, for the by-name audience only
    Source   Source          // {ClientID, SessionID}; zero suppresses nobody
    Frame    []byte          // what the socket is given; delivery never reads it
}
```

**The audience picks the candidates, not the family.** `everyone` takes the client map; `subscribers`
takes the owner index for the target's key; the internal `doc_subscribers` takes the clients that
asked for one document by name, which is where a change stating no readable owner goes. An adapter
may pick that last one but no producer can address it, so publishing its string reaches nobody. Each
candidate is then checked to still hold the owner, skipped if it is the connection that caused the
message, held back if the family's policy says so, and written to otherwise.

**The family selects policy only.** `deliveryPolicies` is keyed by family and carries one gate today,
`skipWhileSyncing`, set for `document` alone: a client rebuilding its baseline is held back from a
document change, because a change applied on top of a half-written baseline lands in a document about
to be replaced. A family absent from the table cannot be delivered — the walk reports
`undeliverable: unknown_family` rather than fanning out on a default.

**Suppression is what the message carries.** Documents suppress the tab that made the change and fall
back to the session when no tab is named; locks suppress the session, since a viewer joining or
leaving is one fact about every tab of it. Messages arriving already addressed carry no source, so
nothing on that path is suppressed.

**A document is rewritten once before delivery.** `ClientPayload` drops the routing-only fields
(`ownerKey`, `sourceClientID`, `sourceSessionID`), names the owner as a handle a browser can read,
and restores entity refs to raw ids. Done once per message after routing is decided, so no internal
ref reaches a client.

**Maintenance keeps its own path.** It is generated per replica from a flag rather than received, and
it is a write followed by a socket close with a write deadline so a dead peer does not hold the rest.
The close is the point of it, which is why it is not an audience.

### What an operator sees

One outcome type reports every fan-out, composed by one finisher.

| Key | Says |
|-----|------|
| `route_kind` | the audience that carried it — `everyone`, `subscribers`, `doc_subscribers` |
| `family` / `subtype` | what was delivered, since two families can share an audience |
| `owner_kind` / `owner_ref` | the target it was addressed to |
| `source_client_id` / `source_session_id` | the connection suppressed, under the name every path uses |
| `undeliverable` | why nothing could carry it — `unknown_family`, `unknown_audience`, `unaddressable_target`, `unreadable_message` |
| `skipped_*_client_ids` | a reason per client id, including echo suppression and scope misses |

A fan-out reads `… (suppressed on replica)` only when every skip was deliberate; a client dropped for a
full send buffer or a stale index reads `… (no recipients on replica)`.

## The message vocabulary

`type` says which handler a browser runs and `subtype` narrows it within that family. Both are defined
on each side and pinned against one shared corpus, `testing/fixtures/realtime-messages/kinds.json`,
read by a Go test and a vitest test — so a family or kind added on one side alone turns the other red.

| Family | Kinds | Frame shape |
|--------|-------|-------------|
| `document` | none | flat; the change document with routing fields removed |
| `notification` | `archiveStatsProcessed` | enveloped `{type, subtype, data}` |
| `maintenance` | none | flat `{type, enabled, message}` |
| `staticData` | none | flat `{type, buildNumber, version}` |
| `document_lock` | none | flat `{type, event, …}` — its kinds travel in `event`, not `subtype` |

**The corpus is the vocabulary of a message addressed to an audience**, not of every string that can
appear in a `type` field. Replies and lifecycle frames — `connected`, `resume_ack`, `subscribe_ack`,
`please_reconnect`, `document_lock_lock_state_batch_ack` — are written to the one connection they
concern and address nobody, so they are outside it. `maintenance` is inside it despite keeping its own
path, because it is addressed to every connected client.

**Audience is server-side only.** It never reaches a browser, which already knows it is a recipient,
so it is not part of this vocabulary.

**`subtype` comes from the subject, never the frame.** `PublishToAudience` takes it as a parameter and
the subscriber reads it back off the subject, so the service has it without opening a body it forwards
unread. The two coincide for notifications and do not in general: a `staticData` subject segment says
`sdeBuildUpdated` while its frame carries no subtype at all.

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

Against a live stack: `testing/ws_soak` — `hold` (reconnect endurance), `limits` / `pressure` (soft/full + divert after temporarily lowering synced thresholds), `fanout` (phased connect then JetStream → WS exact delivery; default via Traefik `/ws`). Place observation uses `connected.container_id` + NATS soft/full — not Redis placement keys. Not a substitute for unit/integration tests. How to run / read reports → [testing/services/websocket.md](../../testing/services/websocket.md) + [testing/harness.md](../../testing/harness.md).
