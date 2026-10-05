# Shared planners — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project makes the planner an explicit thing a user works in: one owner block on every scoped
document, planner and membership documents, grants as owner keys, an active planner on the
connection, and a document lock two members contend for. It also owns the release every open project
ships in and the order of its `prepareRelease` steps.

The backend half is in and matches the plan closely: Stages A, B, C, D, F1, G1–G5, H and J are borne
out by code, and Stages I and K are correctly reported as not started. Two things need attention.

**Stage E is reported as landed with nothing outstanding, and its title feature does not exist.**
Nothing in `services/` constructs a `planner`-kind owner, so no custom planner can be created, and
because only that kind admits by invite, the invite and join endpoints refuse every request. The SPA
calls neither. What shipped under Stage E is corporation and alliance planners plus the machinery a
custom planner would use.

**The release is not ready to rehearse.** Five steps other projects owe are absent from
`prepareRelease`, one of them built but defective, and two operator rehearsals are still owed. Because
corporation planners are reachable today, a shared planner with two people ships in this window
whether or not custom planners do, which makes G6, Stage I and Stage K release questions rather than
later work.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 — project docs | Complete | Folder, plan, overlay, contents, three measurements | this folder | confirmed |
| A — the owner block | Landed on dev; live window not run | `MetaData.Owner` is the only scope field; four owner kinds; stamp and gate are release steps | `services/shared/models/metaData.go`, `owner.go`; `stampMetaOwner`, `verifyMetaOwner` in `services/core/commands/prepare_release.go`; `services/shared/mongo/retired_fields_test.go` | confirmed |
| B — grants and scopes as owner lists | Landed | One `SessionGrants{OwnerKeys}`; `Client.Scopes` and `Client.Ceiling` are `models.OwnerKeys`; stored grants rewritten by the release | `services/shared/models/session_grants.go`; `services/websocket/server/client.go`; `repairSessionGrants` step | confirmed, with residue |
| C — planner and membership documents | Landed (C1–C4) | Three collections named and schema-maintained; `planner.Planner`, `planner.Membership`, `JoinMethod.Kind()`; backfill step; `OwnerKeysForAccount`, `AccountMayReach`; `tasks planners` | `services/shared/mongo/names.go`, `planner_get.go`; `services/shared/models/planner/planner_documents.go`; `release_account_planner.go`; `tasks.go` | confirmed, one registration gap |
| D — what a second member breaks | Landed (D1, D3; D2 skipped) | `selectedSetup` / `setupToBuildFrom`; planner extras hook; `PUT /planners/{owner}/settings`; `backfillPlannerExtrasCategories` step | `frontend/src/Components/Edit Job/Edit Job Hooks/useSelectedSetup.js`; `frontend/src/Hooks/React Query/plannerSettings.js`; `services/api/v1endpoints/planners/putSettings.go` | confirmed |
| E — custom planners | Landed, nothing outstanding | Settings document, planners listing, naming an account, corporation or alliance planner, `active_planner`, switcher, `X-Planner-Owner`, owner in query keys, invite and join endpoints, grants rewrite on membership change. **Absent:** any creation of a `planner`-kind owner; any SPA invite or join call; group templates on the owner block; archive and statistics in `PlannerHeldCollections()` | `services/api/v1endpoints/planners/create.go` (`plannerName` has no `planner` case); no caller of `models.PlannerOwner` outside its own file; `frontend/src/Functions/Endpoints/Private/planners.js`; `services/shared/models/group_template.go` | **overstated** |
| F — ESI providers | F1 landed; reshaping deferred; access lists out of scope | Reconcile called from the grants task and the cloud token sweep; weekly inactive-account cleanup | `services/worker/tasks/esi/update_account_session_grants.go`, `services/worker/tasks/maintenance/cloud_stored_esi_refresh.go`; `services/shared/mongo/planner_membership_put.go`; `services/core/scheduler/jobs.go` | confirmed |
| G — realtime under more than one writer | Landed except G6 | Planner loader; delivery position; settings handler; no `sync` package under `services/websocket/`; G6 logged rather than asserted | `frontend/src/Functions/DocumentLoad/loadPlannerDocuments.js`; `services/websocket/server/integration_position_test.go`; `frontend/src/WebSocket/handlers/documentMessage.js`; `services/api/v1endpoints/jobdocuments/live_full_loop_test.go` line 170 | confirmed |
| H — the lock stops being account-shaped | Landed (H1–H4) | `lockScope` keeps the bare id for an account and the owner key otherwise; waitlist entries carry the account; `doc.lock.{ownerKey}`; every socket lock frame resolves its own owner against the ceiling | `services/shared/core/documentlock/redis.go`, `waitlist_entry.go`; `services/shared/nats/subjects.go`; `services/websocket/server/doc_lock_ws.go` (`lockFrameOwner`); `integration_doclock_planner_test.go` | confirmed |
| I — where the grants ceiling is read from | Not started | A failed fill is a logged caveat at login and refresh; the ceiling is read from the connection | `services/api/v1endpoints/authenticate.go` line 192, `refresh.go` line 344; `clientScopeCeiling` in `services/websocket/server/ws_active_planner.go` | confirmed |
| J — the SPA is not the only writer | Landed | `heldByThisAccount` computed per reader; force-release answers 409 for another account; `quotedCharacterHash`; group-delete release; whole-chain load | `services/shared/core/documentlock/status_pipeline.go`; `services/api/v1endpoints/documentlocks/handlers.go` line 114; `frontend/src/Functions/Skills/quotedCharacter.js`; `frontend/src/Functions/Groups/releaseJobsAfterGroupRemoved.js`; `frontend/src/Functions/Helper/getAllRelatedJobs.js` | confirmed (deleted-job path not traced) |
| K — the lock between two people | Not started | Every behaviour the stage lists is present as described | `services/shared/core/documentlock/redis.go` (5-minute and 24-hour leases), `atomic.go` (force-release deletes the waitlist; release deletes the key and promotes nobody); `frontend/src/Hooks/DocumentLock/useLockExtendLoop.js` line 69 | confirmed |
| Release — steps already in | The list in § Every open project ships in this window | The step list matches, in the order stated | `services/core/commands/prepare_release.go`, `release_backup.go`, `rewrite_owner_scoped_ids.go` | confirmed |
| Release — steps owed | Five steps from four projects | None is in the list | same file; `services/core/commands/job_identity_encode.go`; `services/shared/models/job.go` line 357 | confirmed (owed) |

