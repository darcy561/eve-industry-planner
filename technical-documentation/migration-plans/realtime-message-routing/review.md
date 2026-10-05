# Realtime message routing — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes). No file
under `services/websocket`, `services/shared/nats` or `frontend/src/WebSocket` is modified or
untracked in `git status --short`, so the committed tree is the tree reviewed for this project.

## Summary

The project separates *who receives a realtime message* from *what it means*. What the plan says has
landed has landed, and more cleanly than the plan's own starting-position text now admits: one walk
(`deliverOutbound`) delivers every family, the `deliver.{audience}.{target}.{family}.{subtype}` space
exists with one subscriber, both non-document producers publish to it, and the per-family subscriber
files are gone. The pieces still open are the ceiling index (Stage B), the `members` audience (Stage C
step 4) and the SPA destination for one (Stage D).

Two things most need attention. First, the premise the project is parked on is stale: the plan says
the ceiling is "copied out of the session record at connect and never refreshed", but
`applySessionGrantsChanged` → `setClientCeilingAndScopes` already re-derives `Client.Ceiling` in place
when an account's grants are rewritten, which is exactly the first of the two outcomes § What this
project is waiting on says would let Stage B proceed with no mechanism of its own. What remains in
[shared-planners](../shared-planners/plan.md) § Stage I is a decision, not a build, and that plan's own
text argues for the stored list. Second, the walk this project owns tests the owner only, while
shared-planners § What a connection subscribes to says the delivery gate is an owner *and collection*
pair and carries that gap as G6; neither plan says which project adds the collection dimension to
`Outbound`.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---------------|-----------|----------------|----------|---------|
| Phase 1 — project docs | Complete | Folder, plan, overlay, contents and section row exist | this folder; `../contents.md` row | confirmed |
| A — retire the downward-match checks | Landed | No `ScopesPayload`, `AllianceRecipientMatchesDownward` or `scopesFromDocOrMeta` anywhere under `services/`; one walk in `deliverOutbound`; outcome detail carries `owner_ref` beside `route_kind` | `services/websocket/server/outbound.go` (`deliverOutbound`, `clientHoldsTarget`), `dispatch.go` (`outboundDeliveryDetail`), tests `TestAllianceScopeReachesAClientHoldingNoCorporationKey` in `owner_distribution_test.go` and `TestIntegrationAllianceOwnerReachesAMemberHoldingNoCorporation` in `integration_owner_delivery_test.go` | confirmed |
| B — the ceiling index | Not started | `Client.Ceiling` exists and is set at connect and on a grants announcement; `Server` holds `ownerKeyToClients` only, no ceiling-keyed map | `types.go` (`Client.Ceiling`, `Server.ownerKeyToClients`), `handler.go:251-252`, `owner_indexes.go` (`setClientCeilingAndScopes`) | confirmed |
| C — audience routing, steps 1–3 | Landed | Subject space, parser, one subscription and per-audience fan-out; static data announced by the worker to `everyone`; notifications published to an owner's `subscribers`; no `nats_notifications.go`, `nats_static_data.go`, `SubscribeNotifications` or `notify.` subject remains | `services/shared/nats/audience.go` (`DeliverSubject`, `SubscribeAudience`, `PublishToAudience`), `notifications.go` (`PublishNotification`), `topics.go` (`AnnounceStaticDataBuild`), `services/websocket/server/nats_audience.go`, `server.go:80-82`, producers `services/worker/tasks/sde/update/core_metric_push.go:18` and `sde/rollback/rollbackVersion.go:55`, `services/worker/tasks/archivedjobs/notify.go:27`; tests `audience_test.go` (`TestTheAudienceSpaceDoesNotOverlapTheExistingFamilies`), `audience_live_test.go`, `audience_delivery_test.go`, `integration_audience_test.go` | confirmed |
| C — done-when "adding a family touches no websocket Go file" | Part of the stage's done-when | A new family must be added to `deliverableFamilies` or it is refused as `unknown_family` | `outbound.go` (`deliverableFamilies`, `deliverOutbound`), test `TestAFamilyWithNoPolicyIsRefused` | overstated |
| C — step 4, the `members` audience | Outstanding | No `members` constant, constructor or candidate branch | `audience.go` declares `AudienceEveryone` and `AudienceSubscribers` only; `outbound.go` `candidatesFor` has no third wire audience | confirmed |
| D — SPA destination | Not started | `applyRemoteMessage` routes four families; the notification table has one handler, which reads no owner | `frontend/src/WebSocket/applyRemoteMessage.js`, `handlers/notificationMessage.js` | confirmed |
| § Starting position — `document_lock` row and vocabulary note | `broadcastRawToAccount`, the account in the subject; absent from `ClientMessageKinds`, `messageKinds.js` and the corpus; "this project does not change it" | Delivered by `deliverOutbound` with the `subscribers` audience and the planner owner, from `doc.lock.{ownerKey}`; present in all three vocabularies | `nats_doc_lock.go` (`deliverDocumentLock`), `client_messages.go:27,48`, `messageKinds.js` (`MESSAGE_TYPE_DOCUMENT_LOCK`), `testing/fixtures/realtime-messages/kinds.json` | overstated (stale) |
| § What this project is waiting on — "never refreshed" | The ceiling is a snapshot taken at connect | The ceiling is replaced in place on `session.grants.changed` and the connection's scopes narrowed to it | `nats_session_grants.go` (`applySessionGrantsChanged`), `owner_indexes.go` (`setClientCeilingAndScopes`) | understated |

