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
contained account and delivery ran downward. It now sits in front of a correct check and can only
subtract.

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

With them gone the two branches differ only in the owner kind they build and the label they log —
collapse them into one owner walk. That is the consolidation the later stages need, arrived at from
the other side.

**Done when** one function delivers owner-scoped changes for every owner kind, the downward matchers
are gone rather than left unused, and a test proves an alliance-planner client receives alliance
changes while holding no corporation key — the case the removed check would have rejected.

### Stage B — The ceiling index

Mirror the owner index with one built from `Ceiling`, giving an entitled-clients lookup beside the
subscribed-clients lookup. Add on connect, remove on disconnect. Keep it out of `HostedTenants()`.

Nothing consumes it yet; it is the index Stage C routes on.

**Done when** a client entitled to an owner but not subscribed to it is found by the entitled lookup
and not by the subscribed one, and hosted-tenant counts are unchanged by its existence.

### Stage C — Audience routing

Carry `audience` and `target` on the wire and route on them rather than on the family name. One
subscriber and one dispatch table replace the per-family subscriber files. The fan-out primitive
moves out of the static-data file to sit beside the others, in the one place a fan-out is chosen.

Two consequences worth stating: the notification path stops discarding every non-account tenant,
which it does today because corporation and alliance tenants had no clients of their own when it was
written; and a new family becomes a publish call.

**Gated on** § What this project is waiting on for the `members` audience. `everyone` and
`subscribers` do not depend on it.

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
| Stage A — removing the downward checks | No wire change. Delivery only widens, to recipients the owner check already admitted |
| Stage B — the ceiling index | No wire change. In-process index only |
| Stage C — `audience` / `target` on the subject | **Breaking, migrate-required.** Publishers in core, worker and api and the consumer in websocket must ship together. All in-repo Go, one coordinated deploy |
| Stage C — the `members` audience | Additive. New capability; no existing message changes shape |
| SPA message vocabulary | Unchanged throughout. Audience never crosses to the browser |

## Open questions

- **Where a `members` message lands in the SPA** — a snackbar offering a switch, a badge on the
  planner list, or something else. Stage D.
- **Whether the audience travels in the subject or the envelope.** The subject is preferred: it keeps
  the property that a notification is forwarded without being parsed, it matches how document
  routing already encodes its key, and it is visible in NATS tooling. The envelope would avoid the
  subject rename and the coordinated deploy. Settle before Stage C.
- **Whether Stage C rides this pass or a later one.** Stages A and B are additive and stand on their
  own; Stage C is the only breaking change here.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — retire the downward-match checks | **Not started.** No dependencies; ready to pick up |
| B — the ceiling index | **Not started.** No dependencies; ready to pick up |
| C — audience routing | **Not started.** The `members` audience is gated on [shared-planners](../shared-planners/plan.md) § Stage I — see § What this project is waiting on |
| D — the SPA destination for a members message | **Not started.** Owes the payload shape Stage C needs |
