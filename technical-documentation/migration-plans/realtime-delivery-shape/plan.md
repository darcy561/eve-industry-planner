# Realtime delivery shape

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Every message the websocket service delivers should be **the same shape by the time it is delivered**,
whatever subject it arrived on, so that one walk sends all of them and a new type is a row in a table
rather than a fan-out function.

Today each inbound path carries its own shape all the way to the socket, and each has grown its own
delivery function to match. Six of them exist. They agree on almost everything — take a candidate set,
look up each client, check it still qualifies, try a non-blocking send — and differ in which index they
read, which gates they apply, and whether they report anything an operator can read at all. The
differences are real; the repetition around them is not.

[realtime-message-routing](../realtime-message-routing/plan.md) answered **who receives a message**.
This project answers **what a message is once it is here**. They are two halves: that one made
audience a dimension of its own, and this one makes the shape carrying that dimension uniform.

## Starting position

Three subscriptions bring in something a client must be sent, and each hands on a different shape:

| Arrives on | As | Transport |
|------------|----|-----------|
| `doc.update.{owner}.{collection}.{docID}` | `ChangeStreamMessage`, twelve flat fields | JetStream, durable, per-tenant filter subjects |
| `doc.lock.{accountID}` | an inner object with an `event` discriminator | JetStream, durable |
| `deliver.{audience}.{target}.{subtype}` | addressing in the subject, body opaque | core NATS |

A fourth, `appconfig.maintenance.state`, is a flag rather than a message: the service builds the frame
itself and closes the socket behind it. It stays outside — see § Maintenance stays where it is.

**Six functions deliver them.** `broadcastToAccountClients`, `broadcastToOwnerScope` and
`deliverToExplicitDocSubscribers` in `dispatch.go`; `broadcastRawToAccount` in `subscription.go`;
`broadcastRawToEveryClient` and `broadcastRawToSubscribers` in `nats_audience.go`.

**One outcome type reports most of them, and the newest path reports none of it.** Documents and
document locks both fill `outboundDeliveryOutcome` — a skip reason per client id, the suppressed
session, the candidate count — and both report it through `finishReplicaFanoutOperation`. The audience
fan-outs added with `deliver.{audience}.{target}.{subtype}` return a bare recipient count instead, and
`broadcastRawToSubscribers` throws the rest away by reading `.RecipientCount` off an outcome it was
handed. So the consolidation here is not choosing between two shapes: it is bringing the newest path
onto the one that already exists.

**The vocabulary covers four of about fifteen types on the wire.** `document`, `notification`,
`maintenance` and `staticData` are defined on both sides and pinned by a shared corpus.
`document_lock`, `document_lock_lock_state_batch_ack`, the four sync frames and the
connection-lifecycle frames (`connected`, `resume_ack`, `please_reconnect`, `subscribe_ack`) are
pinned by nothing — `document_lock` is spelled once in Go and once in the SPA with a comment asking a
reader to keep them in step.

**Only one of those is a routing gap.** A table keyed by family cannot route a family it does not
know, but most of these never reach the table: `connected`, `resume_ack`, `subscribe_ack`,
`please_reconnect`, `document_lock_lock_state_batch_ack` and the sync frames are written straight to
one socket by the code that originates them, as a reply or a lifecycle signal to the connection in
hand. They address nobody, so there is nothing for a policy to decide. `document_lock` is the
exception — it is delivered through `deliverOutbound` and holds a row in the table, and it is the
family the corpus is missing.

So the corpus is the vocabulary of a **message addressed to an audience**, not of every string that
can appear in a `type` field. That is the line between the two sets, and it is not the same as
"holds a row in `deliveryPolicies`": `maintenance` is addressed to every connected client and belongs
in the corpus, while keeping its own path because the close is the point of it — see § Maintenance
stays where it is. What the corpus excludes is the frame a socket is handed about itself.

`app_version` is **not** one of them despite the SPA branching on it: it is a field inside the
`connected` and `resume_ack` frames and has never been a type of its own, so that branch is
unreachable. No Go path emits it as a frame type, and the SPA reads the field correctly four lines
above the dead branch. Stage D deletes it.

## The internal shape

```go
type Outbound struct {
    Family   string       // selects the delivery policy, never the recipients
    Subtype  string       // kind within that family
    Audience Audience     // everyone | subscribers, plus the internal by-name one
    Target   models.Owner // who the message is about
    DocID    string       // the document, for the audience that reads a by-name subscription
    Source   Source       // the connection that caused it; zero suppresses nobody
    Frame    []byte       // what the socket is given, built by the adapter
}
```

