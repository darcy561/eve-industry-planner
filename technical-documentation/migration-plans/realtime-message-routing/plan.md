# Realtime message routing

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

A realtime message should say **who receives it**. Today it says what family it belongs to, and the
audience is inferred from that family by a Go file written for it.

That held while every family had exactly one audience. Adding the Static Data Export announcement
broke it: the announcement goes to every connected client regardless of who is signed in, which no
existing family did, so it arrived with a subscriber file and a fan-out helper of its own. The next
family that wants an audience an existing one already has will either import across a file named for
something else or write a third copy.

Separating the two lets a new message be a publish call rather than a Go file, and lets one family
carry more than one audience — which is the case shared planners needs: a corporation planner telling
its members something while each of them is working in a different planner.

## Starting position

Four families exist. Each has a hand-written path from NATS to a socket, and each knows its own
delivery rule:

| Family | Producer | Delivery | Audience rule |
|--------|----------|----------|---------------|
| `document` | JetStream `doc.update.…` | [`dispatch.go`](../../../services/websocket/server/dispatch.go) | scopes, plus explicit doc subscriptions |
| `notification` | [`nats_notifications.go`](../../../services/websocket/server/nats_notifications.go) | `broadcastRawToAccount` | the account named in the subject |
| `maintenance` | [`maintenance.go`](../../../services/websocket/server/maintenance.go) | `closeLocalClients` | every client, then close the socket |
| `staticData` | [`nats_static_data.go`](../../../services/websocket/server/nats_static_data.go) | `broadcastRawToEveryClient` | every client |

`broadcastRawToEveryClient` is the tell: a general fan-out primitive living in a file named for the
one family that needed it.

**The subject can only express one tenant.** `notify.{tenantString}.{subtype}` has a single owner
slot, so the SDE announcement cannot use it at all — it travels
`core.metrics.sde.build.updated` and is translated into a client frame by hand. That translation is
why a new notification subtype costs a Go subscriber today rather than a constant.

**What is already right, and stays.** `type` and `subtype` are one vocabulary defined on both sides
and pinned by a shared corpus. The SPA's notification family is already table-driven. Nothing here
proposes changing either.

**Two delivery checks test a scope shape that can no longer exist.** The corporation and alliance
branches in `dispatch.go` each run a downward-hierarchy check in front of the owner check.
`AllianceRecipientMatchesDownward` reads the client's **corporation** scope to decide whether it sits
under the alliance — but a connection's scopes are rebuilt on every planner switch as exactly the
account key plus the active planner, so a client in an alliance planner holds no corporation key at
all. The check is asking about the pre-owner-system hierarchy, where alliance contained corporation
contained account and delivery ran downward. It now sits in front of a correct check and would only
subtract — but `scopesFromDocOrMeta` reads a `scopes` field off the change document or its preimage
and nothing writes one, so both matchers are handed empty scopes on every message and already pass
everything. The mechanism is dead at both ends rather than harmful at one.

## Meaning and audience are two questions

`type` is doing two jobs that have come apart:

```
type     = what this message is           → which handler the SPA runs
subtype  = what to do within that family  → which entry in that handler's table
audience = who receives it                → which fan-out the server uses
```

Audience is **server-side only**. It is consumed by the websocket process and never reaches the
browser, which already knows it is a recipient. So it does not enter the `type` / `subtype`
vocabulary, the shared corpus, or the SPA.

## The audiences

Three, because the connection indexes can answer three questions:

| Audience | Recipients | Read from |
|----------|-----------|-----------|
| `everyone` | every local socket | the client map |
| `subscribers` | every connection whose scopes contain the owner | the owner index |
| `members` | every connection **entitled** to the owner, subscribed or not | the ceiling index (new) |

`subscribers` covers the account case without one of its own: an account key is in a connection's
scopes for the whole of its life, so an account's tabs are subscribers to the account's own planner.
The account path keeps its existing index rather than being folded in — see § The ceiling index is
not a hosted tenant.

**Maintenance stays outside this.** It is a write followed by a socket close, sequential and with a
write deadline so a dead peer does not hold the rest. Folding "and then close the socket" into
audience would make audience mean two things.

## The audience travels in the subject

Not the envelope. The subject keeps the property that a notification is forwarded without being
parsed, it matches how document routing already encodes its key, and it is visible in NATS tooling.

The deciding reason is the migration rather than any of those. A new subject space is disjoint from
the subjects the existing families travel, so the new delivery path can be built, deployed and
exercised while every family still arrives by its old path, and publishers move across one at a
time. An audience field in the envelope would leave both paths reading the same subjects, which
means either double delivery or one coordinated cutover of every publisher and the consumer
together. See § Stage C.

## Subscribed is not entitled

A connection carries two owner sets, both derived server-side from the session the upgrade
authenticated. The browser contributes to neither.

```
Ceiling  every planner the membership rows grant     fixed for the connection's life
Scopes   the account key plus the active planner      replaced on every switch
```

The client's only input is one owner handle in the `active_planner` message, and it is **refused** —
not narrowed — when it is outside the ceiling. A manipulated client cannot widen its own reach.