### Discrepancies

1. **Stage E.** `PUT /api/v1/planners/{owner}` names a planner the account can already reach; it does
   not create one. `PlannerOwnerFromHandle` refuses a handle with no membership row, and `plannerName`
   answers `planner: "planner" has no naming rule` for the custom kind. `models.PlannerOwner` has no
   caller. `Owner.AdmitsByInvite` is true only for that kind, so `POST /planners/{owner}/invites` and
   `POST /planners/join` cannot succeed for any planner that exists. The overlay says so in one
   sentence ("every invite is refused until custom planner creation lands") while the plan's status
   row says nothing is outstanding. The SPA's planner endpoint module exports a listing, the naming
   call and the settings pair, and nothing for invites.
2. **What a planner owns is half applied.** [plan.md](./plan.md) § What a planner owns moves
   `archived_jobs`, the statistics collections and both group template collections to the planner.
   `PlannerHeldCollections()` returns `jobs`, `job_documents`, `job_groups` and `planner_settings`.
   `GroupTemplateCatalog` still carries `AccountID` with `_id` the account id, and
   `OwnerScopedIDCollections()` has no template entry. The archive is owner-stamped and reads through
   `helper.RequestPlannerOwner`, so it is planner-scoped in storage, but it is read for the planner in
   the `X-Planner-Owner` header, and its query keys are built by `plannerQueryScope`, which always
   takes the active planner. The plan's "read across planners without switching" is not what runs.
3. **The Deployment Tool's collection list lacks `planner_settings`.** `knownCollections` in
   `deployment-tool/internal/dataplane/mongo/collection_names_test.go` holds `planners` and
   `planner_memberships` only, while `services/shared/mongo/names_test.go` tells an editor to update
   that list. Nothing fails because no index spec or preimage entry names the collection, which is
   also why the gap is invisible. `PreimageCollections` omits it too; a settings document's `_id` is
   its owner key, so a delete still routes, but it is the only delivered planner-held collection
   without pre-images.
4. **`upgrade_scopes` is removed from the reader and survives in two places.** A comment in
   `services/websocket/server/types.go` line 52 and an operation name in
   `services/websocket/server/ws_message_operation.go` line 35.
5. **`github.com/google/uuid` is not retired.** [plan.md](./plan.md) § A planner's id and its name
   says the standard library replaces it; eight non-test files under `services/` still import it,
   `api/v1endpoints/planners/invites.go` among them, and `go.mod` lists it as indirect.
6. **`SettingsUpdate` is wider than the plan says.** § Every other planner setting is in the same
   insert-only trap says it carries only `ExtrasCategories`. It carries `MarketLocations` (committed)
   and `ReprocessingSettings` (uncommitted, with an untracked
   `services/shared/models/planner/reprocessing.go`, which is reprocessing-rebuild Stage F in flight).
   Stage J's audit sentence "six of the seven planner settings are read by nothing" is stale for the
   same reason: the market locations frame reads the planner's copy.