`members` is not among the audiences: it is owed by
[realtime-message-routing](../realtime-message-routing/plan.md) § Stage C step 4, and the walk reports
an audience it cannot route rather than guessing.

`Source` is a pair rather than a string: documents suppress the tab that made the change and fall back
to the session when no tab is named, and locks suppress the session only.

An adapter at each subscription produces it. Each is small, and each is the only place that knows what
its subject's payload looks like.

## The type selects policy, never recipients

The type says how a message is delivered — which gates apply, what its outcome reports, how it is
written to the wire. It must never say **who** receives it.

That line is the whole finding of [realtime-message-routing](../realtime-message-routing/plan.md):
audience was inferred from the family by a Go file written for it, which held only while every family
had exactly one audience, and broke the moment a second wanted an audience another already had.

So `audience` stays a field the type does not determine. It cannot be derived from `Target` either:
`subscribers` and `members` carry the **same** target and differ only in which index is read — the
entitled set or the subscribed one. A corporation planner telling its members something while each of
them works in a different planner is one type, one target and two possible recipient sets, and it is
the case that project exists to serve.

## The table

One row per type, and adding a type is adding a row:

| Column | Answers |
|--------|---------|
| Gates | Which checks run beyond the audience — so far, whether a client rebuilding its state is held back |

One column, because one thing has turned out to vary by family. A family absent from the table cannot
be delivered: the walk reports that rather than fanning out on a default, because a policy nobody
wrote is not a policy.

Which audience a message uses is **not** a column. The adapter chooses it per message — a document
addresses an owner or, when it names none, whoever asked for that document by name — so a family is
free to use more than one, which is the property the routing project exists to protect.

The owner check and echo suppression are not columns. Both are answered by the message itself — the
audience says which index holds the candidates and therefore what "still belongs" means, and a source
that names nobody suppresses nobody — so making them per-family would let a family opt out of a check
that is about correctness rather than about what the family is.

The gates are where a silent regression would hide, so the table states them rather than leaving them
to whichever function a message happens to reach. Two are already known to differ: only documents skip
a client that is mid-sync, and only documents and locks suppress a source at all.

## The transport is not the shape

Every subject keeps the transport and the filter it has. Documents stay on JetStream with the
per-tenant filter subjects built from the hosted-tenant set; locks stay durable; audience messages
stay core NATS and unacknowledged.

A filter is how this service **subscribes**. It says nothing about what the message is once it is in
the process, and the adapter is where that conversion belongs. Reasoning the other way — that
differing transports force differing internal handling — turns this project into a wire migration that
would collide with two other projects' ownership, and it is wrong: nothing here changes a subject, a
stream, a durable or a filter.

## The adapter builds the frame

The frame a socket is given is produced by the adapter, and delivery never reads it.

The alternative was carrying the body and projecting it to a frame per family after the walk, which is
what the plan first described. It does not work for a message that arrives already framed: an audience
message carries what its publisher built, and decomposing it into family, kind and body is not
lossless — a static data frame is flat, with `buildNumber` and `version` at the top level and no
subtype at all. Decomposing it would mean this service knowing each family's frame shape again, which
is the knowledge the routing project removed from it.

So the adapter is where a frame is built or passed through, and the walk stays indifferent to it. Each
family keeps the frame its SPA handler already parses; converging those shapes later is a change to
adapters and producers rather than a projection step that has to exist first.

## Maintenance stays where it is

A maintenance announcement is a write followed by a socket close, sequential and with a write deadline
so a dead peer does not hold the rest. It is generated per replica from a flag rather than received as
a message, and the close is the point of it. It keeps its own path.

## Stages

### Stage A — The shape and one adapter

Define `Outbound` and the table, and convert the audience subscription to produce it. The audience path
is the smallest: no suppression, no sync gate, no second selector, and its two fan-outs are the two
simplest.

This stage also brings audience delivery onto `outboundDeliveryOutcome`, which it never joined, and
removes the second caller of `broadcastRawToAccount` so that Stage C is left with one.

**The subject gains the family.** `deliver.{audience}.{target}.{family}.{subtype}`. A table keyed by
family needs the family, and the only other way to get it is to open a frame that is meant to be
forwarded unread. The subject space has two publishers and one subscriber, all in this repository and
all deployed together, so this costs a coordinated release of those and nothing else — see
§ Wire compatibility.

