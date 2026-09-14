# Promote drafts — realtime delivery shape

Whole replacement files for the live paths below, written when the project's four stages had landed.
**Not yet promoted:** live SoT is still authoritative, and these are proposals until the fold-in
happens.

| Draft | Live target | Apply |
|-------|-------------|--------|
| [backend/websocket/websocket.md](./backend/websocket/websocket.md) | [`technical-documentation/backend/websocket/websocket.md`](../../../backend/websocket/websocket.md) | Replace. Adds § Message delivery and § The message vocabulary; rewrites the one-line **Delivery** note under § JetStream doc fan-out, which said in-process indexes decide who gets the frame; extends the header summary |

## What changes in the draft, and why

The live file is an operations document — placement, drain, refuses, fan-out filters — and says almost
nothing about what happens to a message after it is pulled. The one sentence that did, *"in-process
indexes still decide who gets the frame"*, described six fan-out functions that no longer exist.

The two new sections carry what the project settled: the one internal shape every subscription
converts to, the walk that delivers it, the family-keyed policy table, what an operator reads in the
delivery log, and the vocabulary both sides are pinned to. They are written for someone debugging the
running system, which is what a live topic doc is for — an operator reading a fan-out log line needs
to know what `route_kind` and `undeliverable` can say, and someone adding a message family needs to
know the corpus will fail them if they touch one side only.

## Sequencing — this cannot promote alone yet

[realtime-message-routing](../../realtime-message-routing/plan.md) is still in flight and its overlay
cites this project's plan in three places (§ Stage A twice, § Stage B once) as load-bearing
explanation of the delivery walk and the family segment on the subject.

[shared-planners](../../shared-planners/plan.md) § Absorbed from the retired websocket-realtime project
cites this plan as well, for § The sync path belongs to shared planners. That citation is unrelated to
the sequencing argument below, but it is a second reason the folder stays: **both citers have to be
gone before deleting it, not just routing.**

Two consequences:

- **This project's folder is not deleted on promote.** An active project citing it is exactly the case
  [`../../documentation-rules.md`](../../documentation-rules.md) § A promoted project folder is deleted,
  not archived keeps a folder for. Run that section's grep before deleting rather than assuming routing
  was the last one.
- **Promoting ahead of routing inverts the overlay stack.** This project's overlay lays on top of
  routing's. Folding this into live SoT while routing still describes itself as modifying it leaves
  live documentation describing the finished shape and an overlay claiming to change it.

The recommendation is to promote the two together once routing closes. Routing is parked on
[shared-planners](../../shared-planners/plan.md) § Stage I, so that is not imminent — if this draft is
wanted live sooner, the routing overlay's three citations have to be rewritten against live SoT in the
same pass.

## Still owned elsewhere after this promotes

- The `members` audience and the ceiling index behind it →
  [realtime-message-routing](../../realtime-message-routing/plan.md) § Stage C step 4. The draft names
  `everyone` and `subscribers` only, which is what exists.
- The baseline sync path and `skipWhileSyncing`'s future →
  [shared-planners](../../shared-planners/plan.md) § Stage G. The draft documents the gate as it
  behaves today and does not mention the unreached `sync` package.
- Converging the five frame shapes → deliberately not in this project; one decision per family, later.

## Known-stale on the live side, not fixed here

`subscribe_ack` is sent by `QueueSubscribeAck` and the SPA has no handler for it, so it reaches
`applyRemoteMessage` and logs `no handler for message family`. Console noise rather than a behaviour
defect, it predates this project, and fixing it is a change to the SPA's dispatch rather than to the
vocabulary — see [../plan.md](../plan.md) § Stage D.
