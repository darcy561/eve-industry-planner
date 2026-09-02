# Shared planners — behaviour overlay

How each part works **after** the change that landed it. Live docs remain the truth wherever this
file is silent; where it speaks, it wins for the duration of the project.

Sections are added as stages land. An empty section means the stage has not landed — not that the
behaviour is undocumented.

## Stage A — The owner on a document

*Not landed.*

Owed here when it does: the shape of `_meta.owner`, which documents carry it, what the schema version
bump selects, how the changestream reads it, what `documentschema.Upgrader` fills in and when that
compatibility path is removed.

## Stage B — Backfill, indexes and renames

*Not landed.*

Owed here: the task name and how an operator runs it, what it does per batch and how it resumes, the
rename entries and their version, the new indexes, and what the changestream collection groups and
websocket subscribe allow-list look like afterwards.

## Stage C — Reading by owner

*Not landed.*

Owed here: which filters changed, which indexes serve them, and the point after which a rollback is no
longer available.

## Stage D — Contract

*Not landed.*

Owed here: what was removed, and confirmation that no reader remains for the legacy field.

## Stage E — Grants and scopes

*Not landed.*

Owed here: the grant list shape, how the ceiling is computed per provider, the owner handle to owner
key conversion points, the `upgrade_scopes` and `scopes_ack` message shapes, and how the two grant
shapes coexist for one session lifetime.

## Stage F — Planners and membership

*Not landed.*

Owed here: the planner document, the membership document, their indexes, the provider interface, how
the account planner is created, and what the roster endpoints refuse on each provider.

## Stage G — What a second member breaks

*Not landed.*

Owed here: where the extras category ids and the job status id set live once they are the planner's,
what recalculation now preserves and how a job's build context survives another member editing it,
and what the close cascade's persist gate covers.

## Stage H — Custom planners

*Not landed.*

Owed here: creation and its limits, the invite token lifecycle and how it is stored, the join path,
what a request for a planner without a membership row returns, the shared authoriser, the revocation
path end to end, and the client's active planner — where it is held, how it persists, and how a scoped
query key is built from it.

## Stage I — ESI providers

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
| Owner decided at creation, never inferred | Attribution derived from a correlated field is wrong exactly where it is hardest to notice |
| Expand/contract over a maintenance window | A failed backfill leaves a mixed database; expand/contract keeps every intermediate state readable |
| Renames bundled with the backfill | The entire cost of a rename is touching live data, which the backfill is doing anyway, and the SPA subscriptions that a rename breaks are small and account-based today |
