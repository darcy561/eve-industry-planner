# Shared planners — behaviour overlay

How each part works **after** the change that landed it. Live docs remain the truth wherever this
file is silent; where it speaks, it wins for the duration of the project.

Sections are added as stages land. An empty section means the stage has not landed — not that the
behaviour is undocumented.

## Stage A — The owner block cutover

*Landed on the environment checked; see the plan's § Stage A for what is still unconfirmed elsewhere.*
This project owns the owner block, having taken it over from
[archived-jobs-stats](../archived-jobs-stats/plan.md), which built it while shaping the statistics
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

**On the wire.** The owner does not leave the server by the API: it is `json:"-"` on `MetaData`, and
the SPA strips `_meta.owner` from anything it sends, which a client-side test pins. A change delivery
is the exception, and an unintended one — the watcher copies `_meta` as a raw map, where the json tag
means nothing — see [plan.md](./plan.md) § Stage G, G5.

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

*Landing. Grants, scopes, the ceiling, the routing index and the stored-grant repair are owner keys; the wire request shape is still owed.*

**One list, one type.** `models.SessionGrants` is the only grants type — the duplicate in `api/helper/auth`
is gone. It holds `OwnerKeys`, one owner key per owner the session may read, stored on the account's
session record in Redis under `owner_keys`.

**The account's own key is always granted.** `UpdateAccountSessionGrants` writes it alongside whatever
ESI supplied, so a reader asking whether a session may see an owner gets the same answer for an account
as for a corporation, and nothing downstream special-cases the account.

**A grant carries its kind.** Keys are built through `models.Owner.Key()`, so a corporation ref and an
alliance ref of the same id are different grants. A ref the owner vocabulary refuses is dropped rather
than stored as a key nothing can parse. `SessionGrants.Grants(owner)` answers membership and
`IDsForKind` returns one kind's ids, so no caller parses a key by hand.

**The source has not changed.** The list is still filled from ESI at token refresh, from the ids the
callers hold; only its shape moved. Stage C repoints it at membership rows.

**The ceiling and the scopes are owner keys too.** A connection carries one `grantedOwnerKeys` set,
taken straight from the session record, and `RealtimeScopes` holds one `OwnerKeys` list. One
`filterToAllowed` comparison covers every kind, so a scope upgrade no longer runs a separate pass per
kind and cannot gain one when a kind is added.

**One vocabulary for a set of owners.** `models.OwnerKeys` is the type, and it owns the operations:
`Add` and `AddRefs` build a set from owners or refs of one kind, skipping anything the vocabulary
refuses; `Within` keeps only what a ceiling allows; `Union` widens a set without dropping what is held;
`Normalized` trims, deduplicates and sorts; `Has` and `IDsForKind` ask about membership and one kind.

A session's grant ceiling, a connection's scopes and the owners a client asks for are all that one
type, so the same question is asked the same way on each and no caller splits a `kind:id` string or
keeps its own set helper. A connection's `Scopes` is the type directly rather than a struct wrapping
it, which retired the `websocket/server/model` package the wrapper was the only member of, and the
ceiling is the type rather than a map built from it.

**An empty ceiling permits nothing.** `Within` returns nothing for an empty ceiling rather than
everything, so a session holding no grants reaches no owner — the direction this has to fail in.

**A key built from an unusable ref addresses nothing.** `Owner.Key` renders the zero owner as `":"`,
so indexing a map on a key built from unvalidated input would read one bucket shared by every bad ref
rather than failing. Lookups go through `clientsForOwner`, which refuses the zero owner first.

**One reverse index, one lock.** `ownerKeyToClients` maps an owner key to the clients receiving it,
replacing the separate corporation and alliance maps and the rule that their two mutexes had to be
taken in a fixed order. Hosted tenants read that index directly, because a tenant key and an index key
are now the same string; the per-kind branches that rebuilt one from the other are gone, and the
connection metric reports whatever kinds are present rather than the two it was written for.

**The request still names its kind.** A browser sends `upgrade_scopes` as a corporation list and an
alliance list, which is where the kind comes from; the ids become owner keys at that boundary, so the
discriminator moves into the value before anything compares it. `scopes_ack` still reports a
corporation and an alliance flag, derived from the scopes rather than stored.

**Resume carries owner keys.** The handoff entry and its Redis payload hold `owner_keys`, under the key
prefix `ws:session_handoff:v2`. A handoff written by the previous shape is not found rather than
misread, and the client falls back to a normal connect — which is what a resume hint is for.

**Stored grants are rewritten by the release, not left to lapse.** A session record written by the
previous shape decodes to no grants at all, because its `corporation_refs` and `alliance_refs` are
fields the type no longer has. `tasks prepareRelease` therefore ends with a step that scans
`account_sessions:*`, reads those fields from the raw record, and rewrites the grants as owner keys —
adding the account's own key, which the previous shape never stored.

Only the grants field is rewritten. The same record holds the session map that keeps an account signed
in, so deleting the key to force a refill would sign every user out. The write goes through the same
compare-and-set as every other grant write, and the step is idempotent: a record already in the new
shape is counted and skipped, so re-running the release rewrites nothing.

**Proven end to end over a real socket.** Three scenarios in the websocket integration suite carry a
grant the whole way rather than testing one link: an owner granted from ESI ids reaches the browser as
a delivered document; an owner the session was never granted is refused at the upgrade, never hosted,
and delivers nothing; and a record in the previous shape, repaired by the release step, restores the
scope on the next connect. They use the suite's existing fixture, so a later kind is a scenario rather
than new machinery.

Two contracts they pin that were not obvious from the parts. An upgrade that grants nothing sends **no**
`scopes_ack` at all — the client learns by silence rather than by an ack naming a scope it does not
hold. And a legacy record only survives long enough to be repaired if nothing writes the record first:
every write through the record's own helpers decodes into the current shape and drops the previous one.

**A connection derives what it receives; nothing is requested.** `Client.Scopes` is set from the
session's grants at connect and the client is put into its owner pools in the same step, so a
connection is receiving before it has sent anything. `upgrade_scopes`, `scopes_ack` and the raw id to
ref conversion behind them are gone, along with the reader case that accepted the message: a browser
names no owner this service has to resolve, so the only raw ids left in the websocket are the ones it
converts on the way *out*.

**Resume carries documents, not scopes.** The handoff entry and its Redis payload hold document ids
alone. A reconnecting client derives its scopes from the ceiling like any other connection, so there
was nothing for the handoff to restore and no `scopes_ack` to send after one.

A connection opens on scopes equal to its ceiling and narrows them when the client names an active
planner — see § Stage E. `OwnerKeys.Union` stays because the release repair widens a stored grant list
with the account's own key.

Nothing here is owed against Stage B.

## Stage C — Planners and membership

*C1 landed. The collections exist and are maintained; nothing writes to them yet.*

**Two collections.** `planners` holds one document per owner, its `_id` the owner key, so the owner is
stored once rather than beside a duplicate of itself. `planner_memberships` holds one row per account
per planner, its `_id` the composite `{plannerID}|{accountID}` — which makes the one-row-per-pair rule
a property of the id rather than something a unique index has to enforce.

Two indexes, one per direction the request path asks in: `accountID` for which planners an account can
see, and `plannerID` for who is in a planner. Neither question is answerable from the composite id
alone, which is why both exist.