7. **The plan's model blocks have drifted from the code.** The types live in the package
   `services/shared/models/planner/`, the membership type is `planner.Membership`, and the schema
   constants are `planner.SchemaCurrent`, `MembershipSchemaCurrent` and `SettingsSchemaCurrent`.
   `MetaData` also carries `Revision`, and its `SessionID` is `json:"-"`. The § Schema versioning block
   shows the four base constants at 2 and the statistics one at 1; `document_schema.go` holds 1, 1, 1,
   1 and 2, which agrees with the plan's own later statement that no version moves.
8. **The plan names two id forms for a custom planner.** § The owner key is the identity and the
   overlay's decision table say ULID; § A planner's id and its name says UUID, and the comment on
   `MembershipID` assumes a UUID. Nothing mints either.
9. **The plan settles group templates both ways.** § Collection layout and § What a planner owns say
   planner-held; the struck-through entry in § Open questions says they are an account's personal
   library and take no owner block.
10. **Invention entry ids.** § What the other projects owe says existing rows are rewritten to uuids.
    The step in the list, `normaliseExtrasAndInventionRows`, rewrites a wrongly typed value into the
    shape its model writes, which for a numeric id is its digits as a string. The collision the uuid
    was introduced to remove is left in the stored rows.
11. **Overlay hygiene.** [overlay.md](./overlay.md) has two Stage F sections, one headed "F1 landed"
    and one "Not landed"; its Stage B header says the wire shape is still owed while its last line
    says nothing is owed; its Stage C section ends with two paragraphs describing the types as wired
    to nothing; and its Stage G section still lists keying the stores by owner as owed, which the plan
    settled. Its decision table also keeps "Settings stay account-owned; only two shared id spaces
    move", which § Settings split reversed.

## What each remaining step changes

Landed stages are described by the overlay and are not repeated: [overlay.md](./overlay.md) § Stage A
to § Stage J. What follows is everything not fully in.

### Stage A — the live window

The code is landed. What remains is the operator sequence in [plan.md](./plan.md) § Stage A against
`Public`'s data, and the two rehearsals in § Release window below. No model changes.

### Stage E — a custom planner can be created

**Today.** Creation is naming a planner the account already reaches, and the custom kind is refused
before it gets that far.

```go
// services/api/v1endpoints/planners/create.go
func (h *Handlers) plannerName(ctx context.Context, owner models.Owner) (string, error) {
	switch owner.Kind {
	case models.OwnerAccount:     // the default name
	case models.OwnerCorporation: // looked up from ESI, NPC corporations refused
	case models.OwnerAlliance:    // looked up from ESI
	default:
		return "", fmt.Errorf("planner: %q has no naming rule", owner.Kind)
	}
}
```

**After.** A route that mints an id and writes the three documents through `EnsurePlanner`. The plan
gives the document shapes and leaves the route, the request body and the creator's join-method branch
unspecified.

```json
{
  "_id": "planner:6f1c2a9e-…",
  "schemaVersion": 1,
  "name": "Friday fleet builds",
  "memberCount": 1,
  "createdBy": "<accountID>",
  "_meta": { "owner": { "kind": "planner", "id": "6f1c2a9e-…" }, "revision": 1 }
}
```

```json
{
  "_id": "planner:6f1c2a9e-…|<accountID>",
  "plannerID": "planner:6f1c2a9e-…",
  "accountID": "<accountID>",
  "joinMethod": { "owner": {} }
}
```

A member who joins by invite gets the `invite` branch, which `PostPlannerJoinHandler` already writes:

```json
{ "joinMethod": { "invite": { "invitedBy": "<accountID>", "issuedAt": "2026-10-05T10:00:00Z" } } }
```

**Work.**

1. A creation route under `/api/v1/planners`, minting the id, taking a client-supplied name, and
   enforcing the per-account planner cap [plan.md](./plan.md) § Limits names and nothing implements.
2. A `planner` case in `plannerName`, or creation bypassing it, since a custom planner's name is the
   one kind the client legitimately supplies.
3. `sessiongrants.WriteFromMemberships` after the write, so the new planner is in the creator's
   ceiling on the connection already open.
4. SPA: create, issue an invite, list and revoke invites, redeem one. None exists; the switcher only
   lists and names.
5. Leaving a planner and removing a member. § Done when requires both and no route was found for
   either; the removal path is only reached by the ESI reconcile today.
6. A two-account test through create, invite, join, save and removal, in the existing live suites.

**Wire.** Additive. New routes and a new owner kind value on handles the SPA already parses.

### Stage E — group templates on the owner block

**Today.**

```json
{
  "_id": "<accountID>",
  "schemaVersion": 1,
  "documentKind": "groupTemplateCatalog",
  "accountID": "<accountID>",
  "catalogVersion": 7,
  "templates": [{ "templateID": "t1", "payloadDocumentId": "p1" }]
}
```