**Discrepancies**

- *Done-when overstated.* `deliverableFamilies` is a deliberate allow-list, and live
  [backend/websocket/websocket.md](../../backend/websocket/websocket.md) § Message delivery already
  teaches it ("a family is addressable or it is not"). A new family is a publish call *plus* one map
  entry. Either the done-when is amended or the list is derived from `ClientMessageKinds` — see
  § Decisions, "The family allow-list".
- *Starting position stale on `document_lock`.* Shared-planners Stage H3 moved the lock fan-out to
  `doc.lock.{ownerKey}` and onto the shared walk, so the fifth family is no longer the odd one out the
  plan describes. [contents.md](./contents.md) § Does not own still names the subject
  `doc.lock.{accountID}`; so does the corpus entry's `why` ("the tabs of the account that owns it") and
  the live docs `core.md` and `websocket.md`, which shared-planners' promote owes.
- *Waiting-on premise stale.* The revocation push the plan hoped for exists. What is open in
  shared-planners § Stage I is whether the stored ceiling stays the source, and that plan's own text
  says the stored list "is where a revocation is applied, which is the argument for keeping it".
- *A detail Stage B should know.* At connect, `Scopes` and `Ceiling` are the same list
  (`handler.go:251-252`); they diverge only when the client sends `active_planner`. So the owner index
  and the ceiling index are identical for a connection that has not switched.

## What each remaining step changes

### Stage A — the owner delivery walk

Landed; see [overlay.md](./overlay.md) § Stage A and live
[backend/websocket/websocket.md](../../backend/websocket/websocket.md) § Message delivery.

### Stage C steps 1–3 — the audience subject space and the two producers

Landed; see [overlay.md](./overlay.md) § Stage C.

### Stage B — the ceiling index

**Today.** One reverse index, keyed by the scopes a connection holds, excluding the account's own key:

```go
// services/websocket/server/types.go
ownerKeyToClients map[string]map[string]bool // owner key -> client_id set
ownerIndexMu      sync.RWMutex

// services/websocket/server/owner_indexes.go
func (s *Server) addToOwnerPoolsLocked(client *Client)        // from pooledScopes(client)
func (s *Server) removeFromOwnerPoolsLocked(client *Client)
func (s *Server) setClientScopes(client *Client, next models.OwnerKeys)
func (s *Server) setClientCeilingAndScopes(client *Client, ceiling, scopes models.OwnerKeys)
```

Added at connect (`handler.go:273`), removed at disconnect (`reader.go:72`), rebuilt on a planner
switch (`ws_active_planner.go`) and on a grants announcement (`nats_session_grants.go`). `HostedTenants()`
and `HostedTenantCount()` (`hosted_tenants.go`) read it, and so does the `ws.owner_connected_clients`
gauge (`metrics.go`).

**After.** A second map beside it, keyed by `Client.Ceiling`, with the same account-key exclusion so an
account's own tabs keep being found through `userConnections`:

```go
ceilingKeyToClients map[string]map[string]bool // owner key -> client_id set, from Client.Ceiling
```

Maintained in three places only: added in the connect path beside `addToOwnerPoolsLocked`, removed in
the disconnect path beside `removeClientFromOwnerPools`, and re-indexed inside
`setClientCeilingAndScopes` (the grants announcement). `setClientScopes` — the planner switch — does not
touch it. `HostedTenants()`, `HostedTenantCount()` and the fan-out filter reconcile
(`fanout_filters.go`) do not read it.

**Work.**

1. The map and a `clientsEntitledTo(owner models.Owner) []string` snapshot in `owner_indexes.go`,
   under the existing `ownerIndexMu`.
2. Add/remove hooks at `handler.go:273` and `reader.go:72`; re-index in `setClientCeilingAndScopes`.
3. Tests: entitled-not-subscribed found by the entitled lookup and not the subscribed one; a grants
   narrowing removes the entry; `HostedTenantCount()` unchanged by its presence (extend
   `hosted_tenants_test.go`).