**Both are schema-maintained**, which is five registrations rather than one: a `SchemaVersion` on the
model, a `*SchemaCurrent` constant, an `Upgrader` method, and a case in each of the two `schemamaint`
switches. The upgraders only clamp a version into range — these are new shapes, so there is no earlier
one to move a document from.

**The owner stamp does not touch them.** It derives an owner from `_meta.accountID` on documents older
than the owner block; a planner is written with its owner from the first document and never carried an
account id. That is now stated as a list beside the stamp rather than left for the next reader to
work out, and a test refuses a collection appearing in both.

**A planner's `_meta` is the shared core.** The three meta families that landed early — an account one,
a planner-scoped one and a planner one — are gone. They had no references at all, and the tree already
carries that split per document as `JobMetaData`, `GroupMetaData` and `UserMeta`. A planner document is
not edited by its members, so it needs nothing beyond `MetaData`.

**Every account has a planner, and gets one however it arrives.** `Mongo.EnsureAccountPlanner` writes
an account's planner and its own membership row, and both the release backfill and first login call it
— one implementation, so an account created after the release ran gets the same pair of documents
rather than a second version of them.

It writes on insert only. A repeat call adds nothing and rewrites nothing, so an account that has since
renamed its planner keeps the name, and the backfill can be run again without undoing anything. The
planner's `_id` is the account's owner key, so nothing is minted: the documents that account already
holds carry the same id inside `_meta.owner`.

**It repairs rather than only creates.** The two writes are independent, each conditional on its own
half being absent, so a planner whose membership row was deleted regains the row while keeping its
name, and the reverse. Login is not the only path through it: refresh calls the same resolver, so every
active account passes through within a session cycle and a bad delete heals without anyone running a
command. Guarding the call on first login would save two writes, give that up, and strand an account
whose user document was written between the backfill and the end of the release — it has one of those,
no planner, and is never first-login again.

The backfill is kept even so. Membership rows become the source of grants in C3, and an account that
has not logged in or refreshed since the release would otherwise have none at the moment that lands.

**The backfill's position in the release is load-bearing.** It follows the owner stamp, because a
planner id is the owner key those documents gain there, and precedes the grants rewrite, which reads
the membership rows it writes. A test asserts that order rather than leaving it to a comment.

**Membership decides what a session may reach.** `UpdateAccountSessionGrants` no longer converts ESI
ids: it takes the owner keys its caller resolved and writes them. The keys come from
`Mongo.OwnerKeysForAccount`, one query over the account's membership rows, and a planner id is already
an owner key so nothing is converted on the way.

The session package stayed Redis-only. Putting the membership query in each of the three callers would
have written it three times, one of them in another service; putting it in `auth` would have given a
package that holds sessions and tokens a database. It lives beside the planner writer instead, and the
entity cipher left `auth` entirely along with the id conversion.

**Authorisation reads the rows, not the grants.** Grants live as long as a session, so an account
removed from a planner a moment ago still holds one. The statistics route asks
`Mongo.AccountMayReach`, which reads the membership row, so a removal is refused on the next request
rather than at the next login — which is what § Losing access requires. Grants remain the routing
ceiling the websocket derives its scopes from, where being a session-lifetime cache is correct.

An account reading its own statistics is answered without a lookup: it holds that membership by
construction, and answering it before the database is consulted keeps the refusal of every other owner
independent of whether Mongo is reachable.

**Collections follow the owner's kind, from one table.** `AccountOwnedCollections` holds what an
account owns wherever it is working — its user document, settings and watchlist — and
`PlannerHeldCollections` holds what belongs to a planner: jobs, job documents, groups and the planner's
settings.
`CollectionsForOwnerKind` picks between them, and every kind that names a planner gets the same set,
because the collections follow from the kind being a planner rather than from which planner it is. A
collection added to that list reaches every planner of every kind — and must also be watched, because
the change stream's groups are a separate list in another package: one that is subscribable but
unwatched accepts the subscription and delivers nothing. A test pairs them.

**A document's owner is read, not assumed.** `docSubscribeAuthorized` asked whether the requesting
account owned the document, which cannot be true of a planner-held document a member did not write. It
now reads the document's owner and asks whether the account holds a membership for it — two reads,
because those are two different questions. `ExistsByAccountID` went with the change: it had no other
caller, and its question is the one that stopped being the right one.

The account-owned branch is unchanged and deliberately so: those documents are owned by the account
itself, so comparing the id is both correct and cheaper than a lookup.

Stage C's slices are complete.

**An operator can see whether an account came out whole.** `tasks planners` reports, per account,
whether the planner and its membership row are both present, and how many shared planners the account
reaches. It exists because the backfill's own line cannot answer that: it counts planner documents
alone, so "3 of 4 would gain a planner" reads the same whether the fourth is complete or holds a
planner with no membership row — and without the row that account is granted nothing and reaches none
of its own data. Read-only, and the check to run after the window before traffic returns.

**Proven over the HTTP surface, with two accounts and a real database.** The statistics live scope
suite carries the whole chain rather than any one link: a planner owns figures neither account owns,
and the account holding a membership row for it reads them while the same request without a row is
refused. Leaving refuses the **next** request rather than the next login, which is the property that
distinguishes reading rows from reading a session's cached grants — and the one § Losing access needs.

A second scenario checks the account's own figures reach it by the same mechanism rather than a special
case: `EnsureAccountPlanner` writes the row, `OwnerKeysForAccount` returns that owner, and the view
answers. Both require `EIP_MONGO_PARITY_LIVE=1` and skip without it, like every other live test.

Owed here: the planner document, the membership document, their indexes, how a roster is kept current
per provider, how the account planner is created, what the roster endpoints refuse, and where the
grants list is filled from once membership rows replace the ESI source.

The Go types exist already — `Planner`, `PlannerMembership`, `PlannerInvite` and `JoinMethod` in
`services/shared/models/planner.go` — but no collection, index, repository or caller uses them, so
nothing here describes live behaviour yet.

## Stage F — Membership from EVE

*F1 landed. The reap task, background validation and access lists are still owed.*

**A membership row says why it grants, and the four reasons are branches on one method.** An account is
a member because the planner is its own (`owner`), because it redeemed an invite (`invite`), because it
is in the corporation or alliance the planner belongs to (`entityMember`), or because an in-game access
list names it (`accessList`). The populated branch is the discriminator; nothing stores a tag beside it.

The branches name the reason rather than the source. ESI is how membership in a corporation is
discovered, not why it grants — so the branch is `entityMember`, and access lists are their own branch
rather than sharing it, because they are polled from one managing character's token rather than
reconciled from each member's own.

**A row grants for as long as it exists.** Nothing expires one, and an expiry built here first was
taken back out: a stale row on a dormant account grants nothing to nobody, because no session exists to
use it, and the moment somebody logs in the grants task reconciles the rows before anything reads them.
The plan's § Stage F records the reasoning.

What ends access is the row going. A character leaving a corporation is found by the next reconcile,
at login or on the cloud token sweep. A revoked token is found by that sweep too — `invalid_grant` says
the character is gone for good, which is an answer rather than the absence of one, so the reconcile
proceeds and removes what that character was carrying. Only a transient failure blocks it, because only
then is the answer unknown. An account dormant for two years is cleared by
`InactiveAccountPlannerCleanup`, alongside the jobs and groups it already removed.

