# Shared planners — behaviour overlay

How each part works **after** the change that landed it. Live docs remain the truth wherever this
file is silent; where it speaks, it wins for the duration of the project.

Sections are added as stages land. An empty section means the stage has not landed — not that the
behaviour is undocumented.

## Stage A — The owner block cutover

*Code landed; the window has not been run.* This project owns the owner block, having taken it over
from [archived-jobs-stats](../archived-jobs-stats/plan.md), which built it while shaping the statistics
documents.

**One statement of ownership.** Every scoped document carries `_meta.owner`, a `{kind, id}` pair.
`models.Owner` is the only vocabulary: `Key()` renders `kind:id`, `ParseOwnerKey` reads it back, and
`Validate` refuses an unknown kind and holds the corporation and alliance kinds to an entity ref
rather than a raw EVE id — on read as well as construction, so an owner recovered from storage is
held to the same rule. `MetaData` carries no per-scope field; `_meta.accountID`, `_meta.corporationRef`
and `_meta.allianceRef` are gone.

**The owner is server-decided.** `PopulateRequestMeta` sets it from the authenticated account, and the
whole-struct writers — `BulkUpsertJobs`, `BulkUpsertGroups` and the archived-jobs `putHandler` — set it
on the struct immediately before their `$set`. Nothing a client sends reaches the stored owner. The
archived-jobs handler additionally refuses a batch whose job names an owner other than the caller's.

**Reads and indexes.** Query filters name `_meta.owner.kind` and `_meta.owner.id` through the
`FieldMetaOwnerKind` / `FieldMetaOwnerID` constants; every account-scoped index was respecified to lead
on the owner pair, and the account-scoped ones it replaced are in the retired list.

**A retired field cannot come back unnoticed.** `TestNoQueryNamesARetiredField` walks the module for
any quoted use of the three retired `_meta` paths, with a named exception per migration step that
legitimately reads the old shape. This exists because these paths live in `bson.M` as strings, where a
filter naming a dead field matches nothing and reports no error.

**Delivery.** `ChangeStreamMessage` carries one `OwnerKey` in place of the three route fields, and the
websocket parses it back into an owner for routing and hosted-tenant filtering.

**On the wire.** The owner does not leave the server: it is `json:"-"` on `MetaData`, and the SPA
strips `_meta.owner` from anything it sends, which a client-side test pins.

**The release path.** `tasks prepareRelease` carries every step this release owes, oldest version
first, and is safe to re-run: a step with nothing to do reports zero. Schema maintenance and the owner
stamp are marked required, so a failure in either stops the run rather than letting later steps succeed
against documents they never prepared. The stamp derives each owner from the account id on the same
document, server-side, and leaves a document with no usable account id unstamped rather than giving it
an owner addressing nothing. The final step counts documents still without an owner across all seven
collections and fails the release if any remain — which is what stops that reporting as success.

Still owed here once the window runs: the order it ran in, what the backfill and the statistics
reshape each reported, and the counts checked before traffic came back.

## Stage B — Grants and scopes

*Not landed.*

Owed here: the grant list shape, how the ceiling is computed per provider, the owner handle to owner
key conversion points, and the `upgrade_scopes` and `scopes_ack` message shapes.

Until it lands, grants are two lists. `auth.SessionGrants` carries `CorporationRefs` and
`AllianceRefs` on the account's session record in Redis, filled from ESI at token refresh by
`UpdateAccountSessionGrants`, which converts raw ids to refs on the way in. The websocket copies them
onto a connection and `filterToAllowed` compares each list separately. The account's own access is
implicit rather than a grant. `models.SessionGrants` exists with the owner-key shape but nothing reads
it.

## Stage C — Planners and membership

*Not landed.*

Owed here: the planner document, the membership document, their indexes, how a roster is kept current
per provider, how the account planner is created, what the roster endpoints refuse, and where the
grants list is filled from once membership rows replace the ESI source.

The Go types exist already — `Planner`, `PlannerMembership`, `PlannerInvite` and `JoinMethod` in
`services/shared/models/planner.go` — but no collection, index, repository or caller uses them, so
nothing here describes live behaviour yet.

## Stage D — What a second member breaks

*Not landed.*

Owed here: where the extras category ids and the job status id set live once they are the planner's,
what recalculation now preserves and how a job's build context survives another member editing it,
and what the close cascade's persist gate covers.

## Stage E — Custom planners

*Not landed.*

Owed here: creation and its limits, the invite token lifecycle and how it is stored, the join path,
what a request for a planner without a membership row returns, the shared authoriser, the revocation
path end to end, and the client's active planner — where it is held, how it persists, and how a scoped
query key is built from it.

## Stage F — ESI providers

*Not landed.*

Owed here: how a corporation or alliance roster is reconciled and when, and what a corporation planner
does not offer that a custom one does.

## Decisions taken, with their reasons

Kept here so a later reader finds the reasoning without reconstructing it from the plan's prose.