**After**, from [plan.md](./plan.md) § The catalogue moves onto the owner block:

```json
{
  "_id": "account:<accountID>",
  "schemaVersion": 1,
  "documentKind": "groupTemplateCatalog",
  "catalogVersion": 7,
  "templates": [{ "templateID": "t1", "payloadDocumentId": "p1" }],
  "_meta": { "owner": { "kind": "account", "id": "<accountID>" }, "revision": 1 }
}
```

Payload documents take `_id` `{ownerKey}|{id}` and the same `_meta.owner`.

**Work.**

1. `MetaData` on both models and the `AccountID` field removed.
2. Both collections added to `PlannerHeldCollections()`, `SchemaMaintainedCollections()`,
   `OwnerScopedIDCollections()` (payloads) and the release's backup list.
3. A `prepareRelease` step rewriting catalogues and payloads under `account:{id}`, after the owner
   stamp.
4. Template reads and writes through `RequestPlannerOwner`, and two-owner authorisation on apply:
   `AccountMayReach` for the template's owner and again for the destination.
5. `customStructureID` dropped or resolved when a template is applied into another planner.
6. Owner in the SPA's template query keys.

**Wire.** Migrate-required for the stored shape. Not breaking for the client, which sends bare ids.
Blocked on the decision in § Group templates below.

### Stage E — archive and statistics read for an owner the request names

**Today.** The archive list reads the planner in the header, and the header is the active planner.

```js
// frontend/src/Hooks/React Query/Backend/plannerQueryScope.js
export function plannerQueryScope(root) {
  return plannerOwnerQueryScope(root, activePlannerOwnerHandle() ?? "");
}
```

**After.** The archive page names an owner of its own. `plannerOwnerQueryScope(root, owner)` already
exists for the key; the request needs the owner in its path or a header the page sets, rather than
the one `applyPrivateHeaders` adds for every private call. The statistics route already takes its
owner in the path (`/api/v1/statistics/{owner}/{view}`).

**Work.** An owner picker on the archive and statistics pages; archive endpoints taking the owner as
a parameter of the request; keys built from the owner asked for. Blocked on the decision in
§ Archive and statistics below.

**Wire.** Additive if the path form is added beside the header form; breaking for the SPA only if the
header form is removed, which this cutover can absorb.

### Stage F — what is deferred

Nothing is being built. The grant task fires on every login and refresh and resolves the whole set
(`services/worker/tasks/esi/update_account_session_grants.go`); it is correct. Access lists wait on a
permission model. The `AccessListEntry` branch exists on `JoinMethod` and nothing writes it.

### Stage G6 — a personal planner's jobs stop following a member into other planners

**Today.** A switch keeps the account's key, and that key delivers everything it owns.

```go
// services/websocket/server/ws_active_planner.go
func activeScopes(accountID string, active models.Owner) models.OwnerKeys {
	return models.NewOwnerKeys().
		Add(models.AccountOwner(accountID)).
		Add(active).
		Normalized()
}
```

```text
connection scopes after switching to a corporation planner:
  account:abc            -> accounts, account_settings, watchlist_deprecated  (wanted)
                         -> job_documents, job_groups owned by account:abc    (not wanted)
  corporation:corp_…     -> job_documents, job_groups, planner_settings
```

**After.** The delivery gate is the pair [plan.md](./plan.md) § What a connection subscribes to
already describes: an owner and a collection set. The account subscription carries
`AccountOwnedCollections()` only; the planner subscription carries `PlannerHeldCollections()` for the
active owner. When the active planner is the personal one, both rows carry `account:abc`.

**Work.**

1. Delivery checks the collection against the set for the subscription that matched, using
   `CollectionsForOwnerKind`, which today gates subscribe and not delivery.
2. The connection records which owner is the active planner, or holds two scope sets instead of one.
3. Turn the logged case in `live_full_loop_test.go` into the assertion it stands in for.
4. Decide what `planner_settings` for the personal planner does while a member is elsewhere; the SPA's
   settings store keeps every planner's, so it can keep arriving.

**Wire.** Not breaking. A connection receives less. Blocked on the decision in § G6 below only in
the choice of mechanism.

### Stage I — where the grants ceiling is read from

**Today.** The fill is best-effort and the ceiling is a snapshot.

```go
// services/api/v1endpoints/authenticate.go
if granted, err := mongo.OwnerKeysForAccount(ctx, accountID); err != nil {
	logs.AttachHandlerCaveat(r, "account_session_grants_resolve_failed", …)
} else if err := sessions.SetGrants(ctx, accountID, granted); err != nil {
	logs.AttachHandlerCaveat(r, "account_session_grants_update_failed", …)
}
```