**No planner document is written by the reconcile.** Nothing on the access path reads one:
`OwnerKeysForAccount` and `AccountMayReach` both read membership rows, and the only reader of the
`planners` collection in the services tree is a diagnostic command. The document holds a name and a
member count — display metadata — so it is created when something first names the planner rather than
for every corporation an account passes through.

Owed here: a reap task, since stale rows accumulate with nothing deleting them; background validation
for cloud accounts from their stored tokens, which is what keeps rows fresh between logins and the
reason the timestamp exists; and access lists, whose shape § Access lists differ from the other ESI
providers already describes.

## Stage D — What a second member breaks

*Landed. The close gate is skipped — see the plan's D2.*

**Recalculating a job keeps what the job is built with.** A new total produces a new layout — the same
runs may divide into a different number of setups — so the setups are still replaced rather than
edited. What does not follow from the total is carried across: the setup being rebuilt is spread into
each new one, so its efficiency, structure, rig, system, tax, character and system-index override
survive.

Spreading the setup whole is possible because `Setup`'s constructor reads back every field `Setup`
stores, under the same names. Only the id is answered afterwards, because this is a new setup. The
material count, estimated time and install cost ride along and are immediately overwritten, since every
builder recalculates the setup it has just built — and a setup's material count is always rebuilt from
its job's raw material list, never edited in place, so setups built from one another share nothing.
`Setup.recalculate` takes that raw list itself, so no caller can recalculate a setup without seeding it.

`Setup` accepts two of its fields under a second name — the character as `characterToUse`, the raw time
as `rawTimeValue` — and prefers the stored name when both are present. A source spread beneath another
therefore wins if it uses the stored name and the source above it does not; every builder writes in the
stored vocabulary for that reason.

**Which setup is carried from is a getter on the job**, and there are two of them because the question
has two answers. `selectedSetup` is what the editor is on, or nothing — what a panel rendering a setup
needs, and what a job loaded with no stored selection has. `setupToBuildFrom` falls back to the first,
because a job with setups always has a context to carry whatever the editor points at. The twenty-six
places that resolved the selection by hand now use the first.

**`customStructureID` was the field that mattered most.** It is a reference into the settings of
whoever owns that structure, and recalculation used to overwrite it with the recalculating user's own
— so a member editing another's job repointed it at a structure only they hold, and the app's own
orphan-detection then treated it as broken for everyone else. Deriving it was creating the state
`clearOrphanedCustomStructureOnSetups` exists to clean up.

**Adding a setup copies the one being edited.** A second setup on a job is another run of the same
production line, so it is made where the first is made rather than wherever the current settings point.
It is sized at a single run whatever the copied setup holds, and says so directly rather than asking the
layout calculator for one run's worth.

**Where a job is made and how much it makes are asked separately.** The build context — efficiency,
structure, rig, system, tax and raw time — is derived from the current user's settings and the
blueprints they hold. The layout — how a required total divides into `{ runCount, jobCount }` entries —
is derived from the total and the blueprint's run limit, and is what makes a new total produce a
different number of setups. Only a builder working to a total needs both; adding a setup takes the
context alone.

**Precedence, where three sources can supply a value:** a build request or a stored template row
outranks the setup being continued from, which outranks the current user's settings. Only the first is
an explicit choice for this build. Restoring a group template goes through the same builder as a first
build, with the template row as that explicit choice.

**The second layout calculator is selectable now.** Splitting a total across the blueprint originals an
account owns was written, exported and never plumbed in; recalculation takes a calculator as an option
and defaults to the max-run split, so nothing changes for callers that do not ask for it.

This is a live defect on personal planners rather than only a sharing one: changing a default structure
and editing an older job rebuilt it under the new default, and a job restored from a group template
lost everything the template supplied if the quantity differed at all.

**Extras categories are the planner's, read and written.** One hook,
`usePlannerExtrasCategories`, answers the active planner's list, and the three surfaces that used to
read the account's — the category picker, the job's extras editor and the Settings page frame — all read
it. It answers the defaults for a planner whose settings have not arrived, so a picker has a usable list
from the first frame, and it selects straight off the held entry rather than through the store's
accessor, which builds a fresh defaults object per call and would re-render on every store change.

**The defaults can be read but not edited.** The hook says which of the two it answered, and the
Settings page disables its controls until the planner's own list is held: editing the fallback and
saving it would replace the planner's stored list with the defaults plus that one edit. The store
action refuses the same case, so the rule does not depend on a call site remembering it.

**The list is edited where it is read.** `PUT /api/v1/planners/{owner}/settings` takes a
`SettingsUpdate` naming only the settings that changed, so a member editing one setting does not send
back a copy of the rest that another member may have moved on from. The write is a `$set` of those
fields with an `$inc` of `_meta.revision` beside it, and stamps the writing session and tab. A planner
with no settings document is refused rather than given one: the document is written when the planner is,
so its absence means there is no planner.

**The server refuses a list that would orphan a stored cost.** Every category needs an id and a label,
ids cannot repeat, and `Unassigned` and `Other` must be present and not deleted — a cost already filed
names its category by id, and the archive resolves a label against the list it was filed from. Deleting
a category marks it rather than removing it, for the same reason.

**The client holds the part of that rule a reader can trip over by accident.** A new category's name is
checked *after* its markup is stripped, because stripping can leave nothing behind and a category with
no label is one the whole write is refused for; the typed text stays in the field rather than being
cleared, so the reader can see what was not accepted. The permanent categories carry no delete control
for the same reason.

The **size limits are the server's alone** — a label longer than 120 characters, or a list past 200
entries — and the SPA does not restate them, because a second copy of a number is a second thing to keep
in step. Reaching either needs deliberate effort rather than a slip, and the cost of not restating them
is that such a write is refused rather than prevented: the refusal is logged and not shown, as every
settings write in the SPA behaves.

**The account document keeps its own copy for this release and stops being edited.**
`backfillAccountPlanners` is what moves an account's list onto its planner, and
`stampExtrasCategoryLabels` names the categories on jobs already archived; both read
`application_settings.extrasCategories`, and the settings upsert writes the whole struct, so the SPA
round-trips the field rather than clearing it out from under them. It no longer writes to it, and its
editing actions are gone — which left `applicationSettings/extras.js` holding system indexes alone, so
it is now `predefinedSystemIndexes.js`. The plan's § Stage D says what drops the field afterwards.

**The release moves the list, because seeding alone would lose half of it.** A planner's settings are
written the first time its account signs in, and the write is insert-only, so a category added at any
later sign-in never reached the planner. `backfillPlannerExtrasCategories` merges those onto the account
planner by id, leaving every category the planner already holds exactly as it is — a member's rename and
a member's deletion both outrank the account's copy, which is what makes the step safe to run again.
`planner_settings` is copied before the window for it, being the one step that changes such a document
rather than inserting one.

**A save is debounced per planner, not per tab.** `plannerSettingsPersistSchedule` remembers which
planners have unsaved changes rather than only the last one, so a member who edits one planner's
categories and switches before the window closes still has the first write. It flushes on tab hide and
unload like the account's own settings do.

