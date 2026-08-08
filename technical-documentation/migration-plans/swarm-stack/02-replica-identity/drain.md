# Drain / please_reconnect

**Roadmap:** #2 — Replica identity  
**Related:** [soft-full-cordon.md](./soft-full-cordon.md) (cordon = no-new/keep-existing; drain = move existing), [place-pin.md](./place-pin.md)  
**Code anchors:**
- [`services/websocket/server/drain.go`](../../../../services/websocket/server/drain.go)
- [`services/shared/wsplacement/keys.go`](../../../../services/shared/wsplacement/keys.go) — `eip:ws:drain:v1`
- Client / soak: `please_reconnect` in [`services/cmd/ws_soak`](../../../../services/cmd/ws_soak)

## Where it is used

- Redis PUBLISH on `eip:ws:drain:v1` carries a target id (`container.ID()`; JSON field `container_id`).
- Local drain / force-close embeds the same value in `please_reconnect` JSON.
- Receiving websocket filters “is this for me?” by comparing signal id to `container.ID()`.
- Drain-channel watcher kicks on emptying actions (`evacuate` / `drain` / `roll` / bare id); cordon-only PUBLISH or Redis cordon key does not kick (see [soft-full-cordon.md](./soft-full-cordon.md)).

## How it is used

1. Ops PUBLISH or local `DrainForRoll` (SIGTERM) targets this instance.
2. Matching websocket force-closes local clients (best-effort `please_reconnect`, then Close).
3. Clients reconnect through the router; place/pin/eligibility decide the new home.
4. Own-id filter ensures a drain for one instance does not tear down another.

## Does it require a stable identity?

**No — instance-specific.**

Drain means “empty **this** running process.” The published / filtered id must match the live instance. If the id were slot-stable, a signal or leftover key meant for the predecessor can hit the replacement that reuses the id — same inheritance hazard as soft/full/cordon.

Ops “drain slot N” without a census is convenience only; tooling should resolve the current instance id (or drain locally on the process that is stopping).

## Why might a stable identity still be desirable?

Only for operator vocabulary (`drain websocket-1`) without lookup. That is not required for correctness and fights the non-inheritance rule. Ops/docs use current container id; runbook/live SoT wording lands with **promote drafts**.

## Outcome

**Locked (discussion + design).**

- **Job:** target force-close / please_reconnect at **this** running websocket instance (and local SIGTERM drain). Moves existing clients off; not the same as redesigned cordon (no-new/keep-existing).
- **Stable slot identity required?** **No.** Drain targeting is **instance-specific**. Must not be inherited across container replacement.
- **Contract:** PUBLISH / `please_reconnect` field `container_id` / own-id filter use the same container-id scheme as place/registry/soft/full/cordon for string match at signal time.
- **Ops vocabulary:** no “drain slot N across replace”; resolve live container id. Local SIGTERM drain needs no slot name. Docs at promote drafts.
- **Follow-on:** composition with redesigned cordon on shutdown — Phase D; identity stays instance-specific either way.
- **Follow-on (Phase E):** on process-stop drain, best-effort flush of already-received outbound fan-out (shard queues) before kick — see [jetstream-durables.md](./jetstream-durables.md).