| Decision | Reason |
|----------|--------|
| One planner primitive, four membership providers | Corporation and alliance are already just ESI-sourced membership over a ceiling; a second implementation would duplicate roster, roles and archive |
| Account planner id = account id; corporation planner id = corp ref | Every tenant string, subject, lock partition and statistics key keeps its present value, so the migration touches where an owner is read from, not what it is |
| Custom planner ids are ULIDs, not entity refs | A planner id is ours to mint; the entity cipher exists for ids we must be able to hand back, which does not apply |
| One collection per document type, owner on the document | A per-kind split puts a switch on kind at every call site, multiplies watched collections and index specs, and defends the least likely leak boundary |
| Collections named for what they hold, with no owner prefix | The owner block already states ownership; a name that repeats it says the same fact twice and goes stale as kinds are added |
| An invite is a credential, a membership is a record | The membership copies the inviter and issue time at join time, so invites stay disposable under a TTL and no hashed token outlives its purpose |
| Every planner is private; no directory, search or request-to-join | The tool is a working planner, not a place to find or advertise groups; its users already know who they work with, and a directory would add moderation and spam surfaces for no benefit |
| Method-specific fields live in their own branch | A self membership carries no invite fields at all, and the populated branch is the discriminator so no stored type constant can disagree with it |
| Corporation and alliance planners cannot be invited into | They are reserved for members of the group and reached by being in it, which also removes any need to record which provider created a membership row |
| Membership rows are the single access mechanism for every kind | Deriving corporation access from grants instead would make the authoriser branch on provider, and would leave a corporation planner with no roster, no member count and nowhere to hang a permission model |
| Membership rows, not an array on the planner | Both lookup directions are on the request path, an embedded roster is a hot-write contention point, and a large alliance would approach the document size limit |
| Rows exist only for app users | EVE corporation membership is never enumerated, so roster size is bounded by planner users rather than corporation size |
| A planner id is not a credential | It appears in URLs, logs and subjects; access is a membership row, and an unknown planner returns 404 rather than confirming it exists |
| Invite tokens hashed at rest, with expiry, use count and optional account binding | The link is the credential, so it must be revocable and bounded |
| Features gated on capability, never on kind | Branching on kind makes every new kind an audit of every branch, and blocks a shared custom planner from features it obviously wants |
| Capabilities derived purely from kind and member count | The kind is a template, so planners of a kind behave identically; per-planner overrides would make two planners of one kind differ invisibly, and a stored set goes stale as capabilities are added or members join |
| Template changes are retroactive, not migrated | Nothing stores a capability set, so adding one is free and reaches every planner; narrowing eligibility is the breaking direction and carries the care of one |
| Provider derived from kind, not stored | One-to-one with the kind, so a stored field could only disagree with it |
| Hiding a feature is a display preference | An owner tired of a panel wants it hidden for themselves, not removed for the other members |
| Capability defaults follow single-member versus shared | Nearly every "corporation feature" is really a multi-member one; only ESI-backed corporation data is genuinely kind-specific |
| Membership answers access; permissions answer what you may do | Keeping them apart is what lets any permission model attach later, and lets several run on one planner at once; merging them would fix one model per planner forever |
| Permissions are separate work, with three hooks reserved | One authorisation seam, a place on the planner to name its models, and an uninterpreted `Role` field — enough to plug in in-game roles, a custom scheme, or ESI access templates without reshaping anything |
| Multiple personal planners deferred, not designed out | A solo shared planner is already the same shape, so lifting the restriction is a creation rule |
| Settings stay account-owned; only two shared id spaces move | A job stores its own results, so settings are write-time inputs the job records rather than render-time values, and the alternative was a document split with dozens of call-site moves |
| Recalculation preserves a job's build context | It currently clears `build.setup` and re-derives structure, ME and character from whoever triggered it; a lock cannot fix this because the write is legitimately authorised and only its content is wrong |
| The persist gate covers every document a close writes | The close cascade writes the whole parent/child tree but gates on the edited job's lock alone |
| The owner backfill runs after the model change, never before | The job, group and archived-job writers `$set` a whole marshalled struct, and `$set` replaces `_meta` wholesale — so until `MetaData` carries an `Owner`, every save erases a stamped one |
| Owner decided at creation, never inferred | Attribution derived from a correlated field is wrong exactly where it is hardest to notice |
| The worker stops between the image roll and the stamp | Both statistics prunes drop their `$nin` clause when the keep list is empty, so an owner-scoped read that matches nothing deletes every aggregate for that owner; the drain cron runs every two minutes |
| `MetaData` takes no `SchemaVersion` | Every persisted model already carries one at the document root, and the maintenance batch selects on that; a second inside `_meta` would be two sources for one fact |
| No upgrader for the owner — an approved deviation | Once `AccountID` is off `MetaData` nothing remains to derive an owner from, so the release step sets owner and root version together and the version's job becomes detection, gated on zero documents without an owner |
| The owner never goes on the wire | `_meta.accountID` had one SPA reader that already falls back to the store, so the client change is a deletion and no ref can reach a browser through `_meta` |
| One cutover in the deployment window, not expand/contract | The stack is coming down anyway, so nothing reads or writes while the migration runs; that removes the dual-write machinery and the erase hazard, at the cost of rollback being a database restore |
| The grant list's shape moves before its source | Converting while the values are still ESI-derived means the tolerate-both-shapes work ships against behaviour that can be checked; changing shape and source together would leave nothing to compare the result to |
| The release verifies the owner gate itself | The stamp cannot derive an owner for a document with no account id, so it reports those and returns success; without a step that fails on any ownerless document, a release finishes green over documents nothing can read and no later save repairs |
| Renames bundled with the backfill | The entire cost of a rename is touching live data, which the backfill is doing anyway, and the SPA subscriptions that a rename breaks are small and account-based today |