The close cascade's persist gate is not owed — the plan's D2 records why it is skipped and what replaces
it.

## Stage E — Custom planners

*Landed.*

**A planner is written through one function.** `EnsurePlanner` takes a `PlannerWrite` and is the only
thing that creates a planner, its owner membership row and its settings document. `EnsureAccountPlanner`
is a caller of it rather than a second path, so a planner created at first login and one created for a
corporation differ in their arguments and nothing else. Every write is insert-only, so a repeat call
repairs what is missing instead of overwriting what is there.

**Settings seed by value.** A new planner's settings are copied from the creating account's, with
slices and maps cloned rather than aliased, so later edits to the account's settings do not reach into
a planner's. An account with no settings document of its own seeds defaults rather than failing.
`planner_settings` is both planner-held and watched: it appears in `PlannerHeldCollections()`, which
gates subscribe, and in `changestream.CollectionGroups()`, which is what the change stream watches. A
test pairs the two lists, because a collection in the first and not the second is subscribable and
silently never delivers.

**A corporation planner is named server-side.** Creation refuses an NPC corporation by id range, looks
the name up from the public entity endpoint rather than accepting one from the client, and answers with
the name it stored. The SPA is not trusted for it because the SPA is not the authority on it.

**The active planner is a message, not a reconnect.** A client sends `active_planner` naming one owner
handle; the server parses it, intersects it with the connection's ceiling and replaces the planner
subscription, leaving the account's own subscription alone. Replacing rather than merging is what makes
switching stop the previous planner. A `Client` holds `Ceiling` beside `Scopes` for that intersection.
A new connection derives scopes from the session's grants and knows nothing of a planner chosen before
the socket dropped, so the client re-sends it once the socket reopens.

**A delivered document names its owner.** `ClientPayload` strips the routing fields and writes the
owner as a *handle* — the EVE id, not the ref it is stored under. That cost the zero-allocation
pass-through, which now covers only a message with no owner to name.

**The SPA ignores what is not its planner.** The store holds one planner's jobs, so `documentMessage.js`
drops a planner-held document whose owner is not the active planner — matched by collection against a
mirror of `PlannerHeldCollections()`, so every planner-held collection is covered rather than the ones
a call site remembered.

**One slice holds which planner the app works in.** `activePlanner` carries an owner handle, falling
back to the account's own so an account that has never switched works in its own planner, and
answering null with nobody signed in. The realtime layer keeps no copy of its own: the slice is set
only once the socket has taken the `active_planner` message, so a switch the connection never received
leaves scoped reads where they were rather than addressing a planner nothing is delivering. A
reconnect re-sends what the slice holds, and signing out drops it with the other slices.

**Every scoped request names its planner.** `applyPrivateHeaders` reads the slice and sends
`X-Planner-Owner` on every private request, so all the scoped handlers are addressed at the active
planner without a call site having to remember. The header is omitted with nobody signed in, which is
the absent-header case the server already resolves to the caller's own planner. The statistics path
composes the same handle, so a switch moves the figures with the documents.

**A scoped query key carries its owner.** `plannerQueryScope` puts the owner between the backend root
and the view, so two planners' rows cannot share a cache entry; the statistics and archive keys are
both built from it, and it owns the two roots so the key modules read them from one place. Invalidation
stops above the owner, so a restore still clears every planner it moved figures for. Switching removes
what was cached under the planner being left and leaves the other's entries alone.

**A request names the planner it works in.** Every scoped read and write takes an `X-Planner-Owner`
header carrying an owner handle; `helper.RequestPlannerOwner` parses it, refuses one the account holds
no membership row for with 404, and resolves an absent header to the account's own planner. That
default is scaffolding with an expiry: it exists while the SPA is wired around, and the cutover makes
the header required. The account's own planner costs no membership read, and a membership read that
fails refuses rather than falling back — falling back would write into the wrong planner on a Mongo
blip. `helper.PlannerOwnerFromHandle` is the same guard for a handle in the path, with no default.

**A document's owner is the planner named on the request**, never the writing account.
`BulkUpsertJobs`, `BulkUpsertGroups` and the archive write take an `Owner` and stamp it;
`LastUpdatedBy` keeps the writing account. Every read filter composes the same owner, and
`LoadJobsByFilter` applies it last so a caller's filter cannot widen a read. The archive's scope holds
the owner it addresses, and a restore names the acting account separately: the documents it writes are
the planner's, the ESI ids it reclaims are the account's.

**A planner-held document is stored under `{ownerKey}|{id}`.** `job_documents`, `job_groups` and
`archived_jobs` — `OwnerScopedIDCollections()` — because `_id` is unique and a bare id could exist
only once. The bare id is what a client sends, keys its store on and receives: filters compose the
stored form through `OwnerScopedDocumentID`, the changestream splits it back through `BareDocumentID`
before `docID` goes on the wire, and the document lock keys on the bare id with the owner as its own
segment. A writer that addresses documents across collections builds the id through
`StoredDocumentID`, so it cannot upsert a bare-id copy of a document it meant to update. The stored id
also carries a deleted document's owner, so a delete with no preimage still routes to the planner.

**Every user write counts itself.** `_meta.revision` is incremented by `SetDocumentWithRevision`, which
sets `_meta` by path — Mongo refuses `$set` of a subdocument alongside `$inc` of a path inside it, and
setting the block whole would reset the counter to whatever the request body held. Server-side
rewrites — schema maintenance, the statistics rebuild, the SDE import — do not count.

**Everything the release writes to is copied first, and can be put back.** `prepareRelease` begins by
copying every collection its steps or its fan-out commands write to, and `rewriteOwnerScopedIDs`
copies its own collections before queuing a task. Copies are recorded in `release_backups` with their
counts, an existing copy is never replaced, and `revertRelease` restores every recorded collection
from them — refusing when nothing was recorded. `dropReleaseBackups` removes them afterwards.

**The id rewrite is a fan-out, and the release gates on it.** `eip cli -- rewriteOwnerScopedIDs`
enumerates the owners holding bare-id documents and queues one worker task each; a task inserts each
document under its new id, seeds `_meta.revision`, then removes the old one, and a duplicate key on the
insert means a previous run got that far. Re-running with `--dry-run` reports the work remaining,
because the selector is the id's own shape. `prepareRelease` does not perform the rewrite; its last
gate fails if any bare id is left.

**The store still holds one planner's documents.** Keying the job and group stores by owner is Stage G
work rather than this stage's: a switch now reads and writes the right planner, but nothing loads
that planner's documents, so the documents already in the store are what it shows until a change
arrives. Group template keys carry no owner because the collections carry no owner block yet.

**An invite is a Redis record, not a document.** `plannerinvites` owns the namespace
`eip:planner:invite:v1:` — one key per invite whose TTL is its expiry, and a per-planner sorted set
scored by expiry so counting one planner's invites costs no walk of the rest. Revoking is a delete.
The helper lives beside the API rather than in `shared/redis`, which owns only the namespaces that are
its own.

**A token is shown once and never stored.** 256 bits of randomness, kept as its SHA-256 hash and
compared in constant time. `Invite` serialises whole because the record is JSON; what a client sees is
`InviteSummary`, which carries no hash, no creator and no planner, and says only that an invite is
bound rather than to whom.