A session issued after either failure holds an empty or stale ceiling, so a shared planner missing
from it is refused at `active_planner` for the life of that session while every REST route, which
reads the membership rows, still works.

**After.** One stated source. The plan lists three shapes and chooses none; see § The grants ceiling
below.

**Work.** Depends on the choice. In every case: a test that a session whose fill failed can still
switch into a planner it holds a row for, and closing auth-hardening #53 against the answer.

**Wire.** Not breaking under any of the three. The read-through and live-read options add a Mongo
read to `active_planner`.

### Stage K — the lock between two people

**Today.**

```go
// services/shared/core/documentlock/redis.go
const DefaultLockTTL = 5 * time.Minute            // contested lease
const SoloHolderLockTTL = 24 * time.Hour          // nobody waiting or viewing
const MaxExtensionsBeforeHandoffConsult = 3       // then the probe names the waiter
const ProbeAckWaitSeconds int64 = 20              // waiter's tab claims automatically
const WaitlistPulseTTL = 2 * time.Minute

type LockRecord struct {
	HolderSessionID      string `json:"holderSessionID"`
	AccountID            string `json:"accountID"`
	ExpiresAtUnix        int64  `json:"expiresAtUnix"`
	LeaseMode            string `json:"leaseMode,omitempty"`
	ExtendCount          int    `json:"extendCount,omitzero"`
	ProbeTargetSessionID string `json:"probeTargetSessionID,omitempty"`
	ProbeExpiresAtUnix   int64  `json:"probeExpiresAtUnix,omitzero"`
}
```

The SPA extends only while visible (`useLockExtendLoop.js`), the release script deletes the key and
promotes nobody, the force-release script deletes the whole waitlist, nothing releases on disconnect,
and `pagehide` sends a beacon for viewer presence only.

**After**, from [plan.md](./plan.md) § Stage K, Decided 1–5:

| | Today | After |
|---|---|---|
| Lease with nobody waiting | 24 hours | 15 minutes, renewed by an edit |
| Lease with someone waiting | 5 minutes, extended while the tab is visible | 15 minutes renewed by editing, one hour at most |
| Hand-over | After three extends, automatic, holder not asked | Offered to the holder, two-minute countdown, accept or decline, goes through unanswered |
| Holder's connection drops | Nothing | Released five minutes later, passed to the waitlist head |
| Leaving the page | Nothing for the lock | A `pagehide` beacon releases |
| Force-release | Deletes the waitlist | Keeps other members' entries, lease starts contested |
| Release | Deletes the key | Promotes the live waitlist head |
| Lease expires on an editor | Edits are written over or lost | Edits stay in the open editor, marked unsaved, rebased through the change-review panel on retaking the lock |
| Switching planner with a job open | Release goes to the new planner, old lock orphaned | Every held scope yielded against the planner being left first |
| Copy | "another tab" everywhere | "another member is editing this job" or "your other tab", chosen by `heldByThisAccount` |

The plan does not give the record's new fields. An hour cap needs the time the lease first became
contested, and an offer needs its deadline and its answer; a disconnect release needs the websocket
service to know which locks a connection's session holds.

**Work.**

1. Lease constants and the acquire, extend and cycle-reset scripts in `atomic.go` reworked for the
   15-minute and one-hour rules; the extend call sent on an edit rather than on a visible-tab timer.
2. A hand-over offer event to the holder, accept and decline operations, and the two-minute expiry.
3. Release-on-disconnect in the websocket service with a five-minute grace, cancelled on resume.
4. `releaseLockScript` promotes through `findAliveHead`; force-release stops deleting `k_wait`.
5. SPA: `pagehide` release beacon; viewer presence refreshed on the heartbeat; lock scopes keyed by
   planner and yielded before the header moves; held edits kept on expiry through the draft store.
6. Copy chosen by `heldByThisAccount` on the edit page and the planner.
7. Lock events filtered to loaded ids and holder changes, plus a periodic batch resync.
8. The two-member tests the stage lists as owed, on `crossClientHarness.js` and the websocket
   integration suite.

**Wire.** Breaking between SPA and API for the lock's events and operations, absorbed by the cutover.
Lock records are ephemeral and need no migration; a 24-hour lease taken before the deploy cannot
exist on live, because the window stops traffic and `Public` has no shared planner.

### Release window — the steps owed

**Today.** `prepareRelease` holds 26 steps for release `0.9.0`, in the order
[plan.md](./plan.md) § Every open project ships in this window states. The owed ones:

