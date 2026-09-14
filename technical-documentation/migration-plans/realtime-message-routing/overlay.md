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
`deliverOutbound`, the one walk every family shares — see
[realtime-delivery-shape](../realtime-delivery-shape/plan.md) § Stage B. It takes the clients the owner
index holds for that key and delivers to each one that still has the owner in its scopes, is not the
connection that made the change, and is not mid-sync. Subscription is the whole rule: a connection's
scopes are the account key plus the planner it is working in, so holding the owner's key is what
entitles it to the message, and there is nothing further to narrow by.

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

*Steps 1 to 3 landed.* Every non-document family that has a producer travels the audience path. The
`members` audience is still to come.

**What changed.** A message can now name its own recipients, on a subject space of its own that runs
beside the per-family paths rather than replacing them. Every existing family still travels the
subject it always did.

**The subject.** `deliver.{audience}.{target}.{family}.{subtype}`, the same tokens whatever the
audience: `deliver.everyone.all.staticData.sdeBuildUpdated`,
`deliver.subscribers.corporation:corp_56_JxK.notification.archiveStatsProcessed`. `all` fills the
target slot for an audience that addresses no owner, so one parser reads every audience and the space
lists uniformly in NATS tooling. A segment holding a dot or a wildcard yields no subject at all rather
than one that splits into an extra token.

The family segment is **not** this project's: it was added by
[realtime-delivery-shape](../realtime-delivery-shape/plan.md) § Stage A, which keys a delivery policy
on the family and cannot read one out of a frame this service forwards unparsed.

**What each audience reads.** `everyone` takes the client map. `subscribers` takes the owner index for
an organisation owner, and the user-connection index for an account — an account's own key is
deliberately absent from the owner pools, so addressing one by owner key has to cross to the other
index or reach nothing. An audience with no fan-out is reported as unrouted rather than counted as a
delivery nobody was connected for; the two are indistinguishable in a log otherwise and only one is a
defect.

**Nothing is suppressed.** These frames name no originating connection, so every recipient in the
audience is delivered to, including whichever one caused the message. That is what the families
carried on this path do today; the document paths, which do skip the connection that made the change,
are unaffected and still travel `doc.update`.

The delivery walk these messages now go through does have a suppression gate —
[realtime-delivery-shape](../realtime-delivery-shape/plan.md) § Stage A put it there for the paths it
will carry later — but no adapter names a source for an audience message, so nothing on this path is
suppressed.

**The frame is forwarded unread.** The subject carries the routing and the body is passed through byte
for byte, so the browser's vocabulary is decided by the producer and this layer never shapes it.

**Static data announcements now start at the producer.** The worker calls `AnnounceStaticDataBuild`
after a build ships or is rolled back, which builds the client frame and publishes it to `everyone`.
The websocket service no longer subscribes to anything for this family — it has no file that knows
what static data is — and the general fan-out lives beside the other fan-outs rather than in a file
named for the one family that needed it.

`core.metrics.sde.build.updated` is unchanged and still carries the internal event: the API's cache
and the core metric both derive from a build and listen for it. The two are separate announcements of
one fact, one addressed to services and one to people, and the worker sends both.

**What a mixed deploy does.** For the moment worker and websocket disagree about this family, a
browser gets the announcement twice or not at all. Both are harmless: the frame names the build, so a
client already holding it stays quiet, and a client that hears nothing finds the new build on its own
load-time check. Nothing here needs the two to ship together.

**Notifications are addressed to an owner's subscribers.** `PublishNotification` takes an owner key,
builds the enveloped frame a browser reads, and publishes it to that owner's subscribers. The
`notify.{tenant}.{subtype}` subject and its subscriber are gone, and with them the only place the
envelope was assembled — a producer names a subtype and a body and nothing else.

**Nothing filters a notification by owner kind any more.** Two gates did: the notification producer
sent only for account owners, and the delivery path discarded any tenant that was not one. Both are
gone, so an organisation's notification is published and delivered to the people working in that
planner.

No such notification fires yet. The archived-jobs tasks terminate for any owner but an account —
corporation and alliance archives are not built — so the only notification that exists is still an
account's. What changed is that the routing no longer stands in the way when they are.

An account's own tabs arrive through the same audience, because an account key is in a connection's
scopes for the whole of its life.

The notification body names the owner it is about rather than an account: `ownerID` beside
`ownerKind`, which is what the shared corpus already said this message carries. Nothing reads the
body — the browser refetches on the subtype alone — so the rename costs no SPA change.

**A mixed deploy drops a notification rather than duplicating it.** The two paths are disjoint
subjects, so an old websocket paired with a new worker hears nothing on `notify.>` and a new
websocket paired with an old worker hears nothing on `deliver.>`. A missed notification costs a
client the refresh it would have had; the figures are readable on its next request either way.

## Stage D — A message about a planner the reader is not in

*Not started.* Will describe: where such a message lands in the SPA and what its payload carries.