**Redemption spends a use atomically.** One Lua script reads the invite, checks it may be spent and
increments the count, because two accounts presenting a one-use invite together would otherwise both
read zero and both be admitted. The token is proven before the script runs, so a wrong one consumes
nothing — otherwise anyone holding the id could exhaust an invite they cannot redeem.

**Every guessable refusal answers alike.** An invite that does not exist, one that was revoked, one
bound to somebody else and a wrong token all answer 404. Expired and spent answer 410, which only the
right token reaches. A caller holding an id learns nothing by trying.

**Issuing under an id something already holds is refused**, so a caller reusing an id cannot silently
retire a credential somebody is holding. A spent invite keeps listing until it expires, because the
creator asking what is outstanding wants to see that one was used.

**A planner that is not there is an answer, not a fault.** An invite outlives the planner it was
issued for, so redeeming one that names nothing reports 410 rather than a server error — the use is
already spent by then, and a 500 would lose it to what looks like a bug. A planner an account can
reach but nobody has opened has a membership row and no document; asking for its invites is a 404 for
the same reason.

**Joining is the one planner route with no owner handle.** `POST /api/v1/planners/join` takes the
invite and its token: the caller holds no membership row yet, so the guard every other route runs
would refuse them, and the invite names the planner instead. The membership row records who invited
and when rather than pointing at the credential, which is free to vanish. `MemberCount` is recounted
from the rows on each join, so it corrects a drift instead of compounding one.

**Only a custom planner takes invites.** The kind decides the provider, one-to-one, so an account
planner — which holds the one member it was created for — and a corporation or alliance planner —
whose roster follows the entity — are refused before anything is read. `Owner.AdmitsByInvite` is where
that rule lives, and the join write checks it as well as the handler: a row written for a corporation
would survive the reconcile that no longer sees the account in it, granting access the game has taken
away. Issuing answers 409; a redemption naming such a planner answers 404 like any other refusal.
Since nothing creates a `planner`-kind owner yet, every invite is refused until custom planner
creation lands.

**Only the account that created a planner may invite into it.** `Planner.CreatedBy` is the whole of
the permission model here, and a member who did not create it is refused as 404 — the route is not
theirs, rather than existing for somebody else. Caps: 25 outstanding invites per planner, 100 members
per planner, 30 days maximum lifetime.

**Grants follow the membership rows, and an open connection follows the grants.** Stored grants are a
cache of one query over those rows, so a task that adds or removes one owes a rewrite:
`WriteSessionGrantsFromMemberships` resolves the owners an account holds now, writes them to the
session record, and announces the new ceiling. Both ESI reconcile paths call it. The token sweep did
not, which was a live defect — an account whose last character could no longer prove a corporation
kept that planner in its ceiling for the seven days a session record lives, and the ceiling is what
every surface reads.

The announcement is `session.grants.changed` on core NATS, carrying the account and its whole new
ceiling rather than what was removed, so a replica that missed an earlier one still lands in the right
place. Every websocket replica subscribes and narrows whatever connections it holds for that account:
scopes become what they were within the new ceiling, and the account's own planner is unioned back in
because it is not a grant and is never withdrawn. Ceiling and scopes move together under the owner-index
lock — a reader seeing the new ceiling beside the old scopes would believe the connection still receives
a planner the account has left.

*Not the mechanism the plan first described.* There is no scope fan-out to ride and no
`swapClientOrgScopesAndIndexes` to mirror; both are gone. A connection's scopes are set at connect and
changed by one thing, the client's `active_planner` message, so this is a new subject rather than an
existing one reused.

*Two accepted trade-offs.* Core NATS is fire-and-forget, so a replica that misses the message keeps a
revoked planner on that connection until it reconnects — bounded by nothing, unlike `doc.lock`, which
rides the stream with durable consumers. It is tolerable because the stored record is already correct
by the time the message goes out, so every surface but that one socket is closed. And the browser is
told nothing: narrowing is server-side only, so a reader whose planner was revoked sees their screen
stop updating without being told why. Both are worth revisiting with Stage I, which owns where the
ceiling is read from.

**Joining is the same call in the other direction.** `PostPlannerJoinHandler` writes the membership row
and then rewrites the account's grants from it, so the planner is reachable on the connection the member
already has open rather than at whatever later moment something else derives them. It is not fatal to
the join: the row is written either way, and the next derivation repairs a rewrite that failed.

`sessiongrants` holds that one call. It reads membership from Mongo, writes the session record in Redis
and announces the result, which is three clients no single existing package owns — and both the API and
the worker reach it, which is why it is shared rather than living beside either.

Owed here: the group template collections joining the id rewrite once they carry an owner block.

## Statistics are read for the planner the path names

*Landed.*

`/api/v1/statistics/{owner}/{view}` reads the figures of the planner in the path. `requireOwnedBySession`
resolves that owner, checks the account's membership rows against it, and now answers with the owner
rather than a bare yes — the three views and the recalculation state all read what it returns.

They did not before: the gate checked the planner while every read below it was scoped to the calling
account, so a member of a shared planner was refused nothing and shown nothing. Returning the owner is
what stops the two drifting apart again, since a caller can no longer resolve it a second time and
differently.

Covered by `TestLive_aSharedPlannerIsReachedByItsMembers` in
`services/api/v1endpoints/statistics/live_scope_test.go`, which seeds a planner-owned row, joins an
account by membership and reads it back.

## Stage F — ESI providers

*Not landed.*

Owed here: how a corporation or alliance roster is reconciled and when, and what a corporation planner
does not offer that a custom one does.

## Stage G — Realtime state under more than one writer

*Partly landed: a planner is loaded when the app enters it, and its settings stay current while it is
open.*

**The job store holds one planner, and `loadPlannerDocuments` is what puts a planner in it.** It
lives in `frontend/src/Functions/DocumentLoad/` beside `loadAccountDocuments`, which loads the account's
own singletons: both read the server over HTTP, so neither belongs with the socket.

It reads `GET /api/v1/job-documents/planner` and `GET /api/v1/groups` together — both already carry the owner
header — and replaces the job and group arrays from what comes back. Three paths call it: the switcher,
which awaits it inside its transition so the control stays disabled until the planner it names is the
one on screen; the reconnect, when the session identity changed and events during the gap were lost; and
the background-tab wake, whose socket was throttled. The last two previously reloaded jobs alone, so
groups were never refetched after a gap.

The switcher reports a load that failed apart from a switch that failed. Past the point the connection
took the planner the switch has happened and only the documents are missing, so it says so and offers
the load again rather than leaving the reader on the previous planner's jobs with the control already
showing the new one. That banner is cleared by the next switch or by taking the offer, so a load from
the reconnect or the wake succeeding for the same planner in the meantime leaves it saying something
that is no longer true.

**Only the newest load reaches the store, and it reaches it whole.** Each call takes a number, and the
pair of answers is dropped unless that call is still the newest and the app is still in the planner it
asked for. The owner check alone is not enough: switching away and back arrives at the same planner, so
two loads for one owner are both wanted by it and the slower would land last with the older answer. The
check is made once for the pair rather than once per request, because the two requests answer at their
own speeds and a load overtaken between them would leave its groups beside another load's jobs. Fetching
and writing are separate steps in the endpoint modules for that reason: the loader holds both answers
until both have arrived.

