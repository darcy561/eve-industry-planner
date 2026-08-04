# #8 — Websocket rollout, affinity reconnect, and drain

**Roadmap:** [../roadmap.md](../roadmap.md) `#8`  
**Status (mirror):** partial — force-close landed; **`x-app-stop-grace` YAML landed**; **slice design accepted (2026-08-03) — ready to implement** (SIGTERM drain, refuses, soft divert, 60s process wait). Hosted-tenant / evacuate CLI still open after.

**Not live SoT.** On overlap with live docs, this overlay wins until promote.

**Rules:** Read and following [`../../documentation-rules.md`](../../documentation-rules.md) and [`../../technical-rules.md`](../../technical-rules.md) (migration-plans). Design accepted — implement from checklist below; promote live SoT only with go-ahead after code lands.

Live today: [websocket.md](../../../backend/websocket/websocket.md), [ws-router.md](../../../backend/ws-router/ws-router.md). Stack roll knobs: [`docker-stack.yml`](../../../../docker-stack.yml) `x-app-deploy` / `x-app-stop-grace`.

---

## What changed

### Already landed (keep) — verified against code 2026-08-03

| Claim | Code | Verified? |
|-------|------|-----------|
| Cordon key + drain PUBLISH → `ForceCloseLocalClients` (`please_reconnect` + close 1001) | `server/cordon_drain.go`; keys in `shared/wsplacement` | Yes |
| Startup EXISTS: if own cordon already set, force-close once | `runCordonDrainWatcher` | Yes |
| Force-close only when own cordon key still present | `trigger` checks `isOwnSlotCordoned` | Yes |
| Client cutoff → SET/DEL `eip:ws:full:v1:{slot}` (TTL refresh) | `server/slot_full.go` + `WS_SLOT_CLIENT_CUTOFF` | Yes |
| ws-router eligible = Docker `running` ∩ `/ready` 200 ∩ not cordon ∩ not full | `ws-router/backends.go`, `placement.go`, `proxy.go` | Yes |
| Session handoff `ws:session_handoff:v1:…` | `server/session_resume.go` | Yes |

**Not in code (in this slice — cordon refuse):**

- **Refuse upgrades while cordoned** — explain text *says* “refuses new placements,” but `handler.go` does **not** check `isOwnSlotCordoned` on upgrade. Placement skip is **router-only** today. **Add process refuse on cordon** with the SIGTERM work.

**Hard cutoff (add process refuse this slice):**

- `client_cutoff` / `WS_SLOT_CLIENT_CUTOFF`: websocket already **SET**s `eip:ws:full:v1:{slot}`; router skips full. **Add** upgrade refuse in `handler`.

**Soft divert (pulled into this slice — was parked):**

- `target_clients` is the early / soft line (default 1500). Not a refuse. See accepted design / implement plan below.

### Stack — stop grace (YAML landed; document here)

**Decision:** every service that uses start-first rolls (`x-app-deploy`) also merges service-level **`stop_grace_period: 60s`** via `x-app-stop-grace` (same budget as core used alone).

| Piece | Value |
|-------|--------|
| Anchor | `x-app-stop-grace` → `stop_grace_period: 60s` |
| Consumers | traefik, api, websocket, ws-router, worker, core, frontend |
| Not applied | `x-proxy-deploy` socket proxies (stop-first, short-lived) |

Compose puts grace **outside** `deploy:` — hence a separate service-root merge, not inside `x-app-deploy`.

**YAML status:** already in [`docker-stack.yml`](../../../../docker-stack.yml). **Process status:** app binaries still use shorter in-process shutdown timers (e.g. websocket lifecycle ~5s) — Docker will wait 60s, but the process exits early until aligned (implement plan step 3).

### Accepted — SIGTERM drain (not coded; implement next)

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

### Accepted — soft divert at `target_clients` (in this slice)

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
| 1 | Websocket draining flag + ReadyCheck | SIGTERM → not-ready (`/ready` 503) |
| 2 | Refuse upgrades **503** + reason | `draining` / `cordoned` / `at_cutoff`; one connected counter; drift OK |
| 3 | SIGTERM → `ForceCloseLocalClients` + wait ≤ **60s** | Align lifecycle shutdown with stop grace |
| 4 | Soft divert | Config/`eip sync` → `WS_SLOT_TARGET_CLIENTS`; `eip:ws:soft:v1`; router stick on place/pin; prefer non-soft on miss/reassign; pin ignores soft **not** full; validate target ≤ cutoff when both > 0 |
| 5 | wsplacement + router tests | Soft prefer; place-hit on soft home; all-soft fallback |
| 6 | Websocket unit tests | Ready flip; refuses; force-close on shutdown |
| 7 | Stale comments | `slot_full.go`, `SlotClientCutoff` godoc (“soft” → hard cutoff) |
| 8 | Smoke other start-first shutdown timers | Websocket must-fix; others sanity only |
| 9 | Promote (go-ahead) | websocket.md, ws-router.md, config.md (`target_clients` sync), stack.md (`x-app-stop-grace`) |

**Limits (promote wording):**

| Knob | Role |
|------|------|
| `target_clients` / `WS_SLOT_TARGET_CLIENTS` | **Soft divert** — config SoT; Redis soft hint; **place/pin stick**; new pick prefers non-soft; **no** process refuse. `0` = off |
| `client_cutoff` / `WS_SLOT_CLIENT_CUTOFF` | **Hard** — Redis full + process refuse **503**. `0` = unlimited |
| `reserve_capacity` | Still #18 scale-up policy only (not this slice) |

### Still open on #8 (after this slice)

- Hosted-tenant query surface (parked for #18 / #20)
- Soak evidence / gauges polish
- Armed evacuate CLI → #21 / #18

---

## Missing live SoT discovered mid-work

Drafts for promote (after implement):

1. **websocket.md** — SIGTERM drain; cordon/cutoff refuse; soft vs hard limits; soft Redis key.
2. **ws-router.md** — prefer non-soft; hard-skip full/cordon; fallback when all soft.
3. **config.md** — `target_clients` + `client_cutoff` as Websocket config / sync (operator SoT); env bridge names only.
4. **stack.md** — `x-app-stop-grace` 60s on start-first services.

Do not edit those live files until go-ahead.

---

## Notes / decisions

1. **SIGTERM = local drain signal for rolls.** Prefer this over inventing a second Redis publish on every Swarm stop.
2. **Keep Redis cordon for pre-stop ops.** Router eligibility needs an explicit skip while the task can still be `/ready` 200.
3. **60s stop grace is the app start-first standard** (`x-app-stop-grace`). Same number as former core-only grace.
4. **YAML grace without process wait is incomplete** — Docker waits; binary must use the budget for kick + exit.
5. **Optional later:** router retry another backend on dial/502 (race before probe refresh). Not required for v1 of this slice if not-ready + refuse-upgrade are prompt.
6. **Rejected for this slice:** using NATS census as the router placement signal (wrong consumer; bus still off). Using SIGTERM alone as the only evacuate tool (too late for pre-stop placement skip). Soft divert must not hard-skip (would collapse to cutoff).
7. **Soft divert in this slice** — Redis soft hint; stick on place/pin; prefer non-soft only when assigning/reassigning. Not a hard skip (unlike full). `reserve_capacity` stays for #18.
8. **Design accepted 2026-08-03** — implement plan above; refuse 503; config SoT for `target_clients`; pin ignores soft not max; SPA reconnects on refused upgrade.
