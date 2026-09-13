# Overlay — how realtime message routing works while this project is in flight

Lay this on top of live [backend/websocket/websocket.md](../../backend/websocket/websocket.md) and
[backend/ws-router/ws-router.md](../../backend/ws-router/ws-router.md). Where this file is silent,
those remain the truth. Sections appear here as stages land, each saying **what changed** and **how
that part works now**.

Nothing has landed. The live docs are the whole truth today.

## Stage A — The owner delivery walk

*Not started.* Will describe: the single owner-scoped delivery path that replaces the per-kind
corporation and alliance branches, and the delivery rule that remains once the downward-hierarchy
checks are gone.

## Stage B — The ceiling index

*Not started.* Will describe: the connection index built from a session's grant ceiling, what it
answers that the scopes index does not, when entries are added and removed, and why it is absent from
the hosted-tenant view that feeds JetStream filters.

## Stage C — Audience routing

*Not started.* Will describe: how a message names its recipients, what each audience reads, where a
family's meaning stops and its audience begins, and the one path every non-document family arrives
through.

## Stage D — A message about a planner the reader is not in

*Not started.* Will describe: where such a message lands in the SPA and what its payload carries.
