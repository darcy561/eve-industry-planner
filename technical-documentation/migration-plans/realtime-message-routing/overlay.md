# Overlay — how realtime message routing works while this project is in flight

Lay this on top of live [backend/websocket/websocket.md](../../backend/websocket/websocket.md) and
[backend/ws-router/ws-router.md](../../backend/ws-router/ws-router.md). Where this file is silent,
those remain the truth. Sections appear here as stages land, each saying **what changed** and **how
that part works now**.

## Stage A — The owner delivery walk

**What changed.** The corporation and alliance delivery branches, their downward-hierarchy checks,
and the message metadata those checks read are gone. One function delivers owner-scoped changes for
every owner kind.

**How delivery works now.** A `doc.update` message names one owner. Account owners go to that
account's connections by the user-connection index, as before. Every other owner kind goes to
`broadcastToOwnerScope`, which takes the clients the owner index holds for that key and delivers to
each one that still has the owner in its scopes, is not the connection that made the change, and is
not mid-sync. Subscription is the whole rule: a connection's scopes are the account key plus the
planner it is working in, so holding the owner's key is what entitles it to the message, and there is
nothing further to narrow by.

Echo suppression is unchanged and still per tab: the connection that made the change is skipped and
its sibling tabs are delivered to, falling back to skipping the whole session only for a write that
names no tab. It sits where it sat in both branches this walk replaces — after the scope check,
before the sync check.

**What the message no longer carries.** `ScopesPayload` — `corporationRefs` and `accountIDs` — is
removed from `ChangeStreamMessage` and from the decoder. It was read off a `scopes` field on the
changed document, and nothing has ever written one, so both matchers were being handed empty scopes
and already admitted everyone the owner check admitted. Delivery is unchanged by the removal.

**What an operator sees differently.** The delivery log's detail map carries one `owner_ref` where it
carried `corporation_ref` or `alliance_ref`. The route kind beside it already named which.

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