`Ceiling` is exactly "which planners is this connection a member of", and nothing reads it for
delivery today; its only reader is the switch check. Indexing it is what makes the `members` audience
possible, and the index is simpler than the scopes index it mirrors: add on connect, remove on
disconnect, never touched by a switch.

## Why the publisher does not derive the member list

The alternative considered was deriving the member list at publish time and sending one message per
member. The membership rows are indexed both ways, so the query exists. It was rejected on three
counts:

- **It gives every producer a Mongo dependency.** Publishing a notification is a marshal and a
  publish today, touching no database. Requiring a member query first puts that dependency on the
  publish path in core, worker and api alike, and the second producer copies the first.
- **It sends to everyone who could be connected in order to reach the few who are.** The publisher
  cannot know who is online — that is per-replica connection state. A planner with two hundred
  members and three online costs two hundred messages, of which nearly all are received, parsed and
  discarded by every replica. The existing design inverts this, and the reasoning for the single
  wildcard notification subscription already says so: delivery is where connectedness is known.
- **It makes membership a second source of truth.** The ceiling is derived once, by one function, at
  grant time. Deriving the member list again at publish time means two places compute who belongs to
  a planner, and they disagree for anyone whose membership moved mid-session.

Its one real advantage is freshness: publish-time derivation reads live rows. That is the staleness
question, and it belongs to shared planners rather than here — see § What this project is waiting on.

**It would be the right mechanism** for a message that must reach members who are **offline** — mail,
push, a stored inbox — or one whose payload differs per member. Neither describes an announcement
that is one fact, identical for everyone, and useful only to someone connected.

## The ceiling index is not a hosted tenant

`HostedTenants()` feeds the per-replica JetStream filter subjects for the document fan-out durables,
and its count feeds placement and capacity telemetry. It is built from **subscription**.

The ceiling index stays out of it. Adding entitlement would have every replica advertise interest in
every planner any of its clients might belong to, widening **document** filters for a case that is not
about documents, and inflating a count that means "tenants with a client here".

Messages on the `members` audience therefore travel core NATS unfiltered, as every non-document
family already does. If they ever become high-volume, widening the filters is available then, and is
additive.

## What this project is waiting on

`Ceiling` is copied out of the session record at connect and never refreshed, so a membership that
changes mid-session is not seen until the connection is remade. That affects this project — a
`members` audience is only as current as the ceiling — but the decision is **not this project's**:
[shared-planners](../shared-planners/plan.md) § Stage I owns where the ceiling is read from, and
§ Losing access owns how a revocation reaches a connection that has already switched. Stage E owes
the revocation path; Stage F owes the grant task's shape.

What this project needs from that answer:

- **If the ceiling stays a stored snapshot with a revocation pushed over the fan-out**, the ceiling
  index re-indexes on that push and this project needs no mechanism of its own.
- **If the ceiling becomes a read at the moment of the switch**, there is no stored ceiling to index
  and the `members` audience needs a different source — most likely a membership read on the publish
  path after all, which reopens § Why the publisher does not derive the member list.

**Stage A and Stage B below do not depend on this and can proceed.** Stage C is where it bites.

A note on what the staleness costs today: these messages are contentless by design — a notification
says something happened and carries no figures, and the refetch behind it is authorised
independently. So a stale ceiling leaks the existence of an event, not its content. That is the bar
the existing families already set, but it should be an accepted answer rather than an inherited one.

## Stages

### Stage A — Retire the downward-match checks

The corporation and alliance delivery branches each run a downward-hierarchy check in front of the
owner check. Remove both call sites and the matchers behind them, leaving the owner check as the
single rule.

The producer goes with them. Nothing writes the `scopes` field `ScopesPayload` is built from, so it
is already always absent — this stage deletes a mechanism that is inert at both ends, which makes it
a removal rather than a change in who receives what.

With them gone the two branches differ only in the owner kind they build, the label they log and
which of two outcome fields they set — collapse them into one owner walk. That is the consolidation
the later stages need, arrived at from the other side. Those two fields reach only the delivery
log's detail map, so the collapse turns two operator-visible log keys into one owner ref beside the
route kind that is already there.

**Done when** one function delivers owner-scoped changes for every owner kind, the matchers and the
scopes payload behind them are gone rather than left unused, and a test holds the alliance-planner
client that holds no corporation key. That test guards the shape rather than proving a fix: with the
scopes always empty the removed check passed it too, so what it stops is the check being reasoned
back in.

**Landed.** See [overlay.md](./overlay.md) § Stage A.

### Stage B — The ceiling index

Mirror the owner index with one built from `Ceiling`, giving an entitled-clients lookup beside the
subscribed-clients lookup. Add on connect, remove on disconnect. Keep it out of `HostedTenants()`.

Nothing consumes it yet; it is the index the `members` audience routes on. That consumer is gated on
§ What this project is waiting on, so this stage lands with it rather than ahead of it: an index, a
lock, connect and disconnect hooks and a hosted-tenant exclusion test is a lot of unread machinery to
leave standing against a decision that is deliberately unscheduled.