4. Overlay § Stage B.

**Wire.** None. In-process only.

### Stage C step 4 — the `members` audience

**Today.** `candidatesFor` answers `everyone`, `subscribers` and the internal `doc_subscribers`;
`audienceOutbound` (`nats_audience.go`) accepts the first two off the wire and leaves anything else as
the zero audience, which the walk reports as `unknown_audience`. A notification body already names the
owner it is about:

```json
{"type":"notification","subtype":"archiveStatsProcessed",
 "data":{"ownerKind":"corporation","ownerID":"corp_56_JxK","processedAt":"2026-10-05T09:00:00Z"}}
```

published on `deliver.subscribers.corporation:corp_56_JxK.notification.archiveStatsProcessed`.

**After.** A third wire audience. Subject shape unchanged:

```text
deliver.members.corporation:corp_56_JxK.notification.<subtype>
```

```go
// services/shared/nats/audience.go
const AudienceMembers Audience = "members"
func Members(ownerKey string) Delivery

// services/websocket/server/outbound.go
case eipnats.AudienceMembers:            // candidatesFor: s.clientsEntitledTo(out.Target)
case eipnats.AudienceMembers:            // clientHoldsTarget: client.Ceiling.Has(out.Target)
```

No producer exists for it yet; the plan's motivating case ("a corporation planner telling its members
something while each of them is working in a different planner") has no subtype in
`ClientMessageKinds`. The first slice needs a fixture producer at least.

**Work.**

1. `AudienceMembers`, `Members()` and the `audienceOutbound` branch.
2. `candidatesFor` and `clientHoldsTarget` branches reading the Stage B index and `Client.Ceiling`.
3. Decide and record the suppression rule (§ Decisions).
4. Tests mirroring `audience_delivery_test.go`: a member in another planner receives it, a
   non-member does not, an account addressed by owner key is reached through `userConnections`.
5. Live doc note for promote: the `route_kind` table in websocket.md § What an operator sees gains
   `members`.

**Wire.** Additive — a new audience token on a new subject; no existing message changes shape. An old
websocket paired with a new producer reports `unknown_audience` and delivers nothing, which is the
same mixed-deploy behaviour § Stage C already accepts.

### Stage D — what the SPA does with a message about a planner it is not in

**Today.** `applyNotificationMessage` looks up the subtype in `NOTIFICATION_HANDLERS` and the one
handler invalidates the archive queries and shows a snackbar; nothing reads `ownerKind` or `ownerID`.
The planner switcher (`frontend/src/Components/Header/Components/plannerSwitcher.jsx`) is a `Select`
over `usePlannersQuery()` with no per-planner indicator.

**After.** The plan leaves the destination open (snackbar offering a switch, a badge on the planner
list, or something else). Whatever it is, the handler has to turn the owner in the body into a planner
the reader can recognise. That raises a shape problem the plan does not mention: the audience path
forwards the frame unread, so `ownerID` arrives as the entity ref the producer held (`corp_56_JxK`),
not the raw id the SPA's owner handles use. Document deliveries solve this in `ClientPayload`
(`outgoinglogic`) with the websocket's `entityCipher`; audience frames have no such step by design.

**Work.** Blocked on § Decisions, "Where a members message lands" and "Who makes the owner readable".

**Wire.** Additive if the body gains a display-ready owner field; the SPA vocabulary is unchanged.

## Decisions needed

### Build Stage B and the members audience against the stored ceiling now

**Question.** Does this project proceed on the assumption that `Client.Ceiling` stays a stored snapshot
refreshed by `session.grants.changed`, or does it stay parked until shared-planners Stage I is decided?

**Why it is James's call.** The plan parks itself on Stage I, and Stage I is shared-planners' decision.
But the code already implements one of the two outcomes the plan names, and shared-planners § Stage I
argues for that outcome ("the stored list is not only a cache — it is where a revocation is applied").
An implementer cannot un-park a project another plan has gated.

**Options.**

- *Build now on the stored ceiling.* Stage B indexes `Client.Ceiling`; the index re-derives in
  `setClientCeilingAndScopes`, which already runs on every announcement. If Stage I later picks "read at
  the switch", the index has no source and the members audience needs § Why the publisher does not
  derive the member list reopened — the rework is the whole of Stage B and C4, which is small.
- *Wait for Stage I.* No rework risk; the project stays parked with nothing to build, and the
  `members` case shared planners wants stays unavailable.
- *Take Stage I here.* Not this project's to take; its contents.md says so.

**Recommendation.** Build now. Record in `plan.md` that § What this project is waiting on is satisfied
by the current code under the first outcome and that Stage I choosing the second would reopen B and C4.

**Blocked until decided.** Stage B, Stage C step 4, Stage D.