| Step | Stored shape today | After | State of the code |
|---|---|---|---|
| Entity refs on stored jobs | `build.costs.linkedJobs[].corporation_id: 98000001` | `corporation_ref: "corp_…"`, `protected.spec` current | `tasks encodeJobIdentity` exists outside the release and enumerates on `_meta.accountID` (`job_identity_encode.go` line 55), which the owner stamp leaves behind on documents that existed before it (`release_meta_owner.go`) but which no job created afterwards carries, since `models.MetaData` has no such field; the sweep therefore misses every job written on this build. No verify gate |
| Extras category slugs | `extrasCosts[].category: "0"` or `""` | `"unassigned"`, `"hauling-service"`, … | Not written. `models.ExtrasCategoryUnassigned` is still `"0"` |
| Group membership onto the job | group holds `includedJobIDs` | job holds `groupID`; orphans repaired | Not written. job-groups Stage A not started |
| Group loses derived fields | derived sets on the group | `outputTypeIDs` on the group, `areComplete` on the job | Not written. job-groups Stage B not started |
| Reprocessing settings onto the planner | account `reprocessingSettings` with `preferCompressed` and three multipliers | planner `reprocessingSettings` `{compressedOre, countLeftoversAsSold, buyOutright, shipping, neverChoose}` | Model and `SettingsUpdate` field in the working tree, uncommitted. No release step |

**After.** All five in the list at the positions the plan gives, the entity-ref gate beside the two
existing gates, and `backfillPlannerExtrasCategories` folded into one step that merges every planner
setting an account still holds.

**Work.**

1. Fix the `encodeJobIdentity` enumeration to read `FieldMetaOwnerID`, remove its entry from
   `retiredFieldExceptions`, add the step after `stampMetaOwner` and a gate counting `RawIDFilter()`.
2. The four unwritten steps, each with its owning project's stage.
3. Add any new target collection to the list `releaseTouchedCollections()` is built from.
4. The rehearsal that has never run: drop the three planner collections on a restored copy of live,
   run the whole sequence, check the copy step records zero for each, revert, and check they are
   dropped ([plan.md](./plan.md) § Owed to the release, not to a stage).
5. Confirm the SDE rebuild step after the window, since the reprocessing file changes shape.

**Wire.** Migrate-required, all in the one window. No `*SchemaCurrent` constant moves.

### Small corrections found on the way

1. Add `planner_settings` to the Deployment Tool's `knownCollections`, and decide whether it joins
   `PreimageCollections`.
2. Remove the two `upgrade_scopes` leftovers.
3. Retire `github.com/google/uuid` or strike the claim; see § Planner id below.
4. Bring the overlay's stale sections and the plan's model blocks into line (Discrepancies 7 and 11).
5. Repoint the fourteen `archived-jobs-stats` links once that folder's move is committed.

## Decisions needed

### What Stage E ships in this release

**Question.** Does this release include custom planners (create, invite, join, leave, remove), or
does it ship corporation and alliance planners only and move custom planners to a stage of their own?

**Why it is James's call.** The plan's goal, its § Why custom planners are built before corporation
planners and four of its § Done when lines all assume custom planners; the code built the corporation
path first and stopped. An implementer cannot tell whether the status row is a mistake to correct or a
scope that quietly changed.

**Options.**

- *Build it now.* The backend is close: one route, one naming case, the caps, a leave and a remove
  route. The SPA is the larger half, with no screen for any of it yet.
  Keeps the plan's done-when intact and exercises invites before live sees them.
- *Defer it.* Mark Stage E partial, split custom planners into a new stage after the window, and
  rewrite the four done-when lines for this release. The invite endpoints ship unreachable, which is
  harmless because they refuse. The release gets smaller, and the first two-person planner live sees
  is a corporation one, whose roster nobody can edit.

**Recommendation.** Defer, and say so in the status table. The release already carries every other
open project, the invite surface has no caller to break, and the lock and delivery work below matters
to a corporation planner on day one in a way custom planners do not.

**Blocked until decided.** The creation route, all invite and roster UI, the member caps, and the
wording of § Done when.

### Planner id form, and the uuid dependency

**Question.** Is a custom planner's id a UUID or a ULID, and is `github.com/google/uuid` retired?

**Why it is James's call.** The plan states both id forms, and states the dependency is retired when
eight files import it. The id form is permanent once the first planner exists.

**Options.** UUID from the library already imported, which matches the `MembershipID` comment and
needs no new code. UUID from the standard library, which is what the plan asks for and needs checking
against the module's Go version (1.27.0) before anyone relies on it. ULID, which sorts by creation
time and needs a new dependency.

**Recommendation.** UUID, from whichever of the first two is available, and one sentence in the plan
replacing both ULID mentions. Sort order by creation is not something a planner id is used for.

**Blocked until decided.** Only the creation route. The dependency clean-up is independent.

### Group templates: the planner's, or the account's