**Done when** a client entitled to an owner but not subscribed to it is found by the entitled lookup
and not by the subscribed one, and hosted-tenant counts are unchanged by its existence.

### Stage C — Audience routing

Carry `audience` and `target` on the wire and route on them rather than on the family name. One
subscriber and one dispatch table replace the per-family subscriber files. The fan-out primitive
moves out of the static-data file to sit beside the others, in the one place a fan-out is chosen.

Two consequences worth stating: the notification path stops discarding every non-account tenant,
which it does today because corporation and alliance tenants had no clients of their own when it was
written; and a new family becomes a publish call.

**Built beside the old paths, not in place of them.** The audience subject space is disjoint from the
subjects the existing families travel, so a message arrives by the new path or an old one according
to which subject its publisher chose, and never by both. The whole non-document surface is two
publish calls, so the migration is:

1. Add the subject space, the single subscriber and the dispatch table. Nothing publishes to it yet.
   Prove delivery from a fixture publishing on the new subject, and prove the two subject spaces
   cannot overlap.
2. Move the static-data publisher, an `everyone` audience. Its subscriber goes quiet: delete it, and
   lift the general fan-out out of the file named for the one family that needed it. The producer is
   the worker, not the `core.metrics.sde.build.updated` topic — that subject has two other consumers
   deriving from a build, and stays as the internal event.
3. Move the notification publisher, a `subscribers` audience, fixing the non-account-tenant discard
   as part of the move. Delete that subscriber.

   Settle where the notification frame is built before starting. `PublishNotification` wraps the
   envelope and the publish together, and `PublishToAudience` takes a frame already built — so the
   move either hand-rolls that envelope at the call site or a third copy of it appears. The frame
   builder wants splitting out of `PublishNotification` so both paths call it. Deleting that
   subscriber also removes the last caller of `SubscribeNotifications`, which goes with it.
4. The `members` audience and the ceiling index behind it, once § What this project is waiting on
   has an answer.

Each step ships on its own, and at every one of them a real announcement can be watched arriving in
the app. The browser sees the same frame throughout — audience never crosses to it — so none of this
is visible to the SPA.

**Suppression is a property the table has to carry.** The document paths skip the connection that
made the change; the non-document families do not, and cannot — a notification is forwarded with no
source ids on it at all. That difference is invisible while each family has its own subscriber, and
becomes a silent choice the moment one table routes all of them. Decide per audience at step 1 and
say so, rather than inheriting whichever behaviour the first family through the table happened to
have.

**Gated on** § What this project is waiting on for the `members` audience only. Steps 1 to 3 do not
depend on it.

**Done when** no delivery path branches on a family name, adding a family touches no websocket Go
file, and the SPA vocabulary and its shared corpus are unchanged.

### Stage D — What the SPA does with a message about a planner it is not in

A `members` message is about a planner the reader is not looking at, so the SPA needs somewhere to
put it. That destination decides whether the payload must name the planner in a display-ready way,
which decides the payload shape — so it is a stage rather than a detail of Stage C.

**Done when** a member receives an announcement for a planner they are not in, can tell which planner
it was about, and the payload carries exactly what that destination needs.

## Wire compatibility

| Change | Shape |
|--------|-------|
| Stage A — removing the downward checks | No wire change and no delivery change: nothing writes the `scopes` field the matchers read, so both already admit everyone the owner check admits |
| Stage B — the ceiling index | No wire change. In-process index only |
| Stage C — the audience subject space | Additive. A new subject space beside the existing ones, built and deployed while every family still travels its old path |
| Stage C — moving a publisher onto it | **Migrate-required, one publisher at a time.** Each move is one publisher and its now-dead subscriber in a single change; no two publishers have to ship together |
| Stage C — the `members` audience | Additive. New capability; no existing message changes shape |
| SPA message vocabulary | Unchanged throughout. Audience never crosses to the browser |

## Open questions

- **Where a `members` message lands in the SPA** — a snackbar offering a switch, a badge on the
  planner list, or something else. Stage D.
- **Whether the `members` audience needs its own suppression rule.** The families on this path carry
  no originating connection today, so nothing is suppressed. A member announcement about a planner
  someone is not in raises it again only if a producer ever names the actor. Stage C step 4.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — retire the downward-match checks | **Landed.** One owner walk for every owner kind, the matchers and `ScopesPayload` deleted at both ends, and the delivery log naming one owner ref. See [overlay.md](./overlay.md) § Stage A |
| B — the ceiling index | **Not started.** No dependencies of its own, but its only consumer is the `members` audience, so it lands with that work rather than ahead of it — see § Stage B |
| C — audience routing | **Steps 1 to 3 landed** — the subject space, the one subscription and the fan-out per audience, both producers moved across and both their subscribers deleted, and organisation notifications reaching members for the first time; step 4 outstanding. Built beside the old paths and migrated one publisher at a time, so steps 1 to 3 ship independently; only the `members` audience is gated on [shared-planners](../shared-planners/plan.md) § Stage I — see § What this project is waiting on |
| D — the SPA destination for a members message | **Not started.** Owes the payload shape Stage C needs |