### The suppression rule for `members`

**Question.** Does a `members` message skip the connection that caused it?

**Why it is James's call.** The plan lists it as open and says to decide per audience before routing
one more family through the table.

**Options.** Suppress nothing (what `everyone` and `subscribers` do today; the frames carry no source);
or let a producer name a source session and have the walk skip it (the `Source` field already exists
on `Outbound`, so the cost is a subject or body field for the producer to fill).

**Recommendation.** Suppress nothing, matching the two audiences already on the path, and revisit only
when a producer names an actor. Say so in the overlay.

**Blocked until decided.** Stage C step 4 tests.

### Where a members message lands, and who makes the owner readable

**Question.** Where does the SPA put a message about a planner the reader is not in, and which side
turns the owner ref in the body into something a browser can name?

**Why it is James's call.** It is a product choice (snackbar offering a switch, a badge on the switcher,
a planner-list entry) and it decides the payload shape. The readability half also touches a stated
design property: the audience path forwards frames unread.

**Options.** For the destination: a snackbar with the planner's name and a switch action; a badge on
the planner switcher entry; a stored inbox (the plan already rejects this for connected-only
announcements). For readability: the producer builds a browser-readable handle into the body (the
worker gains an `entityid.Cipher` dependency, which the API already has); or the websocket rewrites the
body (breaks "forwarded unread" and gives the websocket a file that knows what a notification is); or
the body carries the planner's display name, resolved by the producer from the planner document.

**Recommendation.** Snackbar with a switch action, and the producer puts the planner's display name and
owner handle in the body — the producer is the one place that knows what it is announcing, and the
websocket stays ignorant of families.

**Blocked until decided.** Stage D entirely; the body shape of the first `members` producer.

### The family allow-list

**Question.** Does Stage C's done-when "adding a family touches no websocket Go file" stand, given
`deliverableFamilies`?

**Why it is James's call.** The allow-list is a safety choice (an unknown family is reported rather than
fanned out on a default) that live SoT already teaches; the done-when was written before it.

**Options.** Amend the done-when to "touches one line of one websocket Go file"; or derive
`deliverableFamilies` from `eipnats.ClientMessageKinds` minus `maintenance`, so the shared vocabulary is
the single source and the websocket has no list of its own.

**Recommendation.** Derive it: `ClientMessageKinds` is already the pinned vocabulary and `maintenance`
is the one family that is generated rather than received, which the live doc already explains. One
source instead of two parallel lists is the repository's rule.

**Blocked until decided.** Nothing; a small follow-up either way.

### Which project adds the collection dimension to the walk

**Question.** Shared-planners § What a connection subscribes to says the delivery gate is an owner
*and collection* pair and carries the gap as G6; `clientHoldsTarget` tests the owner only and
`Outbound` has no collection. Which project's slice changes the walk?

**Why it is James's call.** Two plans claim adjacent ground. This project owns the walk and says
nothing about collections; shared-planners owns G6 and the collection-set-per-owner-kind table (C4) but
not the walk. An implementer picking either plan would edit the other's surface without a mandate.

**Options.** File it under G6 with this project's `Outbound` gaining a `Collection` field and
`clientHoldsTarget` consulting the per-kind table; or widen this project with a stage of its own; or
solve it upstream in the changestream by publishing personal-planner job documents under a key other
than `account:{id}` (changes the `doc.update` subject contract #20 locked, and changestream-tenant-scale
lists that as a non-goal).

**Recommendation.** One slice under shared-planners G6 that edits `outbound.go`, with this project's
overlay recording the walk's new rule. Not the upstream option.

**Blocked until decided.** G6 in shared-planners; document-write-granularity's live loop assertion for
the account-owned case.

## Dependencies and order

- **Waits on:** shared-planners § Stage I only, and only as a decision (see the first decision above).
  Cited swarm-stack material resolves: `../swarm-stack/overlays/20-selective-fanout.md` exists.
- **Waited on by:** shared-planners' corporation-planner announcements (the `members` case); G6's walk
  change if it is filed as recommended.
- **Cross-project pointers to correct at the next touch:** this project's contents.md sends "hosted
  tenants and the JetStream filter subjects" to `changestream-tenant-scale/contents.md`, whose own
  § Does not own sends them back out to live websocket.md and swarm-stack #20. The live owner is
  [backend/websocket/websocket.md](../../backend/websocket/websocket.md) § Hosted-tenant query view.
  Shared-planners' contents.md has the same misdirected pointer.
- **Recommended next slice:** once the first decision is taken, Stage B and Stage C step 4 as one
  slice — the index, the `members` audience, a fixture producer, and the tests listed above — followed
  by the `deliverableFamilies` derivation. Stage D after the destination decision.