**Done when** audience messages reach sockets through the shared walk, the table holds their row, they
report the same outcome documents and locks already do, and no behaviour differs — the same clients
receive the same frames.

**Landed.** See [overlay.md](./overlay.md) § Stage A.

### Stage B — Documents

Convert the `doc.update` adapter. This is the stage that carries the second selector and the sync
gate, and the one with the volume, so the walk's shape is decided by what this needs.

A document with no readable owner reaches whoever asked for it by name, which is a different index
rather than an extra one: the two are alternatives, chosen by whether the message states an owner.
That audience is internal — an adapter picks it, no producer can address it, and a message arriving on
the wire keeps only an audience a producer is allowed to name.

**Done when** the three document fan-out functions are gone rather than left unused, a document
reaches account, owner and by-name subscribers through the one walk, and echo suppression and the sync
gate are proven through the walk rather than only at the functions they came from.

**Landed.** See [overlay.md](./overlay.md) § Stage B.

### Stage C — Document locks

Convert the `doc.lock` adapter. Locks already report through `outboundDeliveryOutcome`, so nothing has
to be chosen here — what the stage owes is that the suppressed session and the idle-replica reporting
survive the move to the shared walk rather than being quietly dropped.

**Gated on** [shared-planners](../shared-planners/plan.md) § Stage H only if that stage is in flight —
it renames the subject this adapter reads, and editing `locks.go` twice is the thing to avoid rather
than a dependency in either direction.

**Done when** one walk delivers every message, the lock path's suppression and idle-replica reporting
are intact, the operator-visible keys are written down, and `broadcastRawToAccount` has no caller left
— Stage A removed the audience one, this stage removes the lock one.

**Landed.** See [overlay.md](./overlay.md) § Stage C.

### Stage D — The vocabulary covers the wire

Pin the family the corpus does not name but the service delivers, and delete the SPA branch that no
sender can reach.

The stage was scoped to every unpinned type on the wire. Looking at how each one reaches a socket
narrowed it to two changes, and moved a third elsewhere:

- **`document_lock` is pinned.** It is delivered through `deliverOutbound`, holds a row in
  `deliveryPolicies`, and is absent from the corpus — the one case where a family the table routes is
  known to one side only.
- **The lifecycle frames and the batch ack stay out.** Each is a reply or a lifecycle signal written
  to the one connection it concerns, addressed to no audience, so pinning them would make the corpus
  mean something other than a message with recipients — see § Starting position.
- **The `app_version` branch is deleted** from the SPA. Unreachable: no Go path sends that type.
- **The sync frames are not this project's.** See § The sync path belongs to shared planners.

**The corpus guard already exists.** Both tests are exact and bidirectional — Go compares family and
subtype counts each way, the SPA asserts an exact key-set match — so adding a family on one side
already turns the other red. This stage does not build that property; it decides what belongs inside
the set the property guards. One consequence: the corpus, `ClientMessageKinds` and `MESSAGE_KINDS`
move in a single change, because either file alone is a red suite.

**Done when** every family the delivery table can route is in the corpus, the unreachable SPA branch
is gone, and adding a family to either side alone fails a test.

**Landed.** See [overlay.md](./overlay.md) § Stage D.

**One thing this stage found and did not fix.** `subscribe_ack` is sent — `QueueSubscribeAck` writes
it to the socket after an explicit `subscribe`, which the SPA sends on every scoped document
subscription — and the SPA has no branch for it, so it falls through `applyRemoteMessage` to
`console.warn("[realtime] no handler for message family", …)`. The ack is documented as optional for
clients and nothing waits on it, so this is console noise rather than a behaviour defect, and it
predates this project.

It is left alone because both available fixes are somebody else's call. Handling it means deciding
what a client does with an ack it has never needed; silencing it means `applyRemoteMessage` learning
which types it is allowed to ignore, which is a second list of frame names beside the corpus — the
duplication this project exists to remove. The honest shape is that the browser's dispatch has no
notion of "a frame addressed to me alone", and giving it one is a change to the SPA's realtime client
rather than to the vocabulary.

### The sync path belongs to shared planners

`sync_started`, `sync_data`, `sync_complete` and `sync_error` are built by the `sync` package, and
nothing reads them. The SPA has never referenced them — not in application code, not in tests, not
anywhere in this repository's history.