**The job store records which planner it holds.** `jobData.owner` is that planner, written by the same
action that replaces either array. A load for a different planner drops the jobs held inside groups,
which are the one thing a planner load does not answer for and so were previously kept across the
switch: a group's jobs would otherwise outlive the planner they belong to, invisible among another
planner's because their own group had gone. A load for the planner already held keeps them, which is
what a reconnect needs.

**A queued job or group write is flushed before the planner moves.** Those writes name their planner on
the request at the moment they go, not when they were queued, so an edit still inside its two-second
debounce would be written into the planner being switched to. The settings flush is after the switch
instead, because a settings write carries the owner it was queued for.

A flush resolves when the write has finished, which is what makes that ordering real: a persist schedule
returns its work from `onRun` rather than discarding it, so `flushPending` has something to wait for. A
write that failed leaves its ids queued, and the switch is refused while any remain — moving would send
them under the new planner's name, and loading the new planner clears the queue, so the edit would be
lost rather than delayed.

Switching is covered end to end from the click: only the network is faked, so the header, the endpoint
modules, the store actions and the merge are the real ones, and the test that matters names the planner
a queued edit is finally sent under. Moving the flush to the far side of the switch makes it fail with
the new planner's name on the old planner's job, which is the defect it was written for.

A load answers from a snapshot and writes it whole, so a change delivered over the socket while the
load was in flight is rolled back by it. The window is the length of the two requests, and it is the
same shape the reconnect reload has always had. The position G2 added orders deliveries against each
other; what would close this is a load that reports the position it read at, so a delivery and a
snapshot become comparable — an endpoint change, and not part of G2.

**A delivery carries its place in the stream, and that is what decides whether it applies.** The server
puts JetStream's stream sequence on every document frame as `position`; the client holds one per
document and applies a change only when it is beyond what that document has already had. A redelivery
repeats its position exactly, which is what makes an apply idempotent — a stamp read off the document
never could be.

A delete carries one as readily as an upsert, which is the point. The cursor it replaces was
`_meta.lastModified`, and a delete has no stamp of its own, so those paths reached for `Date.now()` and
left one comparison deciding between a browser clock and a server clock. Restoring an archived job
writes the same id back, so an account whose clock ran ahead watched the restore be discarded. The
job-document queue compares positions for the same reason: a delete used to beat a queued upsert
unconditionally, which swallowed a restore that landed in the same flush window.

A message with no position — an older server, or metadata that could not be read — applies rather than
being discarded, on both sides of the wire. An HTTP load forgets the positions for the collections it
replaced, because a snapshot is not something the stream can place.

**A resume is answered from where the client got to.** `session_resume` carries the furthest position
the tab applied, and the server compares it with the last message published for each tenant that
connection reads — its account's own and whatever its session grants reach. `skipDocumentLoad` is the
answer to that comparison rather than an assertion that the handoff was found, which is what it was:
the handoff says the subscriptions moved across and says nothing about the gap.

Per tenant rather than stream-wide, because lock events share the stream with document changes and a
stream-wide comparison would report a gap every time anybody anywhere took a lock. The tenants come
from the connection rather than from the message, so a client cannot ask about a planner it does not
read.

Every uncertain answer is a gap: an unreadable stream, no stream, a client that has applied nothing.
Saying a client is current when it is not leaves it holding documents that have moved on with nothing
to correct it, while the opposite costs two reads. An older client sends no position, which reads as
nothing applied and so as a load being owed.

What this does not do yet is send what was missed. The client reloads the planner instead, which is
what G1 made possible; replaying the gap needs a read of the stream from a sequence, and is a further
slice rather than part of this one.

**A busy owner slows intake rather than losing its order.** `enqueueOutboundDocUpdate` hands a document
change to its owner's shard queue and waits for room when that queue is full, where it used to deliver
there and then — putting the newest change ahead of everything already queued for that owner, at the
moment that owner was busiest. Waiting cannot deadlock, because delivery sends to each client without
blocking: a full client buffer costs that recipient its copy, so a worker always drains.

Two things follow from holding an unacknowledged message. It renews the acknowledgement deadline as it
waits, every `DocUpdateAckRenewInterval` against the consumer's `DocUpdateAckWait` — declared together
in `natslogic` because they are one decision, and pinned by a test that reads the deadline off the
consumer the server is actually built with, so lowering either is what fails. And it counts itself in
`outboundWaitingForRoom`, which the drain's flush waits for: a message here has left the stream and is
in no queue, so a drain counting only queues and workers would close the very sockets it was for.

At shutdown the wait delivers rather than refusing. A drain deletes this container's durable before it
closes the shutdown channel, and the consumer delivers from new, so a refusal there is a lost change
rather than a redelivered one — and order stops meaning anything once the process is going away.

**A save leaves the SPA and comes back into it, in a test.** `frontend/src/tests/live/deliveryRoundTrip.live.test.js`
runs the SPA's own persist path, header assembly, socket client, handlers and store against the real
websocket service — the Go integration fixture, served by `TestHarnessServe` and standing in for the api
and the change stream. It needs a Go toolchain and no stack, and runs under `EIP_WS_E2E=1`. Disabling the
harness's delivery makes it time out, which is what says it is exercising the round trip rather than the
SPA's own write.

Two things that cost time and are worth knowing. The server checks the `Origin` a browser sends, so a
jsdom caller is refused unless its document origin is allowed — correct behaviour that reads as a broken
harness. And `go test` hands the test binary `/dev/null` for stdin, so a harness cannot be held open by a
pipe; it serves until it is told to stop, with a time to live in case nobody does.

What that file cannot do is be two readers. The store is a module singleton and `vi.resetModules()` does
not give a second socket client a private one, so both "browsers" write into one store and the second
asserts against the first one's data — which is what the first version of this test did, passing while
proving nothing. What two readers see of each other is covered on the server instead, over real sockets,
by `integration_position_test.go`: two members of a planner are told the same change with the same
position, and an account outside it is told nothing. Joining both halves needs a browser per process.

Not proven: that the renewal actually prevents a redelivery. The test pins the arithmetic, not the
behaviour, which needs a live stream and a shard held full past the deadline. The shape looks available
without a live stack — `testing/natsfake` exists, and `testing/redisfake` now drives a real fake from
inside a `testing/synctest` bubble, where a thirty-second deadline costs no wall clock — but whether the
NATS client can be driven from inside a bubble without a real socket is untried.

**The standing sync path is gone.** A package of seven files — a queue, a coordinator, a processor and
four frames — stood behind a `sync` message no client has ever sent, with a coordinator scanning every
100ms for work that never arrived. Its Mongo layer asked per account, so it was not a start on an
owner-scoped load: it was the same idea one scope down, and the loader that landed reads the endpoints
that already carry the owner instead.

`skipWhileSyncing` went with it. It was the one per-family gate in the delivery table, held a document
change back from a client rebuilding its state, and never fired because nothing ever set the flag it
read. What a client that is behind gets now is the resume telling it so, and a load.