**Question.** Do group templates move onto the owner block and become planner-held, or stay an
account's library?

**Why it is James's call.** The plan answers both ways (Discrepancy 9), and the planner-held answer
costs a model change, a release step and two-owner authorisation on apply.

**Options.**

- *Planner-held*, as § What a planner owns argues: a corporation can hold standard builds, and
  `customStructureID` on a preset resolves against the planner whose settings it names. Migrate-required
  in this window, or a second migration later.
- *Account-held*, as the code is: no migration, and applying a personal template into a shared planner
  must still drop or resolve `customStructureID`, because that reference is to a planner's settings
  either way.

**Recommendation.** Planner-held, and in this window. The catalogue is the last model with a bare
`AccountID`, the rewrite is the same shape as the owner stamp, and doing it later means a release of
its own for two small collections.

**Blocked until decided.** The template release step, and whether the template collections join the
id rewrite and the backup list before the rehearsal.

### Archive and statistics: follow the active planner, or name their own

**Question.** Is the archive read for the active planner, as it runs, or for an owner the page names,
as [plan.md](./plan.md) § The archive is read across planners without switching says?

**Why it is James's call.** It is a screen behaviour: whether the archive page gains a planner picker
of its own, separate from the header's.

**Options.** Leave it following the active planner: nothing to build, and one planner at a time is
consistent with every other page. Give the archive and statistics pages their own owner: a member can
compare their personal archive with a corporation's without dropping their live work, at the cost of
an endpoint parameter and a second planner control on two pages.

**Recommendation.** Leave it following the active planner for this release and strike the section's
present-tense claims; revisit when the archive page is next redesigned.

**Blocked until decided.** Nothing in the window. The plan's § Wire compatibility row for SPA query
keys describes the unbuilt behaviour until it is.

### G6: what separates the account's documents from its personal planner's

**Question.** Is delivery on the account key limited by collection, or by comparing each document's
owner with the active planner?

**Why it is James's call.** The plan leaves it open in so many words, and the answer fixes the shape
of a connection's subscription state.

**Options.** By collection: the account subscription carries `AccountOwnedCollections()` and the
planner subscription `PlannerHeldCollections()`, which is the pair the plan already designs and uses
tables that already exist. By owner comparison: keep one scope set and drop a planner-held document
whose owner is the account while another planner is active, which is a special case for one kind.

**Recommendation.** By collection. It is the documented design, it has no kind-specific branch, and
the SPA already drops what is not its planner as a second line.

**Blocked until decided.** The G6 slice, and the assertion document-write-granularity's loop test is
waiting to turn on.

### The grants ceiling: stored, read live, or read through

**Question.** Where does `active_planner` get the set of planners a session may switch into, and does
a failed fill refuse the session?

**Why it is James's call.** It is Stage I in full, it closes auth-hardening #53, and it trades a
database read per switch against a failure mode users would meet as "my corporation planner does not
update".

**Options.**

- *Stored, fill fatal.* Login and refresh fail when the ceiling cannot be written. Simple, and turns
  a Mongo or Redis blip into a failed sign-in.
- *Stored, read through.* Keep the snapshot and the announcement that narrows it; when a named owner
  is absent from the ceiling, read the membership row once and widen. A failed fill heals on the first
  switch, and revocation still arrives by announcement.
- *Read live.* No stored list; every switch and every lock frame's check reads Mongo. Cannot go stale,
  and puts a round trip behind the waitlist pulse unless that check is cached anyway.

**Recommendation.** Stored with read-through on a miss, the fill left tolerated. It keeps the pulse
cheap, keeps the place a revocation is applied, and removes the only user-visible consequence of a
failed fill. The fire-and-forget announcement remains a known gap and is worth a periodic re-read of
the ceiling per connection.

**Blocked until decided.** Stage I, and auth-hardening #53.

### Which steps gate the window

**Question.** Of the five owed steps, which must be in before the release is rehearsed, and which are
explicitly deferred?

**Why it is James's call.** The plan says the window opens once the last open project is in "or
explicitly deferred", and names nobody's step as deferrable. Each deferral is a second migration
later.

**Options.** Hold the window for all five. Or gate on the two that are cheap and already designed
(entity refs, extras slugs) and defer job-groups A and B and reprocessing F3 with their SPA work,
accepting that each then needs its own release step in a later build, with the schema version moving
for the first time.

**Recommendation.** Hold for entity refs, extras slugs and reprocessing F3, since its model is already
in the working tree; decide job-groups on how far its Stage A is when the others are in. Whatever is
deferred is written into [plan.md](./plan.md) § Every open project ships in this window as deferred.

**Blocked until decided.** The whole-sequence rehearsal, and so the live cutover.

### Invention entry ids: digits or uuids