**They are never sent, rather than sent and ignored.** `handleSyncWS` is reachable only from the
reader's `case "sync":`, and the SPA sends no such message: its sends are `session_resume`,
`subscribe`, `unsubscribe`, `active_planner`, the document-lock frames and `ping`. So nothing is
enqueued, the queue never has work, and the frames are never produced. The coordinator, the queue,
the processor and the timeout all run for the life of the process on behalf of a client half that was
never written here.

This is residue from the retired websocket-realtime project, whose survivals
[shared-planners](../shared-planners/plan.md) § Stage G holds — see § Absorbed from the retired
websocket-realtime project there. That stage owns the account-shaped baseline and is not started, so
removing this implementation now would take away the precedent before its replacement is designed.
Baseline behaviour is also outside what this project owns — see [contents.md](./contents.md)
§ Does not own.

`skipWhileSyncing` stays with it. The gate never fires today because no client syncs, but it is the
seam Stage G needs once an owner-scoped baseline exists, and stripping it as dead would have to be
rebuilt by that stage.

## Wire compatibility

| Change | Shape |
|--------|-------|
| Stage A — the family on the deliver subject | **Migrate-required, and contained.** Two publishers and one subscriber, all in this repository, all core NATS with no durable to drain. Nothing outside the audience path sees it |
| Stages A–C — the internal shape and the one walk | No wire change. In-process only; every subject, stream, durable and filter is untouched |
| Stage B — the delivery log's keys | No wire change. `route_kind` names the audience rather than the owner kind, and `owner_kind` carries what it used to — a runbook change rather than a contract |
| Stage D — pinning `document_lock` | Additive. Names a family already delivered |
| Stage D — deleting the `app_version` branch | No wire change. SPA-internal, and no sender exists to break |
| Converging the projections | **Breaking, migrate-required**, and deliberately not in this project. One decision per family, later |

## Open questions

Both of this project's open questions are answered. They are kept here with their answers rather than
deleted, because each was a reason a stage could not proceed.

- **Whether the sync frames have a reader at all** — **no, and they have no sender either.** Neither
  half was ever built in this repository, so the frames are never produced. They are not pinned and
  not removed here: see § The sync path belongs to shared planners.
- **Where `Subtype` comes from for a type that has none** — **always the subject segment, never the
  frame.** These are two vocabularies at two layers rather than two sources for one field.
  `PublishToAudience` takes the subtype as a parameter and `parseDeliverSubject` reads it back, so
  delivery has it without opening a body it forwards unread; the frame's own subtype, where it has
  one, is the browser's vocabulary. `staticData` shows they are separate — its subject segment says
  `sdeBuildUpdated` while its frame carries no subtype at all — and notifications coincide only
  because one producer passes the same string to both. So the table may key on `Outbound.Subtype`,
  which has one source; what it must not do is assume the frame agrees.

## Stage status

**All four stages are landed, and promotion drafts are written.** What is left is the fold-in into
live SoT, which is not this project's to take alone: `realtime-message-routing` is still in flight and
its overlay cites this plan as load-bearing explanation, so promoting ahead of it would leave live
documentation describing the finished shape while an overlay claims to change it. The folder also
stays after promote for the same reason. See [promote/README.md](./promote/README.md) § Sequencing.

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — the shape and one adapter | **Landed.** `Outbound`, the family-keyed table and one walk; the audience subscription is an adapter; the family rides the subject; audience delivery reports the shared outcome. See [overlay.md](./overlay.md) § Stage A |
| B — documents | **Landed.** The document dispatch is an adapter, the three fan-outs are gone, and the sync gate is the first policy the table actually varies. `route_kind` now names the audience with `owner_kind` beside it — see [overlay.md](./overlay.md) § Stage B |
| C — document locks, and one outcome | **Landed.** The lock subscription is an adapter, `broadcastRawToAccount` is gone, and one finisher composes every fan-out log including the rejection branch. Taken now because shared-planners § Stage H has not started — see [overlay.md](./overlay.md) § Stage C |
| D — the vocabulary covers the wire | **Landed.** `document_lock` is in the corpus and in both sides' vocabulary, carrying no kinds; the lifecycle frames and the batch ack stay out because the corpus is messages addressed to an audience rather than frames a socket is handed about itself; the unreachable `app_version` branch is deleted. The sync frames left this project — see § The sync path belongs to shared planners. Both open questions are answered. See [overlay.md](./overlay.md) § Stage D |
