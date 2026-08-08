# Soft / full / cordon

**Roadmap:** #2 — Replica identity  
**Related:** [place-pin.md](./place-pin.md) (backend id scheme; non-stable), [drain.md](./drain.md) (kick / SIGTERM — separate)  
**Code anchors:**
- [`services/shared/wsplacement/keys.go`](../../../../services/shared/wsplacement/keys.go) — prefixes
- [`services/websocket/server/placement_flags.go`](../../../../services/websocket/server/placement_flags.go) — soft/full SET/DEL
- [`services/websocket/server/drain.go`](../../../../services/websocket/server/drain.go) — cordon key check (refuse new); drain watcher kicks on evacuate only
- [`services/ws-router/proxy.go`](../../../../services/ws-router/proxy.go) — skip cordoned/full; soft shrinks preferred

## Where it is used

Redis flags keyed by the same string the router uses for backends:

| Key | Writer | Reader |
|-----|--------|--------|
| `eip:ws:soft:v1:{id}` | websocket (count ≥ soft threshold) | ws-router (prefer non-soft for new homes) |
| `eip:ws:full:v1:{id}` | websocket (count ≥ cutoff) | ws-router (not eligible) |
| `eip:ws:cordon:v1:{id}` | drain / ops / evacuate | ws-router (not eligible); websocket own check |

`{id}` = `container.ID()` on the websocket process (short container id).

## How it is used (today)

- Soft: advisory divert — place-hit stays; new assignments prefer non-soft peers when any exist. Does not refuse upgrades by itself.
- Full: hard skip — id leaves eligible; place on that id reassigns; upgrades refused at cutoff. **Existing clients stay.** Ready stays up.
- Cordon: router skips + upgrades refused; **existing sockets stay**. Emptying is drain-channel evacuate / `DrainForRoll` only.

Router applies flags by matching the key suffix to backend registry ids.

---

## Soft / full

### Does it require a stable identity?

**No — and slot-stable is actively wrong for soft/full.**

Soft/full describe **this container’s live load**, not a permanent slot property. Flag suffix must match the live backend registry id (same compare contract as [place-pin](./place-pin.md)).

If soft/full were keyed by a slot-stable id shared across replacement:

1. Old container marks full → `eip:ws:full:v1:websocket-1`
2. Container rolls; new task registers as the same `websocket-1`
3. Router still sees full on that id → brand-new empty container is treated as full until something DELs the key

New containers would **inherit previous container conditions**. Instance-specific ids avoid that: old keys orphan under the dead id; the new process starts clean and rewrites soft/full from its own counts.

### Outcome (soft / full)

**Locked (discussion).**

- **Job:** advertise this running websocket instance’s soft/full load state to the router.
- **Stable slot identity required?** **No.** Soft/full **must** be **instance-specific** (keyed by the same non-stable backend id scheme as place/registry). A replacement container must not inherit the previous instance’s soft/full flags.
- **Contract:** string-match with live backend registry ids; keys are process-ephemeral load state, not slot inheritance.

---

## Cordon

### Intended model (name / purpose)

**Cordon** = cordon off this instance so the router (and local upgrades) do not send **new** traffic to it, while it is still online.

- New clients: blocked (not eligible / upgrade refused).
- Existing clients: **maintained** (no force-close from cordon alone).
- Ready / healthy: **stays up** (instance is still serving its current sockets).

Soft remains different (advisory divert for new homes; place-hit may stay). **Full** (`client_cutoff`) shares the same access posture as cordon for newcomers: blocked at router + process refuse; existing clients continue; Ready stays up (`upgradeBlockReason` / ws-router skip maps).

**Not cordon’s job:** emptying the instance. Moving existing clients off is **drain** / evacuate / SIGTERM ([drain.md](./drain.md)).

### Behaviour (landed — Phase D)

| | Cordon | Full (`client_cutoff`) |
|--|--------|------------------------|
| New traffic | Blocked (router + upgrade refuse) | Blocked (router + upgrade refuse) |
| Existing clients | Kept | Kept |
| Ready | Up | Up |
| Empty instance | No — use drain/evacuate / SIGTERM | No |

### Does it require a stable identity?

**No.**

Cordon is a condition of **this running instance**. It must not be inherited by a replacement container. A leftover cordon key under a reused id would still refuse new upgrades on the replacement (same inheritance bug as full); instance-specific container ids avoid that.

### Outcome (cordon)

**Locked (discussion).**

- **Job:** prevent **new** access to this instance while it remains online; keep existing clients; Ready stays up. Not “evacuate / kick everyone.”
- **Stable slot identity required?** **No.** Cordon is **instance-specific**. Must not continue or be inherited across container replacement.
- **Full:** same “cordoned off to new clients, keep existing, Ready up” posture (router skip + `at_cutoff` refuse).
- **Drain / evacuate / SIGTERM:** separate; own emptying. Outbound flush before kick on process stop is Phase E.