**A settings change reaches the members it is for.** `planner_settings` was watched, routed and
delivered, and then dropped on arrival — `documentMessage.js` knew jobs, groups and the deprecated
watchlist and let everything else fall out of the bottom, so a category one member added reached
another only on their next read. It has a handler now, in `WebSocket/handlers/plannerSettingsDocument.js`.

Two things about it differ from the collections beside it. The settings store keys by owner and holds
every planner at once, so the active-planner check the job and group stores need is not applied: a
member is told about a planner they are not working in, and there is somewhere to put it. And the owner
comes from the delivery's `owner` handle, never from its `docID` — a settings document's `_id` is the
owner *key*, which spells a corporation as the ref a client never sees, so for the two org kinds the
two strings differ. A delivery arriving while an edit is still on its way to the server is read and
its position recorded, but not applied, for the reason a read of the same settings is dropped: the held
edit is ahead of it.

Owed here: keying the job and group stores by owner rather than replacing one planner's array with
another's, and replaying a gap rather than reloading through it.

## Stage H — The document lock between two members

*Landed.*

**A lock operation over the socket says which planner it is for.** The waitlist pulse, the two viewer
presence frames and the lock-state batch each carry an `owner` handle, the same handle the client names
a planner by everywhere else. The server parses it, re-encrypts an organisation id to the ref its keys
are built from, and refuses a planner outside the grants the session was given at connect.

It used to read the planner from the connection instead — a record set by the separate `active_planner`
message. A lock frame that arrived before that message, or ahead of it after a reconnect, was scoped to
whatever the record held, which is the account's own planner. On a shared planner that is the wrong
namespace and nothing said so: two members would each pulse against their own account's key and neither
would contend. The client kept the ordering in practice; nothing made it.

The HTTP endpoints for these same operations always took the planner from the request and refused one
the account holds no membership row for, so the two surfaces now say the same thing. The socket checks
the ceiling it already holds in memory rather than reading membership per frame, because a pulse is
frequent enough that a database round trip behind each one would be felt. An account's own planner is
admitted whether or not it appears in that ceiling, matching the scopes a planner switch builds: working
alone needs no membership row.

A frame that names no planner is refused. There is no scope to fall back to that is not a guess, and the
guess is what this replaced.

## The write counter says what it counts

*Landed.*

`_meta.revision` counts writes to a document, which is what a conditional write compares. It was
`_meta.version`, beside a `SchemaVersion` on every model that means the shape of the document rather
than how many times it has been written — two numbers, one word. `SetDocumentWithRevision` is the update
that increments it, and `SeedDocumentRevision` gives a migrated document one so the conditional write
that will compare it never meets a document without one.

**A document starts at the first revision and is never without one.** Absent and zero read the same to a
caller and differently to Mongo — a filter on zero does not match a missing field — so a conditional
write comparing the revision it read would never match a document that had never been counted, failing
every time rather than conflicting once. Both preserving-meta insert paths take their `$setOnInsert`
from one place, which is where that default lives, and the release step seeds every document that
predates it.

The stored key moves with the release: a step renames `_meta.version` on every collection the release
touches, seeds a first revision where there was no counter under either name, and where a document has
already been written since the deploy and carries both, removes the stale key rather than renaming it
onto the newer count. Nothing reads the counter yet, so no behaviour turns on when this runs.

That step walks only what a user's writes reach. A collection some task reproduces is not migrated but
rebuilt: the release asks for the current SDE version to be built again, and the blueprints come back
through the writer that owns them, carrying whatever a new document is owed. Reaching into those
documents instead would mean the migration holding a second opinion about their shape, and the two
would drift. Retired collections get neither — `build_stats` is left for the recalculation to reproduce
into `statistics_totals`.

The SPA never read it. What did notice was `testing/fixtures/session-responses/surface.json`, the
committed shape the SPA checks its parsing against, which failed until it was regenerated — the cross-
process contract doing exactly what it is for.

## Two members, in two processes

*Landed, and owed to live testing documentation on promote.*

What a shared planner is for cannot be seen from one client, and the SPA cannot hold two: its store is
a module singleton, and a module-registry reset hands the same instance back — measured, not assumed.
So a client is a process. `frontend/src/tests/live/crossClientHarness.js` starts the websocket
service's own integration fixture and opens as many clients as a scenario names;
`clientProcess.js` is one of them, loading the app through Vite's SSR loader behind a small browser
shim and taking commands on stdin — read a store path, call an app export, call a store action, list
what it wrote.

That last one is what makes the scenarios worth having. A member's store converging is only half of a
claim like "one member deletes a group"; the other half is that every other member wrote nothing, and
no client can observe that about itself.

Three scenarios run on it today: a job one member saves arriving in another's store, both members
recording the same delivery position, and a group one member deletes converged by the other without a
write. The single-client round trip runs on the same harness, having previously claimed a freshness a
module reset never gave it.

Sessions of one account are a separate case from members of one planner, and the lock copy is written
for it: `sameAccountSessions.live.test.js` opens two sessions of one account and shows the second being
told the lock is held and by whom, then taking it over through the same-account force release. The
server's own tests reach both sessions; what the SPA asks for was never shown until here.

**What the harness is not.** It answers the lock endpoints through the service the api uses, but it
resolves the planner from the request header alone — the api additionally refuses a planner the account
holds no membership row for. So a scenario naming a planner its account is not in would pass here and be
refused in production. Every scenario today names a planner its session was seeded into; a test *about*
authorisation belongs against the api, not against this.

**Two things found while building it, neither acted on.** A client has to be seeded as a tab that has
just validated its session, because otherwise the first private request pre-flights `ensurePlannerSession`,
which gets past its no-main-character guard — the store's default characters hold a placeholder whose
`isMainCharacter` is true — fetches an ESI token for it, fails, and reads that as a demand to sign in
again. The guard cannot tell *not yet logged in* from *logged in with credentials unavailable*. Nothing
reaches it in production, because job data waits for login to finish, so it is a fragility rather than a
defect; it belongs with [auth-hardening](../auth-hardening/plan.md) rather than here. And because the
seed puts the session inside its own cooldown, no scenario exercises the rotate or session-recovery
paths.

**Owed on promote:** `technical-documentation/testing/frontend/contents.md` lists the SPA's reusable
fixtures and tells a reader to reach for one before writing a mock. This harness belongs on that list,
and the entry cannot go in while this project is open.

## Stage J — What the SPA does when it is not the only writer

*Landed.*

The client work in this project was scoped to prove the backend, and an audit of `frontend/src` found
what that left. Most of it is design the project never planned; four things are wrong whatever design
arrives, and those are what this stage is.

**A delete arriving for a job the reader has open is surfaced, not applied.** The editor keeps the page
— the reader is part-way through something with nowhere to put it — and is told the job is gone and that
their changes cannot be saved. The coalescer that applies inbound job deliveries announces which ids it
removed, and the editor listens for its own.

What stops the deletion being undone is that nothing writes a job the store no longer holds. Every way
out of the editor is guarded, in two places because they are two different acts. Saving checks the store
before it persists, and a missing job ends the save: the reader is told it was removed while they had it
open and the editor closes without writing. Leaving without saving restores the copy taken when the job
opened, which would put a deleted job straight back, so the three paths that do it — the close button
and both branches of the leave-confirm dialogue — go through one function that restores only a job the
store still holds.