**Question.** Does the release mint a uuid for each numeric invention entry id, or leave the digits
the normalising step writes?

**Why it is James's call.** Two plans say uuid and the step does digits; minting changes ids on 196
live documents that nothing else references.

**Options.** Digits: nothing more to do, both shapes already read, and two rows that collided before
the change still share an id and are still removed together. Uuids: one more pass in
`normaliseExtrasAndInventionRows`, and the collision is gone from stored data.

**Recommendation.** Mint uuids in the same step. The window exists, the rows are few, and a string of
digits is a shape no writer produces any more.

**Blocked until decided.** Nothing else; it is one function.

### Whether Stage K gates the window

**Question.** Does the lock rework land before live gets its first two-person planner?

**Why it is James's call.** Stage K's rules are decided, its build is the largest remaining piece, and
corporation planners make every behaviour it lists reachable the day the window closes.

**Options.** Gate on all of it. Gate on the subset that loses work or strands a job: release on
disconnect and `pagehide`, the planner-switch release, force-release keeping the waitlist, and the
copy. Or ship as is and follow with K, accepting a hand-over the holder is not asked about.

**Recommendation.** Gate on the subset. Asking the holder and the 15-minute lease change how the lock
feels; the subset is what stops it being wrong.

**Blocked until decided.** The order of Stage K's work items, and the date of the window.

### Refs reaching the browser on a change delivery

**Question.** Is an organisation planner's ref allowed to reach a browser in `docID`, `document._id`
and `document._meta.owner.id`?

**Why it is James's call.** [plan.md](./plan.md) § Stage G, G5 records it and defers it, while
entity-id-encryption's standing rule is that a ref is converted at the last hop. Only one of those
can be the position at release.

**Options.** Accept it: the value is ciphertext and nothing reads it. Strip `_meta.owner` from the
delivered document and emit the owner handle as the id of an owner-keyed document, which touches the
watcher's raw `_meta` copy and `BareDocumentID`.

**Recommendation.** Strip it before the window. It is a wire shape, and the cutover is the cheap time
to change one.

**Blocked until decided.** Nothing; it bounds what `TestOwnerHandleKeepsRefsOffTheWire` can claim.

### Open questions the plan carries that block nothing yet

**Question.** Job status labels per planner or per account; who administers a corporation planner;
whose blueprint ME and TE apply on a shared planner; ownership transfer and deletion of a planner;
whether an archived row shows who archived it.

**Why it is James's call.** Each is a product position, listed in [plan.md](./plan.md) § Open
questions without an answer.

**Options and recommendation.** Leave all five open for this release. The only one with a code
consequence today is the administrator: `PutPlannerHandler` records whichever member first names a
corporation planner as `CreatedBy`, which is arbitrary but unread, because a corporation planner
takes no invites.

**Blocked until decided.** Nothing in the window. Ownership transfer blocks custom planners being
deletable, if they are built.

## Dependencies and order

**This project waits on** nothing for its own stages. Its release waits on entity-id-encryption
(§ Converting stored documents, two defects), document-defaults (Track B), job-groups (Stages A and
B) and reprocessing-rebuild (F3), each of which owes one `prepareRelease` step, and on the two
rehearsals.

**Waiting on this project.** auth-hardening #53 waits on Stage I. document-write-granularity's loop
test waits on G6. reprocessing-rebuild F3 writes its step beside this project's planner backfill and
is asked to absorb `backfillPlannerExtrasCategories`. job-groups is unblocked. entity-id-encryption
and collection-naming keep their folders until this project closes. changestream-tenant-scale's
Phase B becomes the only isolation between tenants once a shared planner carries traffic.

**Claims about other projects that checked out.** archived-jobs-stats reports all four owed items
done. changestream-tenant-scale records Phase C as withdrawn. auth-hardening records Stage H landed
and #53 handed here. market-pricing-defaults' seed is the step in the list. job-document-drafts' two
steps are in the list. document-write-granularity's revision step is in the list, and its Stage D
confirms the group lease no longer covers member jobs, which Stage K should read before reworking the
scripts.

**Claims that did not.** reprocessing-rebuild reports Stage F as not started while its model and
`SettingsUpdate` field are in the working tree. planning-stage-panels and this plan both say invention
ids become uuids in the window; the step writes digits.

**Recommended order.**

1. Correct the Stage E row and decide its scope. Documentation only, and it changes what the rest of
   the list is for.
2. G6, by collection. It is the one measured defect on a path a corporation planner uses today, the
   mechanism is designed, and a test is waiting.
3. The entity-ref step: fix the enumeration, add the gate, put both in the list.
4. The remaining owed steps as their projects deliver them, then the whole-sequence rehearsal with the
   planner collections dropped first.
5. Stage I as read-through.
6. Stage K, the subset first.