Before this, the editor never re-read the store after it seeded, and closing wrote its copy over whatever
had arrived since. A member deleting a job watched it reappear.

**A group delete is written once, by the member who made it.** The member removing a group releases its
jobs and saves them. Every other connected member applies the
release to its own copies and **writes nothing**: the author's writes arrive as ordinary job deliveries,
so fetching and saving on each client would repeat one member's work once per member, each from its own
snapshot, and the last one to land would win.

**The lock offers a control only when it can work.** Lock state carries `heldByThisAccount` — whether the session holding the lock is one of the reader's
own. It is computed per reader from the account on the lock record and answers *may I take this back*,
not *who has it*: no member is named, which is the position the stage took.

The force-release control is offered only when that flag is true. It used to be rendered for every
read-only viewer, captioned for a crashed tab of your own, so a member blocked by a colleague was told
their own tab was responsible and offered a button to evict them — and the button made it worse. The
Redis release script treated a lock held by another account exactly as it treated no lock at all, which
the api answered 404, which the client reported as "No active lock to remove": the member was blocked by
a lock the app had just told them did not exist. The script now says the two apart, the api answers 409,
and a reader who reaches it is told to ask the holder for access.

**A setup's figures are quoted against whoever is reading.** A setup names the character it was planned for, and on a shared planner that character belongs to
somebody whose skills and clone state this account cannot read. Both stored estimates on a setup are
gone — the job time and the install cost — along with the methods that wrote them and the passes that
stamped the install cost onto setups after fetching system indexes. Each is worked out where it is
shown.

`quotedCharacterHash` decides whose character a setup is quoted against: its own when the reader holds
that character, and the reader's main when it names somebody else. One function, because the Skills
panel had the same defect in its own read.

**Why the field went rather than its writer being fixed.** A figure whose value depends on who is
looking has no single correct value to persist. The stored one was right for the member who last wrote
it and silently wrong for everybody else — an unresolvable character read as an untrained one, so
another member's job was costed as though the builder knew nothing and the alpha clone surcharge was
charged to every reader. Deriving it also removes the write paths, which is where the corruption
entered.

**What deriving exposed.** The install cost is worked out from the system's cost index and the
materials' adjusted prices, both held client-side, and the build-cost walk reaches every job beneath the
one being costed. The Edit Job page fetched only the jobs one step away and the group page only the
group's own members, so a job further along contributed **nothing** where it had previously contributed
whatever was stamped into its document. Both screens now open on the whole chain — `loadAllRelatedJobs`
is the same transitive walk as `getAllRelatedJobs` but resolves each level through the store *and* the
api, so it reaches jobs the store does not hold. It costs one round trip per level of the chain where
both screens previously made one in total.

The stamped figure was not right either: it was whatever prices and indexes were current when it was
written, and nothing refreshed it. The change trades a stale number for a live one, and closing the
fetch gap is what stops it trading it for a missing one.

**Still reader-relative and not resolved:** a setup naming a character the reader cannot resolve is
shown as "No Matching Character Found" on the setup card, where the SPA's rule elsewhere is that an
unresolvable identity reads as unreadable rather than as a sentence.

## Decisions taken, with their reasons

Kept here so a later reader finds the reasoning without reconstructing it from the plan's prose.

| Decision | Reason |
|----------|--------|
| One planner primitive, four membership providers | Corporation and alliance are already just ESI-sourced membership over a ceiling; a second implementation would duplicate roster, roles and archive |
| Account planner id = account id; corporation planner id = corp ref | Every tenant string, subject, lock partition and statistics key keeps its present value, so the migration touches where an owner is read from, not what it is |
| Custom planner ids are ULIDs, not entity refs | A planner id is ours to mint; the entity cipher exists for ids we must be able to hand back, which does not apply |
| One collection per document type, owner on the document | A per-kind split puts a switch on kind at every call site, multiplies watched collections and index specs, and defends the least likely leak boundary |
| Collections named for what they hold, with no owner prefix | The owner block already states ownership; a name that repeats it says the same fact twice and goes stale as kinds are added |
| An invite is a credential, a membership is a record | The membership copies the inviter and issue time at join time, so an invite stays disposable as a Redis key whose TTL is its expiry, and no hashed token outlives its purpose |
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
| The owner does not go on the wire by the API | `_meta.accountID` had one SPA reader that already falls back to the store, so the client change is a deletion. A change delivery is the exception and an unintended one — the watcher copies `_meta` as a raw map, where `json:"-"` means nothing, so an organisation planner's ref reaches the browser in `_meta.owner.id`, in `document._id` and as the delivery's `docID`. Recorded rather than acted on: see [plan.md](./plan.md) § Stage G, G5 |
| One cutover in the deployment window, not expand/contract | The stack is coming down anyway, so nothing reads or writes while the migration runs; that removes the dual-write machinery and the erase hazard, at the cost of rollback being a database restore |
| The grant list's shape moves before its source | Converting while the values are still ESI-derived means the tolerate-both-shapes work ships against behaviour that can be checked; changing shape and source together would leave nothing to compare the result to |
| The release verifies the owner gate itself | The stamp cannot derive an owner for a document with no account id, so it reports those and returns success; without a step that fails on any ownerless document, a release finishes green over documents nothing can read and no later save repairs |
| Renames bundled with the backfill | The entire cost of a rename is touching live data, which the backfill is doing anyway, and the SPA subscriptions that a rename breaks are small and account-based today |
| The stores hold the active planner only | Holding several planners' arrays would buy an instant switch back and nothing else — the inbound guard already drops a document from any other planner, so a flat store with a recorded owner is already correct — against changing `jobArray` and `groupArray` where they are read in some 270 places |
| A gap is reloaded through, not replayed | JetStream holds `doc.update` for an hour, so a gap can outlive the history and the reload has to exist whatever else does; replay would be an optimisation on a path already built, and `loadPlannerDocuments` is that path |
| A member is never named on screen | Naming a holder, an author or a viewer is a product change this project does not want. What remains is telling *another tab of mine* from *another member*, which decides whether a control is offered at all — a fact about the viewer, not an identity |
| A remote change is applied silently where it is only being read, and surfaced where it is being edited | The same instinct as a child job that does not resize under its parent: what a reader is working in is not overwritten beneath them, and what they are merely looking at has no edit to lose |
| A shared planner has no roles yet, and gets them as designed | Permissions are separate, pluggable work with three hooks already reserved; every member may do everything until that lands, which is a stated position rather than an oversight |
| A figure whose value depends on the reader is not stored on the document | Both of a setup's estimates were written into the shared job — the time and the install cost — and both are derived from the skills and clone state of the character the setup names, which on a shared planner belongs to somebody whose data this account cannot read. A stored figure has one value for every reader, so it was wrong for all but the member who last wrote it, and silently. Working each out where it is shown removes the write paths that were corrupting them, and one function decides whose character a setup is quoted against |
| Stale-snapshot writing is document-write-granularity's | Whole-document writes with no precondition are the shape of the SPA's persistence everywhere, so the fix is that project's conditional write on `_meta.revision`; Stage J keeps only what is wrong without it |
| Where the grants ceiling is read from is still open | It cannot be taken until Stage E's revocation path and Stage F's grant task settle, because the stored list is where a revocation is applied rather than only a cache |
