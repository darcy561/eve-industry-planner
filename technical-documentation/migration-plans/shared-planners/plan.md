# Shared planners — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

A user works inside a **planner**. Today they have exactly one and it is implicit — everything they
own is filtered by their account id. This project makes the planner explicit, so a user can hold
their own planner and also work inside planners shared with other people: a corporation's, an
alliance's, or a custom one they created and invited a chosen set of accounts into.

Each planner holds its own jobs, its own groups and its own archive. A job archived from a planner
lands in that planner's archive and nowhere else.

The project is finished when every scoped surface reads an **owner** rather than an account id, and
when the difference between a personal planner, a custom shared planner and a corporation planner is
which **membership provider** fills the roster — not a separate code path.

## Starting position

Enough of this already exists that the project is mostly about finishing a shape rather than
inventing one.

**Already owner-shaped.** `models.StatsOwner` is a `{Kind, ID}` pair with `account`, `corporation`
and `alliance` kinds, a `Key()` of `kind:id`, and a parser. The statistics machinery is built on it
throughout: `Mongo.QueueOwnerWork`, `BumpOwnerClaim`, `OwnerRecalculationState`,
`RecordOwnerWorkFailure`, `StatisticsOwners`, `OwnersDueForReconcile`, and the worker's failure
handling all take a `StatsOwner`. The rebuild queue's `_id` is already an owner key. Every one of
those call sites happens to construct `models.AccountStatsOwner(accountID)` — the seam is in place
and only the account kind is ever passed through it.

**Already ceiling-shaped.** `auth.SessionGrants` holds `CorporationRefs` and `AllianceRefs` on the
account's session record in Redis, written by `UpdateAccountSessionGrants` from the ids ESI supplied.
The websocket copies them onto a connection as `grantedCorpRefs` / `grantedAllianceRefs` and
`ApplyRealtimeScopeUpgrade` refuses anything outside them via `filterToAllowed`. The record carries a
`GrantsVersion` used for compare-and-set in `account_sessions_cas.go`, so grants already have a
monotonic version to hang invalidation on.

**Already tenant-shaped.** `wsplacement` builds `account:{id}`, `corporation:{corpRef}` and
`alliance:{allianceRef}` tenant strings, and `TenantStringFromRouting` picks between them. NATS
subjects, hosted-tenant filters and the affinity cookie are all built from those strings.

**Now owner-shaped.** `models.MetaData` carried `AccountID` plus optional `CorporationRef` and
`AllianceRef` — one field per scope, with the changestream reading the field *names* out of a raw
`_meta` subdocument. Stage A replaced all three with a single `Owner`, and that code is in: see § Stage A
for what landed and [overlay.md](./overlay.md) § Stage A for how a document states its owner today. The
cutover window against live has not been run.

**Already landed since, under [archived-jobs-stats](../archived-jobs-stats/plan.md).** The statistics
half is done: `models.Owner` exists, the three statistics documents carry a root owner with ids
leading on the owner key, the collections took the names they hold, and the statistics API is
`/api/v1/statistics/{owner}/{view}`. What remains is the `_meta` reshape above.

**Not built at all.** There is no planner collection, no membership, no invite, no notion of an active
planner on the client, and no way for one account to see another's data by any path. The Go types for
the first three exist but are wired to nothing — see § Data models.

**Live.** The `Public` branch is deployed with real data, so every storage change in this project is a
migration against a running system, not a reseed.

## One planner, four membership providers

Corporation and alliance are not really scopes in the current code — they are **membership sourced
from ESI**. Nothing downstream of `UpdateAccountSessionGrants` asks why an account is a member of a
corporation; it compares refs against a ceiling the server minted. A custom planner is therefore not
a fourth scope. It is the same primitive with a different source of truth for the roster.

**Access is one question for every kind: does this account hold a membership row for this planner?**
Nothing above that asks how the row came to exist. A provider does one job — keeping the rows current:

| Provider | Writes rows when | Roster endpoints |
|----------|------------------|------------------|
| `owner` | the account is created — one row | none |
| `invite` | an invite is redeemed, or a member is removed | invite, accept, remove |
| `accessList` | a scheduled poll of a bound access list is reconciled | none |
| `entityMember` | token refresh reconciles rows against the corporation and alliance ids ESI reports | none |
| `esi-alliance` | the same, for alliance ids | none |

Deriving corporation access from session grants instead, and rows only for custom planners, was
rejected: it would make the authoriser branch on provider, which is the one place that must not. One
mechanism also means the roster, the member count and the future permission model work identically
everywhere, where a grants-only corporation planner could answer none of the three.

The provider therefore decides two things and nothing else: when rows are written, and whether roster
mutation endpoints exist. Every other surface — jobs, groups, archive, statistics, routing, the SPA —
is provider-blind. **That is the test for whether this abstraction holds.** If a surface has to ask
which provider a planner uses in order to do its job, the abstraction has leaked and the design is
wrong at that point.

The ESI reconcile runs on the token-refresh path, so it compares before writing: derive the current
corporation and alliance set, and touch rows only when it differs from what is stored. That is a
no-op on almost every refresh, and `GrantsVersion` already exists to carry the comparison. A
corporation planner is created lazily, when the first member of that corporation appears — nobody
explicitly creates their corporation's planner.

Rows exist only for accounts that use the planner. EVE corporation membership is never enumerated: a
row appears when an account already in the system reports that corporation id, so a corporation of
eight hundred pilots with six planner users holds six rows. Roster size is bounded by app users, not
by corporation size, which is why the roster is a collection of small documents rather than an array
on the planner — an array would meet both the document size limit and write contention on the way.

Roster mutation on an ESI provider must **refuse with 403, not silently no-op**. You cannot kick
somebody out of their own corporation, and a UI showing a working-looking invite button that quietly
does nothing is worse than one that is absent.

### Why custom planners are built before corporation planners

Custom planners have no external dependency. Their roster is rows we own, their ids are ours to mint,
and their entire membership lifecycle is testable without ESI. They exercise every seam a corporation
planner needs — owner on documents, ceiling, routing, per-planner archive, the SPA's active planner —
with the one part that is hard to control (membership) under our control.

Corporation and alliance planners additionally depend on
[entity-id-encryption](../entity-id-encryption/plan.md) having landed, because their planner ids
**are** the corp and alliance refs. Building them first would block this project behind another one
for no gain. Built last, they are a membership provider and a grants computation over machinery that
is already carrying real traffic.

## The owner key is the identity

Every scoped document carries one owner: a `{kind, id}` pair, serialised as `kind:id` by
`StatsOwner.Key()`. The ids are deliberately chosen so that **no value already in flight changes**:

| Kind | Id | Minted here? |
|------|-----|--------------|
| `account` | the account id | no — already exists |
| `corporation` | the corporation ref | no — owned by entity-id-encryption |
| `alliance` | the alliance ref | no — owned by entity-id-encryption |
| `planner` | a ULID minted at creation | **yes, and only here** |

Because the account planner's id is the account id and the corporation planner's is the corp ref,
`owner.Key()` is byte-identical to the tenant strings `wsplacement` already emits. NATS subjects,
websocket pools, lock partitions, the affinity cookie and the statistics owner keys keep their present
values across the whole migration. What changes is where a document's owner is **read from**, not what
it is. That is the difference between a field migration and a routing migration, and it is worth
preserving deliberately.

The one genuinely new value is the custom planner's ULID. It is random, so it is not enumerable, and
it is ours, so it never goes near `shared/crypto/entityid`. That cipher exists because EVE ids are
real-world identifiers we did not mint and must be able to hand back to a client. A planner id has no
such constraint: mint it opaque and store it as it is.

### Owner key and owner handle

Two forms of the same value, differing only for the two ESI kinds:

| Form | Contains | Where it lives |
|------|----------|----------------|
| **Owner key** | `corporation:{ref}`, `alliance:{ref}`, `account:{id}`, `planner:{ulid}` | documents, subjects, tenant keys, lock partitions, logs, grants |
| **Owner handle** | `corporation:{raw EVE id}`, and otherwise identical | request paths, client payloads, the SPA |

The conversion is exactly the boundary that performs it today: `refsForRequestedIDs` on the way in
and the outgoing client payload on the way out. Account and planner kinds pass through untouched
because their ids are already client-safe. This keeps the standing rule intact — refs stay refs until
the last hop before the bytes reach a browser — and means the SPA never holds a ref for any kind.

## The account planner is the base case

Every account gets a real planner document at signup whose `_id` **is the account id**, with kind
`account` and provider `owner`. Not a synthesised pseudo-row: a real document, so there is one code
path everywhere, and so per-planner settings have a home from the first day.

Because the id is the account id, the backfill never rewrites an owner *value* — an existing
`_meta.accountID: "abc"` becomes `_meta.owner: {kind: "account", id: "abc"}` carrying the same string.

**Multiple personal planners are deferred.** An account gets exactly one `account`-kind planner,
created automatically and never deleted. This costs nothing later: a solo private planner and a
shared planner with one member are already the same document shape, so lifting the restriction is a
change to a creation rule, not to the model. Nothing in this project may assume "one planner per
account" anywhere below the creation endpoint.

## Identity is not a credential

The central security requirement is that **knowing a planner's id must never be sufficient to reach
it**. Three values, deliberately distinct:

| Value | Secret? | Purpose | Where it may appear |
|-------|---------|---------|---------------------|
| Planner id | no | names the planner | URLs, logs, subjects, tenant keys — assume it leaks |
| Membership row | n/a | **the only thing that grants access** | server-side storage only |
| Invite token | **yes** | one-time or limited authority to *create* a membership row | shown once to its creator; stored hashed |

A planner id is unguessable because it is a ULID, but unguessability is not the security. The security
is that every read and every write authorises against a membership row for the requesting account,
resolved server-side. A request naming a planner the account has no row for is a 404 — not a 403,
which would confirm the planner exists.

An invite token is a 256-bit random value, stored **hashed** exactly as a password is, with an expiry,
a maximum use count, an optional binding to a specific account, and revocation. Redeeming it creates
a membership row and spends or decrements the token; the token itself never grants access to anything
and is never logged.

So the two cases the question was really about resolve like this:

- **Someone has the planner id.** They get a 404. It names something they have no row for.
- **Someone has an invite link.** Revoke the token and the link is dead. Bind it to an account and it
  only ever works for that account. Set a use count of one and the second person to try is refused.

### Every planner is private

There is no directory, no search, and no request-to-join. A planner is reachable by the people it was
made for and nobody else: an account planner by its account, a corporation or alliance planner by
members of that group, a custom planner by the people who were let in.

This is a decision about what the tool is, not an unbuilt feature. A planner is a working surface for
industry jobs, not a place to find groups or advertise them, and its users already know who they want
to work with. A directory would add moderation, spam and social-discovery surfaces to an application
that needs none of them.

Admission to a custom planner is therefore always something the owner hands out or binds:

| Path | How | Provenance recorded |
|------|-----|---------------------|
| Invite link | a valid, unspent, unrevoked token | `JoinMethod.Invite` |
| In-game access list | membership follows a list read from ESI | `JoinMethod.AccessList` |

Corporation and alliance planners take neither: membership follows the corporation or alliance itself.

Because nothing is discoverable, a planner id leaking reveals a planner exists and nothing more — the
membership row remains the only thing that grants access, and an id names something the requester has
no row for.

#### Access lists differ from the other ESI providers

ESI exposes a character's access lists — a listing route and a detail route,
`GET /characters/{id}/access-lists/{acl_id}` — returning the characters, corporations and alliances on
a list and whether each is allowed or blocked. Only a character who **manages** the list may read it.
The exact scope name, field names and cache timing are not settled here and must be taken from the
OpenAPI spec before implementation.

Four consequences make this a different shape from the corporation and alliance providers, which
reconcile as a side effect of each member's own token refresh:

- **It depends on one privileged token.** Only a managing character can read the list, so a bound
  planner's membership hangs on that character's token remaining valid and scoped. The binding also
  points at a member: if that account leaves the planner or unlinks the character, the binding is
  orphaned and the roster silently stops updating. Both are the same lapse, and want the same answer —
  freeze the roster or fail closed — which is a decision this owes. `LastPolledAt` is what detects it.
- **It is polled, not pushed.** The list must be fetched and matched against accounts on a schedule,
  which belongs to the worker and scheduler rather than the refresh path. Removal latency is the poll
  interval rather than a token refresh.
- **Entries are entities; membership is per account.** An entry naming a corporation grants access to
  any account with a linked character in it, so the matching rule has to be defined — and a member's
  access can change because *they* changed corporation, though the list did not.
- **Blocked beats allowed.** A blocked character inside an allowed corporation gets nothing. The naive
  union of allow entries gets this backwards.

### Permissions are separate work, and must be pluggable

This project does **not** define a permission model, and defining one is deliberately separate work.
What this project owes is that **any** permission model can be plugged into a planner afterwards, and
that a planner which is not account scoped can choose its model — or run more than one at once.

The separation that makes that possible is the one this project must get right:

| Question | Answered by | Owned here |
|----------|-------------|------------|
| May this account reach this planner at all? | a membership row | **yes** |
| What may they do once inside it? | a permission model | **no** — plugged in later |

Membership stays a single yes/no per account per planner, so the access check remains one cheap query
with one shape. Permissions layer on top of it. Because they are layered rather than merged, several
models can be active on one planner and compose, where a single blended notion of "membership plus
rights" would force one model per planner forever.

Models that should be able to attach without reshaping anything built here:

- in-game corporation roles from ESI (Director, Factory Manager, and the rest),
- a custom scheme defined inside the planner,
- ESI access templates or titles mapped onto planner permissions.

**What this project must therefore provide, and nothing more:**

1. **One authorisation seam.** Every gated path calls a single helper. Today it answers only "does
   this planner hold this capability"; a permission model attaches to that same helper rather than
   growing a second gate beside it.
2. **Somewhere on the planner to name its models.** A per-planner choice that nothing derives, and
   eligible by kind — in-game roles mean nothing on a custom planner, and an account planner has one
   member and needs no model at all.
3. **No global role vocabulary.** A role name belongs to the model that issued it, so the membership
   row's `Role` field is reserved and left uninterpreted rather than filled with a scheme this project
   invented.

Because a permission model is not needed to ship, the one thing that genuinely is — **who may invite
and remove members** — is answered without one. `Planner.CreatedBy` names a single distinguished
account, which is enough for custom planners and prejudges none of the models above.

**Open, and belonging to that later work:** how two active models combine — whether any model granting
is sufficient, or every active model must agree. That is a permission decision, not a membership one,
which is why it can be left open here without blocking anything.

### Losing access

Corporation grants refresh when the token refreshes, which is fine when the game is the authority.
A kick from a custom planner has to bite sooner, because the removed member is probably connected.

Removing a membership row does two things. The account's stored grants are rewritten from the rows it
holds now, which closes every surface that reads the ceiling and bumps `GrantsVersion` under the
existing compare-and-set. And the new ceiling is announced on `session.grants.changed`, which every
websocket replica consumes: each narrows the connections it holds for that account, clearing the planner
from `Client.Scopes` and from the reverse indexes.

There is no scope fan-out to ride. A connection's scopes are derived at connect and changed by one
thing, the client's `active_planner` message, so the announcement is a subject of its own rather than an
existing one reused. No lock is acquired around the membership write; the announcement is the mechanism
for making other sessions current, and it carries the whole ceiling so a replica that missed one is not
left behind.

### What a connection subscribes to

A browser needs two things at once, and they change on different schedules: the documents of the
planner it is looking at, and the account's own documents, which stay live whichever planner that is.
A connection therefore holds **two subscriptions**, both derived by the server:

| | Owner | Collections | Changes when |
|---|-------|-------------|--------------|
| Account | `account:{accountID}` | `accounts`, `account_settings`, `watchlist_deprecated` | Never, for the life of the connection |
| Planner | the active planner's owner key | `jobs`, `job_documents`, `job_groups`, `planner_settings` | The client switches planner |

**One planner is active at a time.** Switching is one message naming one owner handle, intersected
against the grant ceiling; the account subscription is untouched by it. Nothing enumerates documents, so
switching a planner holding five jobs and one holding five hundred cost the same. This has landed —
see [overlay.md](./overlay.md) § Stage E.

**The delivery gate is a pair, not an owner.** Routing on the owner alone is not enough, because
`account:{id}` owns both the account's settings **and** the jobs of that account's own planner. A member
viewing a corporation planner wants their settings and not their personal job feed — the same owner
key, different collections, opposite answers. Every change stream message already carries both the
owner and the collection, so the pair is available wherever the decision is made.

When the active planner *is* the personal one, both rows carry `account:{id}` with different collection
sets. That composes rather than needing a case of its own.

**The collection set follows from the owner's kind, and the client never names it.** A client asking
for an owner cannot ask for a collection set that owner's kind does not have, and a collection added to
a kind reaches every planner of that kind by editing one server-side table — the same shape as
§ Capabilities are derived, never stamped. The three groups in `changestream.CollectionGroups()`
already partition these concerns.

Group templates **are** in the planner set, which reverses what this section said before: they shipped
account-owned with no owner block, and the reasoning for keeping that shape did not survive the settings
split. See § What a planner owns.

**Explicit document subscriptions are unchanged and orthogonal.** `subscribe` and `unsubscribe` name
individual document ids and remain the escape hatch for a document outside both subscriptions — a job
someone linked. What changes at Stage C is what authorises one: `docSubscribeAuthorized` tests
`ExistsByAccountID` today and becomes an owner and membership test.

### Why the client no longer asks for scopes

The present design has this backwards. `upgrade_scopes` has a browser send raw EVE corporation and
alliance ids, which the server ciphers to refs and checks against the ceiling. Three things are wrong
with it under an owner model.

It asks the client for something the server already knows: the ceiling is on the session record at
connect, so a request can only ever select from what is already there. It is the only client-supplied
input on the authorisation path, and the only reason a raw id to ref conversion exists there. And it
can only ever widen — the merge is a union, so **nothing can stop receiving a scope short of
reconnecting**, which is precisely what switching planner has to do.

The account kind never went through it: account delivery is derived from the authenticated id at
connect. That asymmetry is the tell. Under one owner vocabulary both are the same thing, so both are
derived, and the client's only say is which planner is active.

No client sends `upgrade_scopes`: the SPA sends `session_resume`, `subscribe`, `unsubscribe` and the
doc-lock frames, and nothing else. So it was removed rather than reshaped, and the narrowing message
that replaces it — `active_planner` — landed at Stage E with the switcher that sends it.

### Limits

Caps belong in this project rather than being discovered under load: planners created per account,
members per planner, pending invites per planner, and a rate limit on invite creation and redemption
through the middleware that already exists. A join or invite endpoint without a limit is an invitation
to fill the database.

## What each surface owes

| Surface | Today | After |
|---------|-------|-------|
| `models.MetaData` | **done** — one `Owner` block; scope fields gone | — |
| `jobs` | **not built** — the layout below splits a job's record from its body, but no environment holds a `jobs` collection and nothing writes one. Every job lives in `job_documents`, and both readers now name it | the split performed, `jobs` populated, an owner-led index spec, and both readers moved together |
| Websocket delivery branch | account, corporation and alliance owners deliver; a `planner` owner has no branch and is logged | a planner branch, so a planner's documents reach its members |
| Changestream routing | reads named `_meta` scope fields | reads `_meta.owner` generically |
| `models.ArchivedJobStats` | **done** — carries a root `Owner` | — |
| Collections | **done** — `jobs`, `statistics_rows`, … | named for what they hold; ownership lives in the document |
| Document ids | **done** — `{ownerKey}\|{jobID}` | — |
| Rebuild queue / rota | owner-keyed already | unchanged; enumerates planners rather than accounts |
| Statistics API | **done** — `/api/v1/statistics/{owner}/{view}` | — |
| `SessionGrants` | `CorporationRefs` + `AllianceRefs`, filled from ESI at token refresh | one list of owner keys, including the account's own; shape in Stage B, filled from membership rows in Stage C |
| `RealtimeScopes` | `CorporationRefs` + `AllianceRefs` | one list of owner keys |
| `upgrade_scopes` / `scopes_ack` | corp and alliance id arrays, sent by no client | removed; a Stage E message names the active planner instead |
| Connection subscriptions | account delivery derived at connect, org scopes requested | both derived from the ceiling; owner and collection set per subscription |
| SPA query keys | rooted at `statistics` | owner in every scoped key |
| SPA state | account id implied everywhere | an explicit active planner |
| Extras categories, job status ids | per account | the planner's, because their ids key shared documents |
| Recalculation | re-derives structure, ME and character from whoever triggers it | preserves the build context of the setup it rebuilds |
| Close cascade persist gate | tests the edited job's lock | covers every document the close writes |

Two known gaps that this project inherits rather than creates.
`DocLockFiltersForHostedTenants` only understands the `account:` prefix, so lock selectivity for
non-account owners is already deferred; it becomes visible once shared planners carry real traffic.
And the `account_*` collection names are shared by every kind under this model, so the rename that
[archived-jobs-stats](../archived-jobs-stats/plan.md) deliberately parked as "the expensive part"
now definitely happens. It has: [archived-jobs-stats](../archived-jobs-stats/plan.md) § 2 shipped ten
`CollectionRenames` entries, one per collection live actually holds and still needs.

## Collection layout

One collection per document type, with the owner on the document — **not** a collection per owner
kind. A per-kind split would put the kind back into every code path, because each read would pick its
collection from the owner's kind: a switch on kind at every call site, which is the leak this design
exists to prevent. It also multiplies the watched collections the changestream carries, turns the
reconcile rota's single query into a fan-out, multiplies index specs and Deployment Tool ensure
entries, and turns any future move between planners into a cross-collection copy.

The argument for splitting is blast radius — a query that loses its owner filter cannot leak across
kinds. It defends the wrong boundary. A dropped filter still leaks across every account inside the
account-kind collection, which is the largest and most sensitive set by a wide margin. The defence
that covers both boundaries is a shared query helper that always applies the owner, with tests on it,
and that is what this project builds.

A collection is named for **what it holds**. The owner block on the document says who owns it, so a
name that also encodes ownership states the same fact twice and goes stale the moment another kind is
added — which is the flaw in the present `account_` prefix, and would be the same flaw in a `planner_`
one. Archived jobs are archive documents; a rebuild queue is a rebuild queue.

A scope word earns its place in a name only when it **disambiguates**: `account_settings` keeps its
prefix because a planner may later carry settings of its own and the bare word would be ambiguous, and
`planner_memberships` keeps its prefix because that collection is genuinely *about* planners — the
prefix names the subject, not the owner.

| Collection | Holds | Owner |
|------------|-------|-------|
| `accounts` | user account documents | the account |
| `account_settings` | application settings for an account | the account |
| `group_template_catalog`, `group_template_payloads` | saved group templates | the account |
| `planner_status_ids`, `planner_extras_categories` | the two shared id spaces (may live on the planner document) | the planner |
| `jobs` | jobs on a planner | `_meta.owner` |
| `job_documents` | the job document bodies | `_meta.owner` |
| `job_groups` | groups of jobs | `_meta.owner` |
| `archived_jobs` | archived job documents | `_meta.owner` |
| `statistics_rows` | one archived job reduced to its figures | a root `owner` |
| `statistics_timeline` | monthly figures per item | a root `owner` |
| `statistics_totals` | lifetime totals per item | a root `owner` |
| `statistics_rebuild_queue` | outstanding statistics work | owner key as `_id` |
| `statistics_reconcile_rota` | when each owner was last reconciled | owner key as `_id` |
| `planners` | the planner documents, every kind | — |
| `planner_memberships` | who is in a planner, and as what | — |
| `planner_settings` | the settings a planner's work is done under | — |
| `shared_blueprints`, `shared_citadel_names` | global reference data | nobody |

The resulting set is deliberately ragged rather than uniform. A rename list that comes out
pleasingly symmetrical is a sign the prefix is being applied as a sweep rather than chosen per
collection.

The `statistics_` prefix is the case where a prefix does earn its place. It names the **subject** —
these five hold statistics — in the same way `planner_memberships` names what its collection is about,
and it matches the vocabulary the API route and the SPA query keys already use. That is the opposite
of an owner prefix, which would restate what the document's own owner field says.

The statistics documents carry their owner at the **document root**, not under `_meta`: they are
derived rows rather than documents a user owns, so they have no `_meta` block at all. Only the base
collections carry `_meta.owner`.

Two consequences. Every owner-scoped index leads with the owner. And document ids take the owner key
in place of the account id — `ArchivedJobStatsDocumentID` becomes `{ownerKey}|{jobID}`, giving
`account:abc|job1` or `planner:01J…|job1`; the existing `|` separator still works because the owner
key's own separator is `:`.

### Every owner-scoped document id carries its owner

The derived statistics collections took this shape first. The base collections need it for a harder
reason: **`_id` is globally unique**, so a bare `jobID` cannot exist twice, and an upsert filtered on
`{owner, _id}` matches nothing when the same id exists under another owner — then tries to insert and
fails on the duplicate key. Filter and id have to agree, and the only way they agree is for the id to
carry the owner.

So `job_documents`, `job_groups`, `archived_jobs`, `group_template_catalog` and
`group_template_payloads` all take `{ownerKey}|{id}`. The catalogue is the exception already recorded
above: its `_id` **is** the owner key, because there is one catalogue per owner.

`archived_jobs` has the defect today, before any of this project's changes: its upsert filters
`{_id: jobID, _meta.owner.id}` with upsert true, which is the same mismatch. Fixing it alongside the
others also collapses a duplication — an archived job's `_id` becomes identical to
`ArchivedJobStatsDocumentID`, so the statistics row id stops being separately computed and becomes the
job's own id.

**The id is split at the boundary, and the client never sees the stored form.** A browser keeps
sending and receiving the bare id — it is what a URL carries, what the job store keys on, and what
`docID` means on the wire. The server composes the stored id from the owner it already knows. This is
the same rule `shared/protectedfields` states for entity refs: the stored value and the client-facing
value differ, and the boundary converts. The SPA therefore needs no change for this.

Three server-side conversions follow: the changestream emits the bare id as `docID` while the message
continues to carry `ownerKey` separately; every read and write filter composes the id from owner and
bare id; and document-subscribe authorisation resolves a bare id within the connection's planner
rather than globally. That last one costs nothing today — **no client sends `subscribe`**, because a
connection subscribes to a planner and receives everything in it.

**The migration merges into the owner walk.** `stampMetaOwner` already visits every scoped document to
give it an owner; the id rewrite needs that same owner, so it happens in the same pass rather than as a
second walk over the largest collection in the database. `_id` is immutable, so each row is written
under its new id and the old one removed — which is why doing it in one pass rather than two matters.

**Only a user's own writes count.** `BulkUpsertJobs`, `BulkUpsertGroups` and the archive write
increment the version; the generic `UpsertStructsWithMetaBulk` and `UpsertStructsPreservingMetaBulk`
paths do not, and should not. Those are server-side rewrites — schema maintenance, the statistics
rebuild, the SDE import — and a document a person has not touched has not changed for the purpose a
conditional write asks about.

**The same pass seeds `_meta.revision`.** A per-document write counter is owed by
[document-write-granularity](../document-write-granularity/contents.md) § Stage A, and a field costs
nothing in a pass already rewriting the row. Nothing here reads it; it is seeded so that stage never
meets a document without one. Writes increment it through `SetDocumentWithRevision`, which sets `_meta`
by path — Mongo refuses `$set` of a subdocument alongside `$inc` of a path inside it, and setting the
block whole would reset the counter to whatever the caller's struct held.

### Collection size

Putting every owner's documents in one collection does not make queries slower, and splitting by kind
would not make them faster.

Every owner-scoped index in `index_specs.go` leads with the owner key, which took the leading
position the account id used to hold; the index shape is otherwise unchanged. An owner-led index seeks into
a contiguous range of the B-tree and walks only that owner's entries, so growth costs tree depth,
which is logarithmic — one extra level of page reads between a hundred thousand documents and a
hundred million. What costs real time is scanning documents that are then discarded, and an owner-led
index never does it.

`job_documents` already holds every account's jobs in one collection. This design does not introduce
multi-tenant storage; it generalises who the tenant is. (`jobs` appears in the layout below and in
`knownCollections`, but no environment holds it and nothing writes one — see § What each surface owes.)

**The sync read `jobs` and got nothing; it now reads `job_documents`.** `QueryAllJobsForAccount` named
the unbuilt collection, so every sync payload omitted its jobs key — the caller guards on
`len(allJobs) > 0`, and an account with no jobs looks identical, so nothing reported it. No user saw it,
because the SPA fetches planner jobs over `GET /api/v1/job-documents/planner`, which reads the right
collection. The sync and that handler now build the same filter against the same collection, and two
live tests hold them to it.

The filter also carried an `$or` over a legacy `isIncludedOnPlanner`. No document holds that field and
no Go model declares it, so the branch matched nothing; it is gone, and the filter is the one the HTTP
read uses.

The worker's inactive-account cleanup still deletes from `jobs` as well as `job_documents`. That is a
no-op today and correct after the split, so it stays.

**When the split happens, both callers move together.** Whichever collection ends up holding a job's
record, the sync and the planner read must name it — and the failure mode to design against is this
one: a query pointed at an unbuilt collection returns empty, which is indistinguishable from an account
with no jobs.

A per-kind split would also miss its target. Account-kind documents are the overwhelming majority, so
splitting the other three kinds out shrinks the small collections and leaves the large one untouched.
It makes memory worse rather than better: each collection carries its own copy of every index, so four
namespaces compete for the working set where one would stay hot.

The measures that matter, in order:

| Measure | Why |
|---------|-----|
| Every owner-scoped index leads with the owner | The one real failure mode is a filter that puts another field first and walks other owners' index entries. A code rule, not a schema one |
| Partial indexes where a flag splits the set | Already landing for the archive's revoked rows |
| No unbounded arrays inside a document | Growth belongs in row count, not document size |
| Sharding on the owner key, if it is ever needed | Distributes evenly across owners, and works better with one collection than four |

If size ever did become the binding constraint, the lever would be time-partitioning the archive or
sharding on the owner key — not a per-kind split, which addresses the wrong axis.

**Group templates were an open question and are now settled the other way.** They shipped as
`group_template_catalog` and `group_template_payloads` with no owner prefix, and the owner backfill's
collection list does not include them, which read at the time as settling them account-owned. The
settings split overturns that: a template preset stores `customStructureID`, so a template only means
anything against a settings document, and a settings document is the planner's. They become
planner-held, with application allowed across planners — see § What a planner owns.

## Ownership is decided at creation

A document's owner is **the planner it was created in**. It is written once, at creation, from the
active planner on the request, checked against the ceiling. It is never derived from a correlated
field on the document, and it never changes afterwards except by an explicit, audited move.

This supersedes the open question in
[archived-jobs-stats](../archived-jobs-stats/plan.md) § Stage C — that project's Stage C, not this
plan's — which is blocked on "nothing yet
decides from [the corporation and character ids the SPA records] that a job is corporation scoped and
stamps `_meta.corporationRef`". Under this model that decision does not exist, and the half-built
inference producer is not finished — it is dropped. The corporation and character ids the SPA records
remain useful for linking ESI jobs; they are not evidence of who owns a job.

The rule matters beyond convenience: inferring an entity from a correlated field (a character, a
station, a blueprint) produces attribution that is wrong in exactly the cases that are hardest to
notice. An owner is recorded, or it is not known.

**Nothing carries the active planner onto a request yet.** `BulkUpsertJobs`, `BulkUpsertGroups` and
`PopulateRequestMeta` all stamp the writing account as owner, and every read filter is pinned the same
way. So no document has ever been owned by a planner other than its writer's account, and the
delivery branches for the other kinds — built and correct — have nothing to deliver. The owner on the
request is therefore the first slice of the client work, ahead of the document load: a read by
owner is empty for every planner nothing writes to.

While the SPA is being wired around, a request that names no owner is treated as the account's own,
so today's clients keep working. **That leniency is scaffolding with an expiry**: when the live
planner cuts over, the owner becomes required on every scoped write and read, and an absent one is
refused. It is listed in § Wire compatibility as owed at cutover so it is removed rather than left.

## Features differ; nothing branches on kind

A corporation planner offers things a personal one does not, and a shared planner needs coordination
features a single-member one has no use for. That does not contradict the provider-blind rule above,
which governs **data** surfaces — jobs, groups, archive, statistics and routing never ask what kind of
planner they are in. Features are a separate axis, and the way to vary them without reintroducing the
branch is to gate on **capability rather than kind**.

A component or handler asking `kind == corporation` means every new kind is an audit of every branch,
and a five-member custom planner cannot have a feature it obviously wants. So the planner document
carries a capability set, and everything downstream asks whether the planner has a capability.

| Layer | Decides | Where it is read |
|-------|---------|------------------|
| Kind | the membership provider, and which capabilities are eligible | one derivation function |
| Capabilities | what this planner can do | everywhere — panels, endpoints |
| Permissions | who inside the planner may use a capability | a pluggable model — see § Permissions are separate work, and must be pluggable |

Kind is chosen once and is immutable, but it is *read* every time capabilities are derived. That does
not reintroduce the branch this section exists to prevent, because the read happens in a single
derivation function rather than in panels and handlers.

### Most "corporation features" are really multi-member features

Claiming a job to build, recording who supplied materials, payout splits, an activity log, a shared
shopping list with claims, seeing who is working on what — a five-person custom planner wants all of
these as much as a corporation does, and a corporation planner with one active member wants none of
them. The axis is **single-member versus shared**, not corporation versus custom, and capability
defaults should follow that rather than kind.

This is also what keeps the personal planner uncluttered without special-casing it: an account planner
has one member, so the shared capabilities are simply absent and their panels never render.

The genuinely kind-specific capabilities are the ones that need a real EVE entity behind them —
corporation wallet, assets, blueprints and industry jobs, all of which come from corporation ESI
endpoints and cannot exist where there is no corporation.

### Capabilities are derived, never stamped

A planner does not store the capabilities it holds, and does not carry per-planner overrides either.
The set is a pure function of the kind and the current member count:

```
capabilities = eligibleFor(kind, memberCount)
```

The kind is a template, so every planner of a kind behaves identically. An override list would break
exactly that: two corporation planners could differ for reasons no reader can see, and it would need a
settings surface, a rule for who may toggle, and an answer to "why does mine not have this?".

Storing the resolved set instead would be a parallel copy of a derivable fact, which the one-SoT rule
forbids, and it would go stale twice over: a capability added later would reach no existing planner
without a backfill, and a planner growing from one member to two would never gain the coordination
features that growth is meant to unlock.

Each capability declares which kinds may hold it and what it requires. A corporation wallet view is
eligible only on a corporation planner; task assignment is eligible on any planner with more than one
member.

**Not wanting to see a feature is a display preference, not a capability.** An owner who finds the
task board cluttering wants it hidden for themselves, not removed for everyone else in the planner, so
it belongs with the account-scoped view preferences described in § Settings split between the planner and the account.

**Changing a template needs no migration, but it is retroactive.** Because nothing stores a
capability set, changing `eligibleFor` is a code change that reaches every planner at once, with no
document to upgrade. Adding a capability is therefore safe. **Narrowing or removing one is not**:
withdrawing eligibility takes the capability from every planner that held it in the same moment,
including whatever in-flight state it owned, so a removal carries the care of a breaking change and
needs an answer for its data. The discipline sits on narrowing eligibility rather than on migration.

Where a template change does imply a stored shape — a capability needing a new field on a job or on
the planner document — that is ordinary schema versioning through `documentschema.Upgrader`.
`planners`, `planner_memberships`, `planner_settings`, `group_template_catalog` and
`group_template_payloads` join `SchemaMaintainedCollections` when they land, since the scheduler rotates
that list and the batch dispatches on it. Invites are not there because they are not a collection — see
§ Invites.

**The provider is derived too.** It is one-to-one with the kind — `account` to `self`, `planner` to
`invite`, `corporation` and `alliance` to their ESI providers — so storing it would only create a
field that can disagree with the kind beside it.

What the planner document actually holds is therefore small: its id, name, member count, the place a
permission model will attach, and creation metadata. Nothing is discoverable and a custom planner
always admits by invite, so there is no setting for either.

The resolved set is computed at the response boundary and sent to the client with the planner, and it
is recomputed and pushed when membership changes — which the existing realtime fan-out already
carries. The only immutable properties of a planner are its id and its kind.

### Two constraints on the implementation

**One source of truth for the capability list**, which the API gates from and the SPA renders from.
A capability name typed into a component and again into a handler is the duplication this repo's rules
already forbid.

**A gated endpoint checks that the planner holds the capability**, through one shared helper. The
per-member permission check attaches to that same helper when a permission model is chosen, so there
is one place for it rather than a second gate grown beside the first.

Capabilities are not a rollout flag system. Keep the set small, and name each one for something a user
would recognise as a feature rather than for the code behind it.

## What a planner owns

The settings split below decides which *settings* belong to a planner. This section decides which
**collections** do, because `PlannerHeldCollections()` is the one place that answers it and Stage C
built it with three entries before the split existed.

The test is the same one the settings split uses: a collection belongs to the planner when its
documents hold references that only resolve inside a planner, or when its contents are the planner's
work rather than one person's view of it.

| Collection | Held by | Why |
|---|---|---|
| `jobs`, `job_documents`, `job_groups` | Planner | The planner's work; already so |
| `archived_jobs` | Planner | The planner's completed work, and it already carries the owner block |
| `statistics_*` | Planner | Derived from archived rows, so they follow with no decision of their own |
| `planner_settings` | Planner | New; § Settings split between the planner and the account says what is in it |
| `group_template_catalog`, `group_template_payloads` | Planner | A template stores `customStructureID`, which only resolves against a settings document |
| `accounts`, `account_settings`, `watchlist_deprecated` | Account | The person, wherever they are working |

**The archive was already owner-scoped and simply unlisted.** `ArchivedJob` embeds `MetaData`, and the
`prepareRelease` owner stamp writes `archived_jobs` alongside jobs and groups. Its absence from
`PlannerHeldCollections()` is an omission rather than a decision: a shared job archived into the
archiving member's personal history would take the planner's record of its own work with it, and the
statistics derived from those rows would disagree between members.

### The archive is read across planners without switching

Archive and statistics reads are **not** bound to the active planner. A member looking at their personal
planner can open the archive page and read a corporation planner's archive without switching, and the
switch is not implied by the read.

What makes that sound is that these are the two collections nothing edits live. The archive is written
once when a job is archived and read thereafter; statistics are derived and rebuilt wholesale. Neither
carries a document lease, and neither is delivered by the planner subscription in a way that a reader
of a second planner would race against — a change stream message for another planner's archive is one
this connection is not subscribed to, and the page's own read is what refreshes it.

So the rule is: **the active planner scopes what is live, not what is legible.** Realtime delivery
stays single-planner, because a connection editing two planners at once is the thing the replace-not-
merge subscription exists to prevent. A read of settled history is a query with an owner in it, and the
owner is a parameter of the request rather than of the connection.

Authorisation is `AccountMayReach`, which is already built and already reads the membership rows rather
than a session's cached grants. An archive read naming an owner the account holds no row for is a 404,
the same answer a planner read gives.

The consequence for the client is that archive and statistics query keys carry the owner they were
asked for, not the active planner — which the § Wire compatibility row for SPA query keys already
requires for a different reason.

### A template belongs to a planner, and can be applied to another

Templates are the planner's, so a corporation planner can hold the builds its members are expected to
use. An account's own templates are its account planner's, which is not a special case: every account
has one, so a personal library is the same mechanism with an owner of `account:{id}`.

**But applying a template is not restricted to the planner that holds it.** A member may apply their own
template into a shared planner, or a shared template into their personal one. The template is a recipe;
where it is stored says who may see it, not where its output may land. Restricting application would
make the account planner a trap — every template a person captured before joining a shared planner
would be stranded there.

That makes the read and the write two different owners, and the pair is what has to be authorised:
`AccountMayReach` for the template's owner, and again for the destination planner. Neither is the active
planner, and both come from the request.

**What does not travel is `customStructureID`.** A template preset stores one, and it resolves against
the settings of the planner that holds the *jobs* — so applying a template into another planner must
resolve or drop it rather than copy it across. Dropping it leaves the setup on its stored
structure/rig/system numbers, which are values rather than references and are correct on their own; the
job simply is not pinned to a custom structure the destination has never heard of. Resolving it by name
against the destination's structures is the friendlier behaviour and is worth doing if the names match,
but it is an enhancement over dropping rather than a requirement for correctness.

`CharacterToUse` behaves the same way: a character hash the applying account does not hold resolves to
their main, which is what building a job does today for any setup naming an unavailable character.

### The catalogue moves onto the owner block

`GroupTemplateCatalog` is the last model carrying a bare `AccountID` field, with `_id` set to the account
id. It moves to the owner block with the owner key as its `_id`, which is the shape `Planner` already
uses — the owner stored once rather than beside a duplicate of itself.

This is **migrate-required**, and the same shape as the Stage A stamp: existing catalogues are rewritten
under `account:{id}` in a `prepareRelease` step, which is where the payload documents' owner block goes
too. Both collections join `SchemaMaintainedCollections`.

## Settings split between the planner and the account

**This section previously argued that no split was needed. That was wrong**, and the reasoning that
replaced it is worth keeping visible because the original test was sound and simply was not applied to
every field.

The original argument: a job **stores its own results**. `build.materials`, `build.costs` and
`build.setup` are all persisted, and the setup records the structure, efficiency and runs actually
used. Settings are inputs at write time, not values read at render time, so a job is self-describing
— one member opening another's sees what that member built, not a recomputation under their own
structures.

That holds for **values** and fails for **references**. `Setup` stores `structureID`, `rigID`,
`systemTypeID`, `systemID` and `taxValue` as numbers, so the costs a shared job shows are right for
anyone reading it. But it also stores `customStructureID`, and that is a key into the **writer's**
settings document: `getCustomStructureWithID` reads the *viewing* account's `CustomStructures`, so a
member opening another's job finds the structure missing. The figures are correct and the place they
were made is gone.

The section already named the right test — a setting whose **ids are stored inside shared documents**
cannot be account-scoped — and listed two exceptions under it. `customStructureID` met that test too
and was missed.

**The rule, stated once:** if a job or a setup stores a reference to a setting, or the setting decides
how work is done in a planner, it belongs to the planner. If it only decides how one person sees their
own screen, it belongs to the account.

| Planner | Account |
|---------|---------|
| `CustomStructures` — referenced by `customStructureID` on every setup | `DefaultMarketLocation`, `DefaultOrderType` |
| Default structures per job type — what a job is built in | `EnableCompactLayoutView`, `DisplayHelpCards`, `HideCompleteMaterialsFromEditJob` |
| `PredefinedSystemIndexes` — the indexes the planner's costs assume | `EsiJobTab`, sort and expansion state |
| `DefaultMaterialEfficiencyValue` — an input to every job built here | `DefaultStationIDForAssets`, `ShareCitadelNames` |
| `ExtrasCategories` — ids stored in `build.costs.extrasCosts` | `EnableAutomaticJobRecalculation`, `EnableSkipMissingBlueprints` |
| `DefaultCitadelBrokersFee`, `ReprocessingSettings`, `ExemptTypeIDs` — they price the planner's work | `JobStatuses` names, which label a column rather than identify it |

**Denormalising the structure's name onto the setup was the cheaper option and is not enough.** It
would fix the display — the archive already does exactly that for extras category labels — but a
member *creating* a job in a shared planner would still be offered their own structure list, so the
planner would accumulate jobs built in structures none of its other members can use. The reference is
the symptom; whose settings apply is the question.

**What this costs.** A planner settings document, its collection, and a read path that resolves a
setting through the active planner rather than the account. Creation seeds it from the creating
account's settings, so a new planner behaves as its creator expects. Stage C built the planner
document without one, so this is an addition to that stage's collections rather than a change to them.

**What it buys**, beyond fixing the defect: a corporation planner can standardise the structures and
indexes its members build against, without every member re-entering them; a planner's costs become
reproducible by anyone who opens it; and per-planner defaults become a place to hang features that
have nowhere to live today.

Two settings were already exceptions before this, both for the same reason: **their ids are stored
inside shared documents**, so a per-account id space makes a shared document ambiguous.

| Setting | Where its ids are stored | Consequence |
|---------|--------------------------|-------------|
| `ExtrasCategories` | `build.costs.extrasCosts`, and `ArchivedJobStats.ExtraCategories` | A shared planner offers its own categories, so a member does not file a shared job under a category personal to them |
| `JobStatuses` | `job.jobStatus`, a stored integer index | A planner with six stages for one member and five for another hides jobs at the sixth from the second |

**The extras ids do not collide, and never did.** A new category is created with
`addExtrasCategory({ id: uuid(), ... })`, so its id is globally unique; ids `0`–`5` are the frozen
defaults every account shares with identical labels; and there is no rename — the only actions are
add, mark-deleted and unmark-deleted. Two members cannot mean different things by one id. What a
shared planner needs is therefore **scoping which categories are offered**, so a member does not file
a shared job under a category personal to them — not a migration of the id space.

**Names are stored, not looked up.** An archived row carries what each category was called when the
job was archived (`models.ArchivedExtraCategory`), because the id alone only resolves against a
settings document: one the archive cannot reach, that a second member does not share, and that loses
the name entirely when a category is deleted. See
[archived-jobs-stats](../archived-jobs-stats/plan.md) § Extras categories name themselves.

### Every other planner setting is in the same insert-only trap

`EnsurePlannerSettings` seeds the whole of `planner.Settings` from the account once and never again, so
what was true of `ExtrasCategories` is true of `CustomStructures`, `PredefinedSystemIndexes`,
`DefaultMaterialEfficiencyValue`, `DefaultCitadelBrokersFee`, `ReprocessingSettings` and
`ExemptTypeIDs`: a planner holds them as they stood at its account's first login.

It is not a defect yet. `SettingsUpdate` carries only `ExtrasCategories`, so the endpoint cannot change
the others, and the SPA still edits and reads every one of them from the account's own settings — so
nothing reads the planner's copies and nothing can go stale. It becomes a defect the moment one of them
moves, which § Settings split says they all eventually must.

**So a slice moving one of these owes a release step, not just a reader and a writer.** The shape is
`backfillPlannerExtrasCategories`: merge what the planner is missing, leave what it holds. A fourth copy
of that pattern is the point at which it should become one step covering every field rather than one per
field.

For `JobStatuses` only the **set of ids** must be the planner's. Labels could stay personal without
harming anything, since they name a column rather than identify it; whether that is worth the
complexity is an open question rather than a decision.

### Recalculation must preserve a job's own build context

Storing results is not by itself enough, because recalculation discards them.
`recalculateJobForNewTotal` clears `build.setup` and rebuilds it from `buildSetupContextForJob`,
which does not read the job's stored setup. It re-derives the material efficiency from the current
user's cached blueprints, the structure from their default-structure setting, and `characterToUse`
from their main character.

On a shared planner that means one member editing another's job rebuilds its setups under their own
structure, blueprint and character — discarding the ones the job was actually built with. Document
locks do not prevent it and are not the wrong mechanism being misused: the lock is held legitimately
and the write is authorised. What is wrong is the *content* of a permitted write, which is not a
question a lock can answer.

So the rule is not that recalculation becomes explicit — one member editing another's job is ordinary
collaboration. The rule is that **recalculation changes quantities and preserves build context**:
structure, ME/TE and character come from the setup being rebuilt, not from whoever triggered the
rebuild.

The same defect exists on a personal planner today: changing a default structure and then editing an
older job rebuilds its setups under the new default, losing the structure that job was built in. The
fix is therefore not shared-planner-specific, and is worth taking on its own merits.

`closeActiveJob` returns early on `!jobModifiedFlag`, so viewing and closing another member's job
writes nothing. The hazard needs a real edit.

### The persist gate is narrower than the cascade, and the server is what closes the gap

`closeActiveJob` collects the parent/child tree through `getAllRelatedJobs`, adds it to
`batchUpdates`, and writes all of it through `saveJobsViaApi`. The gate,
`canPersistJobClose(inputJob.jobID, groupID)`, tests the lock on the edited job or its group — not on
each related job the cascade rewrites.

**The gap that appears to leave is closed on the server, not the client.**
`PutJobDocumentsHandler` collects the lock state for every job in the batch and refuses the whole
request with a 409 when any one of them is held elsewhere, writing nothing. So no partial tree reaches
Mongo, and a client-side pre-check over the cascade would save a round trip rather than prevent an
incorrect write — see § Stage D, where investigating this was the reason that stage was skipped.

What the investigation found instead is that a refusal reaches nobody: `saveJobsViaApi` resolves the
same way whether the write landed or was refused, the client's own gate discards edits silently when
it fails, and the retry queue replays whatever `jobArray` currently holds rather than what was
refused. Those are tracked as
[document-write-granularity](../document-write-granularity/contents.md) § Stage B, together with the
question of whether the all-or-nothing batch refusal is the right shape at all.

The direction that project takes is the opposite of widening this gate. With a version check on each
document, a write does not need to predict what a cascade will touch — it validates each document as
it arrives, which is the only protection that survives a write set not being knowable in advance.

## Data models

Shapes, with the reasoning for what is present and what deliberately is not. Field-by-field detail
that is self-evident is left to the code.

These are the **core** models: the owner, the planner, membership, invites and grants. Access-list
binding is described in § Access lists differ from the other ESI providers but is deliberately not
modelled yet — it adds a join type, a binding on the planner and a poll schedule, none of which the
core needs to be correct.

**Most of these types already exist, unwired.** `services/shared/models/planner.go` holds `Planner`,
`PlannerMembership`, `PlannerInvite`, `JoinMethod` and its three branches, the two meta families, and
`models.SessionGrants` — landed alongside the owner work rather than with the stages that use them.
Nothing outside that file and its test refers to any of it: there is no collection, no index, no
repository and no caller. Stage C is where it gets wired in, and two things need settling when it does.

`models.SessionGrants` sits beside the live `auth.SessionGrants` with neither aware of the other, so
Stage B has to decide which package the owner-key list belongs in rather than leaving two.

The bigger one is the meta families. `AccountMeta`, `PlannerScopedMeta` and `PlannerMeta` have no
references at all, not even from the test, and `PlannerScopedMeta` as written carries only
`LastUpdatedBy` — not the seven lifecycle fields this section gives it. The document that would use it,
a job, already embeds `JobMetaData`, which carries `MetaData` plus exactly those seven. `Group` has its
own `GroupMetaData` on the same pattern, and `UserAccountDocument` a `UserMeta`.

So the split this section describes is already present in the tree under different names, arrived at
per-document rather than per-family. Stage C should either rename those to the two families and collapse
the duplicates, or drop the family types and record that per-document meta structs are the shape — but
not leave both. The three unused types are the part to remove either way; the live behaviour is
whatever `JobMetaData`, `GroupMetaData` and `UserMeta` do today.

### The owner, and what it replaces

`models.StatsOwner` becomes `models.Owner`: it stops being a statistics concept the moment it is on
every scoped document. `Key()`, `ParseOwnerKey`, `Validate` and `IsZero` carry over unchanged.

```go
type OwnerKind string

const (
	OwnerAccount     OwnerKind = "account"
	OwnerPlanner     OwnerKind = "planner"
	OwnerCorporation OwnerKind = "corporation"
	OwnerAlliance    OwnerKind = "alliance"
)

// Owner carries no JSON tags. For the two ESI kinds its ID is a ref, so a
// response that serialised it directly would leak one. Every response builds an
// owner handle explicitly instead. Untagged is not the same as unserialisable —
// it marshals under Go field names, so a missed conversion is conspicuous rather
// than impossible; the `json:"-"` on every field holding an owner is what keeps
// the ref off the wire.
type Owner struct {
	Kind OwnerKind `bson:"kind"`
	ID   string    `bson:"id"`
}
```

`_meta.accountID` is doing two jobs today — naming who owns a document and who last wrote it. On a
shared planner those separate, so it becomes two fields:

```go
// MetaData is the core every scoped document shares.
type MetaData struct {
	LastModified time.Time `bson:"lastModified" json:"lastModified"`
	Owner        Owner     `bson:"owner" json:"-"`
	ClientID     string    `bson:"clientID,omitempty" json:"clientID,omitempty"`
	SessionID    string    `bson:"sessionID,omitempty" json:"sessionID,omitempty"`
}

// AccountMeta is the `_meta` of a document owned by an account rather than held
// in a planner: the user document and application settings.
type AccountMeta struct {
	MetaData `bson:",inline" json:",inline"`
}

// PlannerScopedMeta is the `_meta` of a document held in a planner, where more
// than one account may write.
type PlannerScopedMeta struct {
	MetaData         `bson:",inline" json:",inline"`
	CreatedAt        time.Time `bson:"createdAt" json:"createdAt"`
	LastUpdatedBy    string    `bson:"lastUpdatedBy" json:"lastUpdatedBy"`
	ArchivedAt       time.Time `bson:"archivedAt,omitzero" json:"archivedAt,omitzero"`
	ArchivedBy       string    `bson:"archivedBy,omitempty" json:"archivedBy,omitempty"`
	ArchiveProcessed bool      `bson:"archiveProcessed,omitempty" json:"archiveProcessed,omitempty"`
	DeletedAt        time.Time `bson:"deletedAt,omitzero" json:"deletedAt,omitzero"`
	DeletedBy        string    `bson:"deletedBy,omitempty" json:"deletedBy,omitempty"`
}
```

**`MetaData` carries no `SchemaVersion`.** Every persisted model already has one at the document
root — `job.go`, `group.go`, `user_account_document.go`, `accountDocuments.go` — and the maintenance
batch selects on the root field. A second inside `_meta` would be two sources for one fact, and would
not drive the rotation.

**The owner does not go on the wire by the API.** `_meta.accountID` is read in exactly one place in the
SPA (`Classes/job.js`), nothing downstream reads it back, and the server overwrites whatever a client
uploads. So the field is decorative and the client change is a deletion rather than a repoint.

A change delivery is the exception, and an unintended one: the watcher copies `_meta` as a raw map,
where `json:"-"` means nothing, so an organisation planner's ref does reach a browser — recorded at
§ Stage G, G5, and not acted on there.

`PlannerScopedMeta` carries the archive and lifecycle fields because it replaces `JobMetaData`, which
already holds them.

`JobMetaData` already embeds `MetaData` and adds its own `LastUpdatedBy`, so this split follows a
shape the tree already has rather than introducing one.

Both families carry the owner — an account document's owner is `account:{id}`, which is true rather
than a placeholder. They are separate types because `LastUpdatedBy` only means something where more
than one account can write: on an account-owned document it is always the owner, so carrying it there
would be noise. This follows the existing pattern, where `UserMeta` already embeds `MetaData` and adds
its own lifecycle fields.

`Owner` has no JSON tag anywhere it is embedded, for the reason above.

`ArchivedJobStats` collapses its `AccountID` and `CorpRef` into the same `Owner`, and gains
`ArchivedBy` — the account that archived the job — so per-member contribution is answerable without
writing a second archive. Its existing `Version` field is dead — nothing reads or writes it — and is
deleted rather than renamed.

### The planner

```go
type Planner struct {
	ID            string      `bson:"_id" json:"-"`
	SchemaVersion int         `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	Name          string      `bson:"name" json:"name"`
	MemberCount   int         `bson:"memberCount" json:"memberCount"`
	AccessModels  []string    `bson:"accessModels,omitempty" json:"accessModels,omitempty"`
	CreatedBy     string      `bson:"createdBy" json:"-"`
	MetaData      PlannerMeta `bson:"_meta" json:"_meta"`
}

func (p Planner) Owner() (Owner, error) { return ParseOwnerKey(p.ID) }
func (p Planner) Shared() bool          { return p.MemberCount > 1 }
```

`_id` is the owner key, so the owner is stored once rather than beside a duplicate — the pattern the
rebuild queue already uses when it parses an owner out of `row.ID`.

An owner key is **not serialisable to a client**: for the two ESI kinds it contains a ref. So the id
fields carry `json:"-"` and the response layer emits the owner *handle* instead, converting at the
same last hop as every other ref. `Owner` itself carries no JSON tags, which makes a missed
conversion conspicuous — it emits Go field names — but not impossible; the `json:"-"` tags are the
guard, and are asserted in `models.planner_test.go`.

Neither the capability set nor the provider is stored; both derive from the kind. `AccessModels` is
the named place a permission model attaches, empty until one exists and eligible by kind.

### Membership

```go
type PlannerMembership struct {
	ID            string     `bson:"_id" json:"-"`
	SchemaVersion int        `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	PlannerID     string     `bson:"plannerID" json:"-"`
	AccountID     string     `bson:"accountID" json:"-"`
	JoinedAt      time.Time  `bson:"joinedAt" json:"joinedAt"`
	JoinMethod    JoinMethod `bson:"joinMethod" json:"joinMethod"`
}

// JoinMethod is a discriminated union: the branch that is set is the method.
// Exactly one is populated, which Validate enforces.
//
// The branches name why the account is a member, not where the answer came
// from: a member of a corporation is a member because they are in it, not
// because ESI is how we learned so.
type JoinMethod struct {
	Owner      *OwnerAccount     `bson:"owner,omitempty" json:"owner,omitempty"`
	Invite     *InviteRedemption `bson:"invite,omitempty" json:"invite,omitempty"`
	Membership *EntityMember     `bson:"entityMember,omitempty" json:"entityMember,omitempty"`
	AccessList *AccessListEntry  `bson:"accessList,omitempty" json:"accessList,omitempty"`
}

type OwnerAccount struct{}

// JoinKind is derived from the populated branch, for logging and display. It is
// never stored — the branch is the stored discriminator.
type JoinKind string

func (j JoinMethod) Kind() JoinKind
func (j JoinMethod) Validate() error

type InviteRedemption struct {
	InvitedBy string    `bson:"invitedBy" json:"-"`
	IssuedAt  time.Time `bson:"issuedAt" json:"-"`
	InviteID  string    `bson:"inviteID,omitempty" json:"-"`
}

// EntityMember and AccessListEntry are the two methods EVE keeps in step, so a
// reconcile writes and removes them as an account's affiliations change. They
// carry no timestamp: a row grants while it exists, so there is nothing to
// measure — see § Stage F.
type EntityMember struct {
	EntityRef     string `bson:"entityRef" json:"-"`
	CharacterHash string `bson:"characterHash,omitempty" json:"-"`
}

type AccessListEntry struct {
	ListID    string `bson:"listID" json:"-"`
	EntityRef string `bson:"entityRef,omitempty" json:"-"`
}
```

The composite `_id` of `{ownerKey}|{accountID}` gives one row per account per planner without a unique
index; the two lookups needed on the request path are indexed on `accountID` and `plannerID`.

`JoinMethod` records how the membership came about. The **branch that is set is the method** — there
is no separate type constant beside it, because a stored tag and a stored branch encode the same fact
and nothing keeps them agreeing. It also avoided a lossier problem: four join constants mapped onto
three payload shapes, since corporation and alliance share `EntityMember`, so the constant-to-struct
relationship was implicit.

Corporation and alliance need no discriminator of their own either: `EntityRef` is a ref, and
`entityid.ParseKind` reads `corp_…` or `alliance_…` straight off it.

The costs, taken deliberately: invalid states are representable — no branch set, or two — so
`Validate` is called on write rather than the type making it impossible; and queries select on
`$exists` rather than an equality match. The alternative that makes invalid states unrepresentable is
an interface with hand-written BSON marshalling, which is not worth it for three branches in a repo
whose models are otherwise plain structs with tags.

`InviteRedemption` copies who invited the account and when the invite was issued, rather than pointing at
the invite for them. **An invite is a credential; a membership is a record.** The credential is meant
to be disposable — an invite is a Redis key whose TTL is its expiry, and a spent or revoked one is
deleted outright — so the record keeps what it needs and lets the invite go. `InviteID` is retained
only for correlation while the invite exists and is allowed to dangle. Nothing keeps a hashed token
past its purpose, and what is stored stays the size of the outstanding invites rather than of every
invite ever issued.

`EntityMember` records which entity granted access — on an alliance planner, the corporation an account
is present through. That is what makes a reconcile removal explainable rather than mysterious. Entity
ids arrive from ESI raw and are converted to refs at ingest; nothing raw is persisted.

**A row grants for as long as it exists**, and nothing ages one out. A revoked token is a positive
answer the reconcile acts on rather than an absence it has to wait through, and an account that goes
quiet grants nothing to nobody in the meantime — there is no session to use the row. § Stage F records
why the expiry that was built here first came back out.

The row carries **no role**. A permission model brings its own vocabulary and most likely its own
storage, so a role field here would be a guess at that model's shape, and ambiguous the moment two
models are active. The row answers access and nothing else.

### Invites

```go
type Invite struct {
	ID             string     `json:"id"`
	PlannerID      string     `json:"plannerID"`
	TokenHash      []byte     `json:"tokenHash"`
	BoundAccountID string     `json:"boundAccountID,omitempty"`
	MaxUses        int        `json:"maxUses"`
	Uses           int        `json:"uses"`
	ExpiresAt      time.Time  `json:"expiresAt"`
	RevokedAt      *time.Time `json:"revokedAt,omitempty"`
	CreatedBy      string     `json:"createdBy"`
	CreatedAt      time.Time  `json:"createdAt"`
}
```

Every field serialises, because the record is itself stored as JSON — tagging one away would drop it
from storage rather than from a response. What a client sees is a separate `InviteSummary`, carrying
no hash, no creator and no planner, and saying only that an invite is bound rather than to whom. An
invite grants membership and nothing more, so it carries no role either.

Invites are **not** retained indefinitely, and what enforces that is Redis rather than Mongo.

**An invite is stored as a Redis key with a TTL, not a document in a collection.** It is a credential
with a lifetime that exists to be redeemed and then vanish, which is the shape Redis expires natively:
the key's TTL is the expiry, revoking is a `DEL`, and nothing sweeps or indexes. Redemption is a Lua
script for the same reason the document lease is one — reading the invite, checking its bounds and
incrementing `Uses` has to be one atomic step, which a Mongo find-then-update is not without a
transaction.

The record therefore carries `json` tags and no schema version: one that expires within days never
meets a migration, and § Schema versioning's rule is about documents that persist. `ExpiresAt` and
`RevokedAt` stay as fields, because a redemption still has to answer *why* an invite was refused; they
simply stop being the thing that deletes it. The namespace is `eip:planner:invite:v1:`, and the helper
that owns it sits beside the API rather than in the shared Redis package, which holds only the
namespaces that are its own.

**The durability this gives up is bounded and acceptable.** Redis persists here — `redis_data` is an
external volume and `redis:8` snapshots to it by default — so a redeploy does not invalidate
outstanding invite links. What a snapshot cannot promise is the last few seconds before an unclean
stop, so an invite issued moments before a crash may not survive it. Reissuing an invite is cheap;
losing a job document is not, which is why this reasoning does not generalise to the planner or
membership rows.

**This is why there is no TTL index work.** An earlier reading of this section had the Deployment Tool
gaining an `expireAfterSeconds` field on `IndexSpec`, a renderer that emits it and a decision about
reconciling a changed expiry. None of it is needed once invites live in Redis. Recorded because the
reconcile question turned out to be already answered either way: `renderCreateIndexJS` catches Mongo
error 85 and drops-and-recreates, which is exactly what a changed expiry on unchanged keys raises.

### Schema versioning

Every model persisted as a document carries `SchemaVersion` from the day it is designed, not from the
day its shape first changes. A new collection with no version is the worst case: its first change has
nothing to select unmigrated rows by and must guess from field presence.

Every existing document whose shape this project changes has its `*SchemaCurrent` constant bumped in `models/document_schema.go` with a matching
`vN → vN+1` step in `documentschema.Upgrader`. A new collection is added to
`SchemaMaintainedCollections()`, or the maintenance batch never visits it and the scheduler never
rotates it.

```go
const (
	UserAccountDocumentSchemaCurrent = 2
	ApplicationSettingsSchemaCurrent = 2
	JobSchemaCurrent                 = 2
	GroupSchemaCurrent               = 2

	ArchivedJobStatsSchemaCurrent  = 1
	PlannerSchemaCurrent           = 1
	PlannerMembershipSchemaCurrent = 1
)
```

`PlannerInvite` is absent because it is not a document: it is a Redis record that expires within days
and never meets a migration. See § Invites.

Three things this surfaces:

**Every document embedding `MetaData` bumps, not only the planner-scoped ones.** `accounts` and
`account_settings` embed it as well, so they carry the owner block too — their owner is
`account:{id}`, which is true rather than a placeholder. All four are stamped by the same
`prepareRelease` step, in the same window, so there is no interval in which some carry an owner and
others do not.

**`ArchivedJobStats` has no schema version today,** and its `Version` field is dead: nothing reads or
writes it, and every stored row holds the zero value. It is deleted with the owner collapse. Whether
the row wants a `SchemaVersion` is [archived-jobs-stats](../archived-jobs-stats/plan.md) § Owner block
item 1 to decide — the row is derived and rebuilt wholesale, so an upgrade of one is a rebuild.

**`MetaData` takes no version of its own, and the cutover writes no upgrader — an approved
deviation.** The rule above asks for a `vN → vN+1` step in `documentschema.Upgrader` beside every bump.
That step cannot be written here: once `AccountID` is off `MetaData`, a decoded document carries
nothing an upgrader could derive an owner from, and reading raw BSON to fake one is the second
mechanism this cutover exists to remove. So the `prepareRelease` step sets the owner and the root
`schemaVersion` together, and the version's job becomes **detection** — a document still at the old
version after the window is one the step missed, which the maintenance batch's existing selector
surfaces.

**As built, the stamp writes the owner alone, and the constants do not move.** The owner is not a
shape a document can be upgraded into: once `AccountID` is off `MetaData`, a decoded document carries
nothing an upgrader could derive one from, which is the whole reason this cutover exists. So there is
no `v1 → v2` step to write, the four `*SchemaCurrent` constants stay where they are, and the
`documentschema` methods remain the normalisers they already were. The window's gate is the detector,
as the deviation below intends — not a substitute for one that was skipped.

Two consequences of that, both load-bearing rather than incidental:

- The window's gate — **zero documents without `_meta.owner`** — is what makes the deviation safe. It
  is not a formality.
- `owner` is written by `$setOnInsert` only, because a document does not change owner as a side effect
  of a save. So a document the step misses never gains one through ordinary use; the only repair is
  re-running `prepareRelease`, which is idempotent.

`JoinMethod` and its branches are only ever inside `PlannerMembership`, so its version
gates them; versioning them separately would create two numbers that must agree with nothing keeping
them in step.

**`SessionGrants` takes no version.** It lives in Redis and its records expire, so its shape change
rolls out rather than migrating; a version there would imply a migration that cannot happen.

**The pricing defaults ride the window rather than a schema step.** The
[market-pricing-defaults](../market-pricing-defaults/plan.md) project adds `DefaultPricing` to
`ApplicationSettings` — a buying and a selling side, each naming a market and a basis — replacing the
single `defaultMarketLocation` / `defaultOrderType` an account holds today. A document stored before
it decodes to empty sides, and Go serialises them whether or not Mongo held them, so something has to
fill them before a client can tell "unset" from "chosen".

`Upgrader.ApplicationSettings` does that on every read, gated on an empty `Market` rather than on a
version. That is why the field needs no `ApplicationSettingsSchemaCurrent` movement and appears in
none of the constants above.

Because `account_settings` is already being stamped in this release's window, the backfill belongs in
`prepareRelease` beside the owner stamp instead, where it writes once for every account rather than
on every read for the life of the field. **Landed** as `seed each account's buying and selling pricing
defaults` in `core/commands/release_pricing_defaults.go`, after the owner stamp: the settings it writes
go through the owner-preserving upsert, so they need the owner already on the document.

It calls `documentschema`'s seed rather than carrying its own copy of the rules — a second
implementation could disagree with the one every read goes through, and the disagreement would be
invisible until a player's default changed under them. It selects only the accounts owing an answer, so
a side the player has chosen is never visited, and re-running finds nothing.

**Why the read-time seed cannot do this on its own.** `LoadApplicationSettings` writes back only when
the schema version moved, and this seed is gated on an empty market instead — an unversioned document
is stamped with the current version before the seed is reached, so a version test would never fire for
exactly the rows needing the fill. The read path therefore fills the field for its caller and leaves
the document as it was, every time.

Once it has run and the gate has passed, the read-time seed has nothing left to find and retires with
it.

**On dev it finds nothing, and that is the expected result.** The SPA writes the whole settings
document whenever any setting changes, and the read-time seed fills the field before the SPA sees it,
so every account that has saved a setting since the split already carries the value. The accounts the
step exists for are the dormant ones, which live has and dev does not — run the dry run first and the
number it reports is the real answer. Counts and the sample document:
[measurements/pricing-defaults-backfill.md](./measurements/pricing-defaults-backfill.md).

This stays a backfill, not a migration: no constant moves, and no `vN → vN+1` step is written for it.

### Grants

```go
type SessionGrants struct {
	OwnerKeys []string `json:"owner_keys"`
}
```

One list covering every kind, including the account's own key, so nothing downstream special-cases the
account. It is filled by one query at session bootstrap: the owner keys of every membership row for
this account.

That fill is the end state, reached in two steps. Stage B changes the shape while the list is still
filled from ESI at token refresh, which is where corporation and alliance ids enter a session today.
Stage C repoints it at membership rows once they exist. The shape does not change again between those
two, and no reader distinguishes which filled it — which is the point of converting the shape first.

## Stages

### Stage A — The owner block, in one cutover

**Landed on the environment checked.** The owner block was built under
[archived-jobs-stats](../archived-jobs-stats/plan.md), which was already shaping it for the statistics
documents. That work is finished, so this stage and everything the owner block touches are **owned
here** from now on: this plan carries the design, this project's overlay carries the behaviour, and
that plan is no longer the place to look.

What is implemented: `models.Owner` with all four kinds, `MetaData` carrying `Owner` and nothing else
scope-shaped, every query filter and index spec on `_meta.owner.kind` / `_meta.owner.id`, the
collection renames, the retired index list, `ChangeStreamMessage.OwnerKey` in place of the three route
fields, the websocket routing that parses it, and the `prepareRelease` owner stamp. The SPA already
strips `_meta.owner` on the way out.

The operator sequence below has been run: a dry run reported the owner stamp already applied with the
gate passing, so every document in that database carries an owner and nothing is left to backfill.

**The environment is confirmed.** `prepareRelease` has been run repeatedly as steps were added to it,
and the current database is post-script. Counting agrees: no document in any of the eight owner-stamped
collections is missing an owner, including 9,531 archived jobs —
[measurements/owner-stamp-coverage.md](./measurements/owner-stamp-coverage.md). Three accounts were
found without a planner document, which the same run repairs and a login repairs on its own.

What a repeated run does not cover is a step added after the last one. The script is idempotent and
grows, so each new step has only met whatever database it has been run against since it was written,
and re-running is how that is closed rather than something to plan around.

The stack comes down for the next deployment, so the owner change goes in whole rather than as an
expand/contract sequence: the model, the renames, the backfill and the reads all land inside one
window, with nothing serving and nothing writing.

That removes the machinery a gradual switch needs. `models.MetaData` drops `AccountID`,
`CorporationRef` and `AllianceRef` outright rather than carrying them beside the owner; no write emits
two shapes; and the upgrader needs no path filling an owner from an account id, because no document
leaves the window without one.

It also removes a hazard rather than sequencing around it. `BulkUpsertJobs`, `BulkUpsertGroups` and
the archived-jobs `putHandler` each write `"$set": <the whole marshalled struct>`, and `$set` on
`_meta` replaces that subdocument entire rather than patching its fields — so while `MetaData` has no
`Owner`, any save erases one already stamped there. That would dictate the order of two releases under
a gradual switch. With nothing writing it cannot happen, provided the order inside the window holds.

As built, all three set the owner on the struct immediately before the write, from the authenticated
account rather than from anything the client sent, so the whole-struct `$set` now writes the owner
rather than erasing it. That is what makes the hazard a window-ordering concern only.

The contrast is still worth knowing, because it is why some writes are harmless:
`UpsertStructPreservingMeta` and `buildPreservingMetaUpsertModel` exclude `_meta` from the `$set` and
patch it with dotted paths, which leaves unknown fields alone. Only the whole-struct writers destroy.

**Order inside the window.** The owner stamp is a `prepareRelease` step rather than a task of its
own, so an operator running the release command cannot silently skip it.

1. Stop user traffic, **and stop the worker**.
2. Back up, with the restore already exercised.
3. `eip ensure-mongo` — renames, index specs, retired indexes.
4. `eip update` — the images carrying the owner block.
5. `eip cli` → `tasks prepareRelease`, one command: outstanding schema maintenance first, then the
   owner stamp, then the rest, with the rebuild queue last. The first two stop the run if they fail,
   because every step after them reads what they write.
6. **Gate:** the last `prepareRelease` step counts documents without `_meta.owner` across all seven
   collections and fails the run if any remain, so the gate cannot be skipped by an operator reading
   past it. It is a real gate rather than a formality: the stamp leaves a document with no usable
   account id unstamped and only names it in its summary, so without this the release would report
   success over documents nothing can read. Check the counts, then worker up and traffic back.

The tasks CLI execs into the running core service, so core stays up throughout: "stack down" means
user traffic stopped, not every service stopped.

**Why the worker is down between 4 and 5, and this is destructive rather than untidy.** Once the
images filter on `_meta.owner` but before the stamp writes it, every owner-scoped read matches
nothing. `PruneTimelineMonths` and `PruneProductionTotals` add their `_id: {$nin: keepDocIDs}` clause
only when the keep list is non-empty, so an empty one leaves a filter of `owner.kind` + `owner.id`
alone — matching **every** document for that owner. A rebuild firing in that gap reads zero archived
jobs, produces no keep list, and deletes that owner's aggregates. `cron.dispatchStatisticsRebuilds`
runs every two minutes, so the exposure is minutes wide rather than theoretical.

**Rollback is a restore.** An expand/contract sequence keeps every intermediate state readable by the
previous release; this does not. There is no forward-compatible shape to fall back to, so the window
needs a database backup taken immediately before it and a restore that has been tried. That is the
rollback plan, and it is what the simpler cutover costs.

### Stage B — Grants and scopes as owner lists

`SessionGrants` becomes one list of owner keys including the account's own, so there is no special
case and one `filterToAllowed` comparison covers everything. `RealtimeScopes` follows, and
`upgrade_scopes` / `scopes_ack` are removed: a connection derives what it receives rather than asking.

Session records live in Redis and expire, so this is a rolling deploy rather than a migration — a
property worth using rather than working around. It does mean the API and websocket must tolerate both
grant shapes for the length of one session lifetime.

**The shape changes here; the source changes in Stage C.** § Grants describes the list as filled by one
query over the account's membership rows, but no membership row exists until Stage C. Today the list is
filled from ESI: the account's corporation and alliance ids arrive at token refresh and
`UpdateAccountSessionGrants` converts them to refs and writes them onto the session record and every
session under it.

So this stage converts the **shape** and leaves the **source** alone — the ESI fill keeps writing the
same values, expressed as `account:`, `corporation:` and `alliance:` owner keys. Stage C then repoints
the fill at membership rows without touching the shape again.

Taken the other way round — folding the conversion into Stage C so shape and source move together — the
tolerate-both-shapes work would land at the same moment the values themselves start coming from
somewhere new, with nothing to check the result against. Splitting them means the risky half ships
while every grant is still a value today's behaviour can be compared to, and the second half is a change
of source under a shape already proven. The cost is touching the fill path twice, which is one function.

**Surfaces.** `auth.SessionGrants` and the compare-and-set record that carries `GrantsVersion`;
`UpdateAccountSessionGrants` and its three callers (authenticate, refresh, and the worker's ESI task);
`ExtractSessionGrants`; the websocket's `grantedCorpRefs` / `grantedAllianceRefs` on the client, the
reverse indexes over them, `filterToAllowed`, `replaceScopesWithinSessionGrants` and the resume path;
`model.RealtimeScopes`; and the `upgrade_scopes` / `scopes_ack` message shapes, which no client sends.

**Go modernisation, per § Go modernisation in scope:** the session record's `time.Time` fields in
`api/helper/auth/refresh_token.go` want `omitzero` rather than `omitempty`, which this stage's edits to
that file are the moment to apply.

**`upgrade_scopes` is removed rather than reshaped.** The plan above had it take owner handles with the
rest of the stage. Reshaping it was the wrong answer: a connection should not ask for scopes at all
— see § Why the client no longer asks for scopes. The subscriptions a connection holds are derived from
its ceiling, and the only thing a client decides is which planner is active, which is a Stage E message
against a Stage E client. Until then the two id lists stand, unused by any browser.

**Done when** one owner-key list covers every kind, `filterToAllowed` compares once, grants stored by
the previous release are rewritten rather than lost, and no downstream reader names a corporation or
alliance field.

### Stage C — Planner and membership documents

The planner document, the membership collection, and the code that keeps rows current for the `self`
provider only. Every existing account is backfilled a planner whose `_id` is its owner key,
`account:{accountID}`, and one membership row. Purely additive: no existing document's owner value
changes, because the owner id inside that key is the account id those documents already carry.

Membership is a separate collection rather than an array on the planner. Both directions are on the
request path — "which planners can this account see" on every session bootstrap, "who is in this
planner" on every roster read — so both need an index, and an embedded array would make the roster a
hot-write contention point on the planner document itself.

Invites are **not** in this stage. Nothing can be invited into a planner until custom planners exist,
so `PlannerInvite`, its storage and the join path land with Stage E — and its storage is Redis rather
than a third collection here, which is why only two are created.

#### C1 — The two collections exist

`planners` and `planner_memberships` in the collection-name source of truth, with index specs, schema
version constants, and registration in `SchemaMaintainedCollections()` — a collection in the name list
but not that one is never visited by the maintenance batch.

The registration surface is wider than those three files, and every part of it is a hand-maintained
list rather than a registry: the name constant and **both** sides of its name test, the Deployment
Tool's own `knownCollections` (a separate Go module, so the list is duplicated rather than imported),
the index specs, and optionally a named `Docs` field on `Mongo`. Maintenance takes five more: a
`SchemaVersion` field on the model, a `*SchemaCurrent` constant, an `Upgrader` method, and a case in
**both** `schemamaint.Batch` and `schemamaint.CurrentVersion`. The last two are guarded by tests that
fail the build rather than at runtime, which is the safety net worth relying on here. `PlannerMembership` takes the composite
`_id` of `{ownerKey}|{accountID}`, which gives one row per account per planner without a unique index
and follows the `{ownerKey}|…` convention the statistics documents already use.

Two indexes, one per request-path direction: `accountID` for "which planners can this account see" and
`plannerID` for "who is in this planner".

`services/shared/models/planner.go` already holds `Planner`, `PlannerMembership` and `JoinMethod`,
landed early and wired to nothing. This slice is where they gain a collection. Two gaps against
§ Membership close here: `JoinKind` and `JoinMethod.Kind()` are specified and absent, and the
§ Data models note on the meta families is settled — the three unreferenced types go, because
`JobMetaData`, `GroupMetaData` and `UserMeta` are that shape already.

**Done when** a planner and a membership row can be written and read back, the maintenance batch
visits both, and `eip ensure-mongo` creates the indexes on an empty database.

#### C2 — Every account has its planner

A `prepareRelease` step, on the pattern of the owner stamp: idempotent, dry-runnable, reporting counts,
and skipping what it has already done. For each account it writes a planner with `_id` `account:{id}`
and one membership row whose join method is the `owner` branch.

It is additive in the strongest sense — no existing document is touched, only new ones written — so
unlike § Stage A it needs no window of its own and can run before traffic returns or after it.

The step **creates the planner for accounts that exist**. Signup has to create one too, or an account
registered after the release has no planner until the next run; that write belongs with the account's
own creation so the two cannot diverge.

**Done when** every account has exactly one `account`-kind planner and one `owner` membership row, a
second run reports nothing to do, and a newly created account gets both without the step.

#### C3 — Membership decides access

The grants fill repoints from ESI to membership rows: one query for the owner keys of every membership
this account holds, replacing the corporation and alliance ids `UpdateAccountSessionGrants` converts
today. The owner-key shape it writes into is already in place from Stage B, so this changes where the
list comes from and nothing downstream.

**A boundary decision this forces.** `api/helper/auth` is a Redis-only package: it holds sessions,
tokens and grants, and imports no Mongo. Reading membership rows there would give the session package a
database dependency it has never had. The alternative is for the callers — which already hold both
clients — to resolve the owner keys and pass them in, leaving `auth` a writer of what it is given.
Prefer the second unless it forces a worse shape at the three call sites: authenticate, refresh, and
the ESI worker task.

Once grants are membership-derived, `requireOwnedBySession` on the statistics route becomes a grant
lookup rather than an account comparison — the change its own comment has been waiting for. Doing it
before C3 would authorise from an ESI-derived grant and then change again, so it waits.

**Grants are a cache, and a membership change does not reach one.** A session record lives seven days
and is rewritten at login, token rotation, or the ESI task — so an account joining or leaving a planner
sees no change until one of those fires. § Losing access already requires a removal to bite on the next
request, which a cached grant list cannot do on its own. Two ways out: rewrite the grants of the one
account whose membership changed, which `RepairSessionGrants` is the precedent for, or read membership
live at the authorisation point and keep grants as the routing ceiling only. The first keeps the read
path cheap; the second cannot go stale. Decide it in this slice rather than discovering it at Stage E,
where revocation has to work.

**Done when** a session's grants come from its membership rows, an account with no membership beyond
its own planner reaches only itself, the statistics route authorises any owner the session holds, and a
membership change reaches a live session by a stated mechanism.

#### C4 — Subscriptions follow the owner

The two pieces from § What a connection subscribes to. The collection set per owner kind becomes a
server-side table, so a connection's subscriptions are a pair of owner and collection set rather than
an owner alone. And `docSubscribeAuthorized` stops asking `ExistsByAccountID` — "does this account own
this document" — and asks whether the document's owner is one the session holds a membership for.

**Most of the account-owns-this sites must not change, and telling the two apart is the work.** About
twenty places assert it, but they divide on which collection they read. The `user/` handlers read
`accounts` and `account_settings`, which are account-owned by design — § Settings split between the planner and the account
— so "this account owns it" is permanently the right question there and turning it into a membership
lookup would be a bug, not progress. The eight that change are the planner-scoped ones: the archived
jobs scope and its ESI links, the group delete, and the job-document reads and deletes.

`docSubscribeAuthorized` already encodes the same split, in the one place that has to answer for every
collection: account-owned ids are compared, planner-held ids are looked up. It is the model for the
rest rather than an outlier.

`archivedjobs` also already has the seam — an `ownerFilter` on a scope struct, which every read and
write goes through. The other three packages inline the filter instead, so the refactor is bringing
them to that shape, not inventing one.

So the slice is: give the planner-scoped packages a single owner predicate each, with semantics
unchanged, and only then change what that predicate asks. Leaving the account-owned sites alone is a
decision, not an omission — recorded so a later sweep does not "finish the job" and widen access to
documents that were never shared.

**Done when** every planner-scoped ownership assertion runs through one predicate, the account-owned
ones still compare an account id, a member can subscribe to a document in a planner they belong to and
not to one in a planner they do not, and the account's own documents stay subscribable from inside any
planner.

#### Order

C1 before everything: the rest reads or writes those collections. C2 before C3, because grants derived
from membership rows return nothing until the rows exist — shipping them in the other order would sign
every account out of its own data. C4's refactor half depends only on C1 and can land beside C3; its
semantic half wants C2 landed for the same reason C3 does.

Inside `prepareRelease`, C2's step sits after `completeSchemaMaintenance` and after the owner stamp —
it derives a planner from an owner, so the owner has to be there — and before the grants repair, which
would otherwise write grants from rows the step has not created yet. Both of the steps it follows are
`required`, so a failure stops the run rather than letting it build on nothing.

The risk is concentrated in C3: it is the slice where an account's access changes source, and the one
whose failure mode is losing access to your own planner rather than gaining access to someone else's.

### Stage D — What a second member breaks

The work that has to land **before** any planner can hold two people, because getting it wrong writes
bad figures into an archive that then needs rebuilding.

All of it is SPA work — `frontend/src/Functions/JobPlanner/` and the settings store — so it follows the
frontend rules pair rather than the backend one, React 19 idioms included.

Its test is exact and applies to every slice: **on a single-member planner, every figure must be
identical before and after.** Nothing here is allowed to change what a job costs today.

#### D1 — Recalculation keeps the job's own build context

`recalculateJobForNewTotal` is thirty-seven lines and does the damage in one: it sets
`inputJob.build.setup = {}` and rebuilds every setup from `buildSetupContextForJob`, which reads the
**current user's** highest-ME blueprint and **their** default structure for the job type, and takes
`characterToUse` from their main character. It never reads the setup it is replacing.

The seam already exists. `buildSetupFromQuantity` takes an `overrides` argument and already prefers
`overrides.systemID` and `overrides.characterToUse` over the derived values, and
`buildSetupFromPresetRow` shows the full shape a preserved setup takes — ME, TE, rig, structure,
system, character. What is missing is that recalculation passes nothing.

**Which callers preserve and which derive is the whole design.** Five call it, and they split cleanly:
`buildJob`, `buildNextMaterialsTree` and `importFitFromClipboard` build jobs that have no stored setup
to keep, so deriving from the current user's defaults is correct there and must stay. The loss bites at
`closeActiveJob`, which recalculates every job in the related tree — each with its own stored setup —
and at `recalculateJobFromSetup`. Getting this wrong in the other direction is equally bad: a genuinely
new job that preserved nothing would inherit an empty context.

More is lost than the three fields the stage names: the rig, the tax value, any custom structure, every
setup id, and the ME/TE falls back to whatever blueprint the recalculating user owns — *worse* if they
own a poorer one, and zero if they own none at all.

**Nothing covers this today.** `closeActiveJob.test.js` mocks `recalculateJobForNewTotal` out
entirely, so no test observes what it does to `build.setup`. Un-mocking it, or adding a dedicated test,
is part of the slice rather than a follow-up.

**Done when** recalculating a job with a stored setup keeps its structure, ME/TE and character while
its quantities change, a newly built job still derives them, and a single-member planner's figures are
unchanged.

#### D2 — The close gate covers what the close writes — *skipped, moved to document-write-granularity*

**Skipped.** Investigation found the stage as written describes a gap that does not exist, and a real
defect underneath it that is larger than this stage and belongs with
[document-write-granularity](../document-write-granularity/plan.md) rather than here.

The stage assumed the client gate was the only thing standing between a multi-job write and a document
another member holds. It is not. `PutJobDocumentsHandler` collects the lock state for **every** job in
the batch and rejects the whole request with a 409 when any one of them is held elsewhere, writing
nothing — so no partial tree can reach Mongo, and the client-side pre-check the stage asks for would
save a round trip rather than prevent an incorrect write. The client already parses that 409 and patches
each rejected row into its local lock state.

What the investigation did find, recorded here for the later review:

**The retry queue replays whatever is current, not what was refused.** `pendingJobDocumentWrites` holds
job **ids**, and `getPendingJobDocumentWritesPayload` resolves them against `jobArray` at flush time. On
a 409 `persistJobDocumentsToApi` returns without clearing the queue, so those ids stay pending. The
holder's own save then arrives over the websocket and is written into `jobArray`, and the next flush —
a debounce tick, a tab-lifecycle flush, any later unrelated save — rebuilds the payload from `jobArray`
and PUTs it back. `BulkUpsertJobs` is a full-document upsert with no version check, so depending on
which side of the race the flush lands, the write is either a pointless re-upload of the holder's own
document or a clobber of it by one that is part theirs and part stale local edit. The flush consults no
lock gate of its own, so it fires whenever the lease happens to have moved.

**A refused write is reported as a success.** `saveJobsViaApi` resolves the same way whether the write
landed or was refused, so `closeActiveJob` closes the editor and shows its adjustment summary either
way.

Settling this needs a product decision the stage cannot make on its own: when a member's close is
refused because another member holds a related job, their edits are real work, and discarding them,
keeping them local with a warning, or blocking the close are three different applications. That
question, the queue's replay semantics and job-write ownership are one piece of work, not three
slices, and they are that project's § Stage B.

**Neither finding blocks the rest of Stage D.** Both are invisible on a single-member planner, and
neither is reachable through D1 or D3.

#### D3 — The two shared id spaces

§ Settings split between the planner and the account explains which settings the planner owns and
which stay personal. That section has since grown: `customStructureID` on every setup is a reference
into the writing account's settings, so a planner settings document is owed rather than two moved
fields. This slice therefore covers the extras picker; the settings document itself landed at Stage E,
seeded by planner creation, so nothing blocks this slice.

Within that, two things narrow the work:

**Extras categories need scoping, not migrating.** Their ids do not collide and never did — new ones
are UUIDs, `0`–`5` are frozen defaults shared by every account, and there is no rename. So a shared
planner needs to offer its own categories rather than an account's, which is a question of which list
the picker reads. Archived rows already carry the name each category had when the job was archived, so
nothing depends on resolving an id against a settings document.

**Job statuses need no work at all — the id space is already fixed.** The stage was written against a
per-account `jobStatusArray`, which no longer exists anywhere in the SPA. Statuses are a frozen
`JOB_STATUS_CATALOG` of five ids shared by every account, and what remains per-account is a **names**
map. `job.jobStatus` indexes the catalog, so two members cannot disagree about which stage an id names.
Whether planner-scoped *labels* are worth having stays the open question § Settings stay with the
account records; nothing is owed here.

Extras are further along too: the archive already denormalises each category's label at archive time,
and a release step stamps those labels onto existing jobs. So what is left is the offered list at the
picker, not the id space or the archive.

**Landed**, and larger than "the offered list at the picker" for one reason the stage did not see:
`planner_settings` was insert-only and its API read-only, so repointing the picker alone would have
frozen a personal planner's list at the moment it was seeded, and a category added afterwards would
have vanished from the picker. Moving the *reading* of the list required moving the *editing* of it in
the same slice.

So the slice is: a field-scoped `PUT /planners/{owner}/settings` taking a `SettingsUpdate` that names
only what changed; a `SettingsUpdate.Validate` that refuses a list with duplicate or unlabelled ids or
without the two permanent categories, because costs already filed name their category by id; and on
the client one hook over the planner settings store that the picker, the job extras editor and the
Settings page frame all read, with the editing actions and the debounced write beside it.

The account document keeps `extrasCategories` for this release and stops being edited. Two of this
release's steps still read it — `backfillAccountPlanners`, which is what moves each account's list onto
its planner, and `stampExtrasCategoryLabels`, which names the categories on jobs already archived — and
`UpsertApplicationSettings` writes the whole struct, so a SPA that stopped sending the field would clear
it before either step ran. The SPA therefore round-trips it untouched and its editing actions are gone.

**It is dropped in the next release**, once those two steps have run: delete the field from
`models.ApplicationSettings` and the `ExtrasCategories` clone from `SettingsFromAccount`, which is the
only reader through the model. `stampExtrasCategoryLabels` decodes its own struct and is unaffected, and
stored copies age out on their own — no upgrader step, per § Schema versioning.

##### The move itself is a release step

Seeding is not enough on its own. `EnsurePlannerSettings` is insert-only and **first login and every
token refresh call it**, so any account that has signed in since Stage C already has a settings document
holding the categories it had at that moment — and `backfillAccountPlanners` skips it, because it fills
in what is missing rather than refreshing what is there. Every category added after that login is on the
account document alone. With the picker reading the planner's list, those categories would disappear
from it, which is the regression this stage's done-when forbids.

`backfillPlannerExtrasCategories` is the step that closes it: for each account it merges the categories
its planner's settings do not hold onto that planner. **Merged by id, never replaced** — a category the
planner already carries is left as it is, a member's rename and a member's deletion included — so the
step is safe to run again after a failed window, once members are editing the planner's own list. It
runs after `backfillAccountPlanners`, because a planner has to exist before its settings can be changed.

It is also the release's first step to *change* a `planner_settings` document rather than insert one, so
`planner_settings` joins the collections copied before the window; without that, `revertRelease` would
have nothing to put the pre-release lists back from.

**Wire compatibility:** additive. `PUT` is a new method on an existing route, and no stored shape
changed.

**Deferred to Stage G, and landed there.** A category one member added used to reach another member
only on their next read of the settings; `documentMessage.js` now routes `planner_settings` to a
handler of its own. The SPA's `PLANNER_HELD_COLLECTIONS` is still one entry short of
`PlannerHeldCollections()` — `jobs` — and the gap is now deliberate rather than an oversight: that set
names the collections the store holds for one planner at a time, which the settings are not.

#### Order

D1 was a live defect on personal planners today and landed first. D2 is skipped — what it describes is
already handled server-side, and the defect underneath it is
[document-write-granularity](../document-write-granularity/plan.md) § Stage B. D3 needed the planner
settings document to exist, so it followed Stage E. The stage is closed.

#### A planner's id and its name

Two questions the endpoints run into first, settled here so the slices that need
them do not each answer differently.

**A minted planner id is a UUID, from the standard library.** Only a custom planner needs one — the
account, corporation and alliance kinds derive theirs from the owner key — so nothing mints an id until
custom planners exist. When they do, `uuid.New()` from Go's own `uuid` package is what mints it, giving
`planner:{uuid}`. The one hard constraint is that the id must not contain `|`, which
`SplitMembershipID` uses to separate the planner from the account; a UUID does not.

That also retires `github.com/google/uuid`. The standard library covers what the six call sites in
`services/` use, so the dependency is replaced rather than joined by a second way of doing the same
thing — the § Dependencies rule, applied as we touch the area.

**A corporation or alliance planner is named server-side, from the public ESI route.** Its name cannot
come from the client: the SPA already renders corporation names for its own display, but a name the
server stores is a fact about the planner, and a fact the client supplies is one it can supply wrongly.
`GET /corporations/{corporation_id}` and its alliance counterpart are public — no token, no scope — so
the lookup needs nothing the server does not already have, and it happens once when the planner
document is first written rather than on any request path.

The stored name is *the corporation's or alliance's own name*, which is what a member expects to see in
a planner switcher. It goes stale if the entity renames itself, which is the ordinary cost of storing a
name rather than resolving it every time, and is worth it to keep the read path free of an ESI call.

Neither blocks the roster endpoints: a planner is listed from its membership row, and until a document
exists the owner handle is what identifies it.

### Stage E — Custom planners

Creation, invite tokens, the join path, the limits, and the revocation path. The shared authoriser
already landed at C3. `PlannerInvite` lands here rather than with the two collections at Stage C:
nothing can be invited into a planner until custom planners exist.

**The planner settings document lands here too**, for the same reason: creation is what seeds it, from
the creating account's settings, so a new planner behaves as its creator expects. § Settings split
between the planner and the account says which settings it holds and why the split exists. Until it
lands, a setting resolves against the account as it does today, so nothing breaks in the interval — it
is a planner holding two members that makes the account-scoped read wrong, and that is this stage.

**No Deployment Tool work is owed here.** Invites expire as Redis keys rather than as rows under a TTL
index, so `IndexSpec` needs no expiry field and the renderer needs no change — see § Invites.

**Most of this stage has landed.** The models were built and tested first: `Planner`,
`PlannerMembership`, `JoinMethod` with its branches, and the invite. Since then the settings document,
the planners listing, planner creation, the active-planner message, a client switcher, the owner on
every scoped request and query key, and the invite lifecycle with its join path have all gone in — see
[overlay.md](./overlay.md) § Stage E for how each behaves.

Membership changes in both directions reach the stored ceiling and the connections reading it:
`sessiongrants.WriteFromMemberships` rewrites an account's grants from the rows it holds now and
announces the result, and the join endpoint owes that call as much as the tasks that reconcile against
ESI.

**It also owns the collections § What a planner owns moves.** The archive and the statistics need only
listing in `PlannerHeldCollections()`, since they already carry the owner block. Group templates need
the owner block first, and their reads and writes need the two-owner authorisation that applying a
template across planners implies.

The settings document was taken first, because D3 waits on it and nothing else in this stage waits on
D3. It is written by the same function that writes a planner, so a planner cannot exist without one.

The active planner has landed, and with it the message that switches one: the client names one owner
handle, the server intersects it with the ceiling and replaces the planner subscription, leaving the
account subscription alone. Replace rather than merge, because switching planner has to stop the
previous one — see § What a connection subscribes to.

**A switch moves the whole client, not the websocket alone.** One slice holds which planner the app
works in; the header on every scoped request, the owner in every scoped query key and the planner the
connection delivers all resolve from it, so a refetch after a tab wake reads the planner the user is
looking at. The realtime layer holds no second copy, and the guard that drops another planner's
documents asks the same slice.

What has not moved is the store itself, which still holds one planner's documents. That is Stage G's
half of the same work: a switch addresses the right planner but nothing loads its documents, so the
documents already held are what is shown until a change arrives. See § Stage G — the document load is
account-shaped.

Archiving names its destination planner in the UI, because a job archived into the wrong archive is
tedious to unpick.

### Stage F — ESI providers

**F1 has landed, and it was not the last stage after all.** Corporation and alliance reconcile
membership rows from the ids ESI reports at token refresh, and grants derive from those rows, so a new
row is a new grant. That there was no other work to do is the measure of whether the abstraction held.

What the stage did not anticipate is that the task it completes was **already half-written**: it
fetched the ids, stored them in Redis, and then read grants from `OwnerKeysForAccount`, which reads
membership rows. Nothing wrote those rows. A character in a corporation had their ids stored and access
to nothing, and the comment claiming the ids "still drive ESI-sourced membership" described an
intention rather than behaviour. That is why this stage moved ahead of the rest of E: it was not a
feature at the end, it was a missing half.

**A row grants for as long as it exists**, and nothing expires one. That was arrived at by building the
opposite first and taking it back out, which is worth recording so it is not rebuilt.

The removed design gave every EVE-tracked membership a `ValidatedAt`, stopped it granting after a
staleness window, and deleted it after a longer one. Three things were wrong with it. The windows did
not line up with anything — the cloud token sweep only reaches an account after twenty-five days
dormant, so a seven-day expiry lapsed access more than a fortnight before the mechanism that would have
renewed it ran at all. It solved a problem that does not exist: a stale row on a dormant account grants
nothing to nobody, because no session is there to use it, and the moment somebody logs in the grants
task reconciles the rows before anything reads them. And it duplicated a fact — when the account last
logged in — that the user document already held.

So there is no expiry. Three mechanisms cover it, each of which already existed:

| What happens | What handles it |
|---|---|
| A character leaves a corporation | the reconcile, at login or on the cloud token sweep |
| A token is revoked | the sweep sees `invalid_grant`, and the reconcile removes what that character carried |
| An account goes quiet for two years | `InactiveAccountPlannerCleanup`, alongside its jobs and groups |

**Revocation is an answer, not a gap.** `IsPermanentRefreshFailure` distinguishes a refused grant from
an unreachable server, so a pass that loses a character to revocation still knows exactly what the
account can prove and reconciles on it. Only a transient failure blocks the reconcile, because only
then is the answer unknown — and reconciling against a set missing an entity the account is still in
would revoke access it holds.

**Owed: the grant task's shape.** It fires on every login and every token refresh, whether or not
anything has changed, and resolves the whole set each time. That is more often than the design wants
and does more work per run than it needs to, but it is correct as it stands and nothing waits on it.
Reshaping when it fires and how it resolves is deferred rather than dropped.

Access lists are the other slice, and § Access lists differ from the other ESI providers already says
why they are not the same shape as the corporation and alliance providers.

### Stage G — Realtime state under more than one writer

The realtime layer was built for a single writer and says so in three places. None of them is wrong
for a personal planner; all three become defects the moment two members share one.

**The cursor is a wall clock.** `websocketSyncSlice` holds one number per logical document,
`_meta.lastModified` in epoch milliseconds, and an apply is accepted only when it is strictly newer
than the number held. With one writer that is a sound way to drop a duplicate. With several it fails
three ways: two writes inside the same millisecond produce equal cursors and the second apply is
discarded; `lastModified` is stamped by whichever process wrote it, so across replicas it is not a
total order and a genuinely newer document can carry an older stamp; and the comparison silently
resolves conflicts last-write-wins, which is a product decision the transport is currently making by
accident rather than one anybody chose.

The replacement has to be a token that is totally ordered **per subscription** rather than per
document, so a client can say *I have everything through X* instead of comparing documents one at a
time. The change stream already carries a resume token with exactly that property; a per-owner
sequence is the alternative if the token turns out to be awkward to expose.

**The document load is account-shaped.** `loadAccountDocuments` fetches two singletons, `accounts`
and `account_settings`, both `account:{id}`. The planner half of the pair in § What a connection
subscribes to has no document load at all: planner jobs are refetched only when the session identity
changes, and `planner_settings` is in neither path. Switching planner now moves every scoped read and
its cache key, so what a refetch asks for is right; what is missing is anything that asks. Until something
loads them the store keeps the documents it already held, which is why keying it by owner belongs
with this stage rather than with Stage E. Switching and reconnecting are the same operation as far as the store is concerned, and
both need the active owner's document set to arrive from somewhere.

**An unbuilt document-load path is already standing, and this stage decides its fate** — see
§ Absorbed from the retired websocket-realtime project below.

**Resume asserts rather than checks.** `session_resume` moves the previous connection's explicit
document subscriptions across and answers `skipDocumentLoad: true` having read no document and compared
no version. Anything written during the gap is lost, because there is no replay. On a personal planner
a blind window bounded by the handoff TTL is a fair bet against the client being its own only writer.
On a shared planner the gap is exactly when another member's edit lands, and a slot drain reconnects
every member at once, so the whole roster resumes blind together.

`skipDocumentLoad` should become an answer the server derives from the client's position rather than an
assumption it makes from the TTL — the server knows whether the connection missed anything, so it
should say so, and send what was missed. That is the same push-rather-than-infer shape the rest of the
realtime surface already follows.

**What a genuine concurrent edit does is a separate decision, and this stage only has to stop losing
writes silently.** Whether two members editing one job resolve last-write-wins with a visible signal,
merge per field, or are prevented from overlapping by the document lock is a question § The persist
gate must cover the whole cascade already touches. The transport's obligation is narrower: never
discard an apply because two stamps compared equal, and never claim a client is current when it is not.

**Ordering.** This stage is not a prerequisite for a planner holding two people — Stage D is. It is a
prerequisite for that planner being *trusted*. The owner-keyed query keys landed at Stage E; the
document load they refetch through is this stage, and keying the store by owner comes with it.

#### Ordering is a construction, not a token

There is no sequence anywhere today. What preserves per-owner order is the shape of the path:
`Consume` runs the doc.update handler at concurrency 1, `outboundDocPartitionKey` returns the owner
key, and the FNV hash sends one owner's messages to one shard FIFO drained by one worker. Same owner,
same queue, one reader — order holds by construction.

Because nothing names a position, a client cannot say where it is and the server cannot say what it
missed. That is the same gap the resume finding above describes, reached from the delivery side.

Three things break the construction, and the first is not a corner case:

**A full shard queue reorders.** `enqueueOutboundDocUpdate` delivers synchronously on the intake path
when the FIFO is full, which overtakes everything already queued for that owner. The behaviour was
recorded as preserving ordering at the cost of back-pressure; it does the opposite, and it does it
exactly when an owner is busiest. Either the enqueue blocks — real back-pressure, which is what the
note claimed — or the bypass stays and the sequence makes the gap visible so a client can ask for it.

**One replica is ordered, not the system.** The FIFO is in-process and the hash is per-process, so two
websocket replicas fanning out for one owner share no order. This is why the fix cannot be a
per-worker counter.

**Redelivery reorders.** Explicit acks with a 30s `AckWait` mean a late ack is redelivered after later
messages for that owner have gone.

The cheapest token that survives all three is JetStream's own **stream sequence**, already monotonic
across replicas and already read in `shared/nats/ack.go` for logging. It is per-stream rather than
per-owner, so a client's position is coarser than it could be — sufficient for *did I miss anything*,
which is what resume needs. A per-owner counter in Redis is the finer alternative and costs a round
trip per delivered message; it is worth taking only if a client holding one number per owner turns out
to matter.

#### What ordering is worth depends on the write shape

`BulkUpsertJobs` writes `"$set": job` — the whole document, every field, on every write. That predates
this project and is how every job has always been persisted, single-user accounts included.

It has two consequences here. A reorder loses **everything** in the overtaken message rather than one
field, because each message carries the entire document. And two members editing *different* fields of
one job still overwrite each other, since both send the whole thing — so last-write-wins is decided by
the write shape, not by delivery, and no amount of ordering corrects it.

The change stream already asks for `updateDescription` and parses `updatedFields` and `removedFields`,
using them only to suppress schema-maintenance noise. The delta is captured and discarded — and while
writes are whole-document it would be worthless anyway, since `$set: job` marks every field as updated.

Field-scoped writes are therefore **not** owed here. They are a change to how the whole application
writes, with no shared-planner premise, and they are tracked as
[document-write-granularity](../document-write-granularity/contents.md). This stage's obligation stops
at making loss visible; that project decides whether two members editing one job can both keep their
edit.

#### Slices

**G1 — a planner has its documents loaded, and the store is keyed by owner.** The one slice that delivers on its
own: switching planner already moves every scoped read and its cache key, and nothing fetches the
planner's documents, so the store shows what it already held until a change happens to arrive. Stage E
owes this and cannot close without it.

*The loading part has landed.* It needed no new transport: `GET /api/v1/job-documents/planner` and
`GET /api/v1/groups` already carry the owner header and already serve the login bootstrap, so what was
missing was a caller on the switch. `loadPlannerDocuments` is that caller, and the reconnect and
background-tab wake paths now reload the planner through it rather than reloading jobs alone, which is
a gap those two had before shared planners: neither ever refetched groups after a gap. Only the newest
load reaches the store — an answer still in flight when another load starts is discarded, because
switching away and back arrives at the same planner and the owner alone cannot tell the two apart.
The store now records which planner its arrays hold, which is what the switch needed: a load for another
planner replaces rather than merges, and a queued job or group write is flushed before the planner moves
so it cannot be written into the planner being switched to.

*Keyed by owner is settled at one planner.* Holding several planners' arrays at once would buy an
instant switch back and nothing else: the inbound guard already drops any document whose owner is not
the planner the app is in, so a flat store paired with a load and a recorded owner is already correct.
Against that, `jobArray` and `groupArray` are read in some 270 places. The store keeps the active
planner and nothing more.

It carried the decision about the standing `sync` package, *which is now taken: the package is gone.* That package is an account-shaped answer to
the question this slice asks per owner — a queue, a coordinator, a processor and four frames, wired
into `server.go`, `types.go`, `ws_sync.go` and the reader's `case "sync"`, reached by no client that has
ever existed in this repository. Either the owner-scoped document load is built on it or it is removed as
part of this slice. `skipWhileSyncing` rides on the same decision: it holds a document back from a
client rebuilding its state and never fires, so this slice either gives it a reason or retires it.

**G2 — an apply is not dropped because two clocks were compared.** *Landed.* The cursor was `_meta.lastModified`
in epoch milliseconds, held per document and compared with `remoteMs < prevCursor`.

The comparison itself is not the equality trap this plan first recorded: equal stamps are applied, and
the `<` is deliberate. What is wrong is what gets written into the cursor. An upsert stores the server's
stamp, while a delete stores `Date.now()` — `WebSocket/handlers/userJobGroupsDocument.js`,
`applicationSettingsDocument.js` and the job-document coalescer all do this — so one comparison decides
between a server clock and a browser clock. Restoring an archived job re-upserts the same `jobID`
(`archivedjobs/restore.go`), so an account whose browser clock runs ahead of the server by more than the
gap between archiving and restoring watches the restore arrive and be discarded, and the job does not
come back until the page is reloaded.

The rest stands: a stamp written by another process is not ordered against this one, which is what a
second writer adds, and last-write-wins falls out of the comparison rather than being chosen. The
replacement is a position that is totally ordered per subscription rather than per document, and one
that a delete carries as readily as an upsert, because it belongs to the delivery rather than to a
document's own history.

**G3 — resume answers from the client's position rather than from the TTL.** *Landed.* `session_resume`
used to move the previous connection's subscriptions across and answer `skipDocumentLoad: true` having
read no document and compared no version, so anything written during the gap was lost. It now compares
the client's position with what was published for the tenants it reads, and says whether anything was
missed. A slot drain reconnects every member at once, so on a shared planner the whole roster used to
resume blind together.

*A gap is reloaded through rather than replayed.* Sending the missed messages would be finer, but
JetStream holds `doc.update` for an hour: a gap can outlive the history, so the reload has to exist
whatever else does. That makes replay an optimisation on a path already built — `loadPlannerDocuments`
is that path — and it is not taken until a reload is measured to be too heavy.

**G4 — the delivery construction stops lying about order.** *Landed.* `enqueueOutboundDocUpdate`
delivered synchronously on the intake path whenever a shard FIFO was full, overtaking everything already
queued for that owner — recorded as preserving ordering at the cost of back-pressure, when it did the
opposite and did it exactly when an owner was busiest. It waits for room instead, and what that costs in
held messages and drain accounting is in [overlay.md](./overlay.md) § Stage G.

**G5 — a settings change reaches the members it is for.** *Landed.* `planner_settings` was watched,
routed and delivered, and then dropped on arrival: `documentMessage.js` handled jobs, groups and the
deprecated watchlist and let everything else fall out of the bottom. A category one member added
reached another only on their next read. It now has a handler, which writes the delivered document into
the settings store under the owner the delivery names.

Two things about that keying are worth recording, because they are not what the other collections do.
The store holds settings per owner and can hold every planner's at once, so the active-planner guard
the job and group stores need is deliberately not applied — a member is told about a planner they are
not currently working in, and the store has somewhere to put it. And the owner is taken from the
delivery's `owner` handle rather than from its `docID`: a settings document is stored under the owner
*key*, which spells a corporation as the ref a client never sees, so for the two org kinds the two
strings are not the same.

That second point is also an observation this stage did not act on. Because the `_id` is the owner key
and `BareDocumentID` only strips what sits before a `|`, the ref reaches the browser as the delivery's
`docID` and again as `document._id` — `restoreEntityIDs` rewrites keys ending `_ref`/`Ref` and neither
of those does. `document._meta.owner.id` is a third: `MetaData.Owner` is hidden from the API by
`json:"-"`, but the watcher copies the stored `_meta` as a raw map, where that tag means nothing. So
this is not particular to settings — every delivered document from an org-owned planner carries it. It is opaque ciphertext and nothing reads it, so it is a hygiene question rather than a
live defect, but `routingOnlyFields` says a browser "should not learn" refs and
`TestOwnerHandleKeepsRefsOffTheWire` exists to hold that line. The planner document has the same shape.
Deciding what a delivery should carry as the id of an owner-keyed document belongs with the wire
questions, not with this slice.

**Order.** G1 first: it stands alone, it is what Stage E is waiting on, and its decision about the
`sync` package shapes what G3 resumes into. G2 before G3, which needs its position. G4 is independent
and can land whenever — it is a correctness fix to something that is already wrong for a single writer
under load. G5 is independent of all of them: it touches one collection nothing else in this stage
reads.

#### Absorbed from the retired websocket-realtime project

Two behaviours outlived that folder and are held here until this project promotes. A third survival
is not a behaviour but unfinished work, and is recorded after them.

**Outbound delivery partitions on the owner key.** `outboundDocPartitionKey` returns the message's
owner key, falling back to `explicit:{collectionScopedDocID}` when the route carries no owner and
`err:{id}` when the payload will not decode. The key is hashed FNV-1a across a fixed set of shard
FIFOs, which is what preserves per-owner ordering while letting unrelated owners proceed in parallel.
When a shard queue is full the message is delivered **synchronously on the intake path** and acked
immediately rather than dropped — ordering for that owner is preserved at the cost of back-pressure
onto intake. Live SoT names the shard workers in the drain sequence but never states the key or the
full-queue behaviour; both belong in `backend/websocket/websocket.md` on promote.

**Document-subscribe authorisation is fail-closed and reads nothing.** An unknown collection is
denied. An account-owned collection is authorised by id equality. A planner-held collection is
authorised when the connection's scopes hold an owner whose kind delivers that collection — the scopes
were derived from the grant ceiling at connect and narrowed by the active planner, so they already
answer who the account may read for, and a bare id from a client is resolved within them rather than
looked up. This is C4's rewrite of a rule the retired folder documented against `ExistsByAccountID`;
the rule survived, the mechanism did not.

**The document load path was never finished, and this stage decides whether to finish or remove it.**
The websocket service carries a `sync` package — a queue, a coordinator, a processor, a timeout, and
the `sync_started` / `sync_data` / `sync_complete` / `sync_error` frames — reached from the reader's
`case "sync":`. No client sends that message: the SPA sends `session_resume`, `subscribe`,
`unsubscribe`, `active_planner`, the document-lock frames and `ping`, and it has never referenced the
sync frames anywhere in this repository's history. So nothing is enqueued, the queue never has work,
and the frames are never produced, while the coordinator scans for the life of the process.

It is an account-shaped answer to the question this stage asks per owner, which is why it was left
standing rather than deleted: removing it would throw away the precedent before its replacement is
designed. Decide here whether the owner-scoped document load builds on it or replaces it, and remove it as
part of that rather than as a tidy-up.

The delivery table's `skipWhileSyncing` policy rides on the same decision: it holds a document back
from a client rebuilding its state and never fires today, so what this stage builds either gives that
gate a reason to exist or retires it.

### Stage H — The document lock stops being account-shaped

The lock is per-document already: `LockKey` composes `doc_lock:{accountID}␞{collection}␞{docID}` and
every Lua script in `documentlock/atomic.go` keys on exactly that. What is account-shaped is the first
segment, and it is the segment that decides whether the lock exists at all between two members.

**Two members of one planner take two different keys for the same job, and both are granted.** Ann's
key is namespaced by her account, Bo's by his; nothing compares them. The lock does not contend and
fail — it silently stops being a lock, while every surface that reads it goes on reporting an
uncontested hold. The waitlist, the pulse, the viewer presence set and the whole group cascade take
`accountID` on the same footing, so all of them partition the same way.

**The replacement is the planner**, with the owner read from the document rather than from the
caller's JWT.

**This stage first claimed the keys were unchanged for a personal planner because an account's owner
key *is* `account:{id}`. That was wrong**, and it is worth keeping visible because it is the kind of
error that ships quietly. The NATS *tenant string* has always been an owner key, which is where the
reasoning came from; the Redis lock key never was. It held the bare account id, so rendering the owner
key would have moved every live lock, waitlist entry and viewer row onto a key the readers then miss —
and `SoloHolderLockTTL` is 24 hours, so an editor's protection would have lapsed silently for that long
after the deploy, with another session free to take the document.

So a key's first segment is the planner, rendered by `lockScope`: **an account planner as the bare id
it has always used, every other kind as its full owner key.** The two are told apart on the colon,
which an account id does not contain and an owner key always does; `parseLockScope` reads a segment
with no kind back as an account, which is every key written before a planner could own one. A personal
planner is then byte-for-byte unchanged, which is what the done-when asks for, and the kinds that never
had a key carry theirs in full.

**The `doc.lock` subject is a different matter and does change**, from `doc.lock.{accountID}` to
`doc.lock.{ownerKey}`. Nothing is persisted under it: a subject names messages in flight, the consumer
filters move with the publisher, and the cost is bounded by the deploy window rather than by a
24-hour lease.

Two details the slice has to get right rather than assume:

**The expiry subscriber parses the key.** `ParseExpiredLockKey` requires exactly three parts and hands
the account on to the promotion path, which is why the comment on `LockKey` calls the key
account-scoped — the account is carried *on* the key so a keyspace notification does not need a lookup.
An owner key contains `:` and the parse splits on the record separator, so the shape survives, but the
subscriber's downstream use of that segment as an account id does not: it becomes an owner key, and
what it feeds must take one.

**Publication is on `doc.lock.{accountID}`.** The fan-out subject and
`DocLockFiltersForHostedTenants` derive from the account today, with a comment already recording that
corporation and alliance selectivity waits on this cutover. Lock events for a planner-held document
have to reach the planner's members rather than one account's tabs, which is the same routing question
§ What a connection subscribes to answered for document updates — and the same answer.

**The document segment stays the bare id.** § Every owner-scoped document id carries its owner makes a
stored `_id` into `{ownerKey}|{id}`, and the lock's third segment must not follow it: the owner is
already the first segment, so a stored id there would carry it twice. `ParseExpiredLockKey` splits on
the record separator and would accept such a key without complaint, handing the promotion path an id
it would then have to strip. Segment one is the owner, segment three is the id a client sends — which
is what every lock caller passes today and what the SPA keys its lock state on.

**Holder identity does not change.** A lock is held by a *session*, not an account: two tabs on one
account already contend, and `/force-release` exists to break exactly that. So the multi-writer
mechanics — waitlist, handoff probe, viewer presence, contested versus solo lease — are already
multi-writer and carry over untouched. What changes is which sessions can see each other, not how they
arbitrate once they can.

**Same-account force-release is the one piece that does not survive as it stands.** It lets a caller
evict another session *of the same account* without consent, on the reasoning that a person may take
their own work back from their own stale tab. Between two members of a planner that reasoning does not
hold, and the script's account equality check is what currently prevents it — so the behaviour is
correct today and stays correct only because the key is account-shaped. Once the namespace is the
owner, the check has to become "same account" explicitly rather than implicitly, or the feature
becomes one member evicting another.

**Done when** two members of one planner contend for a single lock on one job, a personal planner's
keys and behaviour are byte-for-byte unchanged, lock events reach a planner's members, and no caller
can force-release a session belonging to another account.

#### The scope and the holder's account stop being the same value

This is what makes the stage more than a rename. Six Lua scripts take the account as `ARGV` and write
it onto the record, and the force-release script compares `existing.accountID` against the caller's.
Today one parameter serves both jobs, because the value namespacing the key *is* the holder's account.
Once the key is namespaced by the owner they separate: the key needs the planner, the record needs the
account, and both have to be threaded.

Everywhere a caller knows who it is, that is bookkeeping. `PromoteWaitlistHead` is the exception:
`EnqueueWaitlistUnique` appends a bare session id, so when a lock expires and the queue's head is
promoted, nothing says which account that session belongs to. On a personal planner every waiter was
the same account and the question never arose; on a shared planner the promoted session can be another
member, and a record carrying the wrong account makes force-release either refuse a legitimate
self-eviction or permit a cross-member one.

**A waitlist entry carries the account.** One value, so the two cannot drift — a sidecar map keyed by
session would be a second thing to keep in step and a leak whenever a removal missed it. The entries
are transient and carry a TTL, so an entry written in the old shape ages out rather than needing a
migration, and one that cannot be parsed is skipped rather than promoted.

The cost is that every Lua site touching the waitlist changes with the format: `LREM` removes by exact
value, so a caller removing an entry needs the whole entry rather than a session id — including
`existing.probeTargetSessionID`, which the record stores bare today.

#### Slices

**H1 — a waitlist entry carries its account.** The format, the six scripts, and the stored probe
target. Lands on its own with no behaviour change: the key is still account-shaped, so every waiter is
still the same account and the value the entries now carry is the one they would have been given
anyway.

**H2 — the key namespace becomes the owner.** `LockKey`, `waitlistKey`, `WaitlistPulseKey` and
`ViewerPresenceKey` take a `models.Owner`; the account is threaded separately to the scripts that write
it onto the record. The owner comes from the request's planner through `helper.RequestPlannerOwner`,
which refuses one the account holds no membership for, rather than from the caller's JWT. A typed owner
rather than a rendered key string, because a caller passing an account id would otherwise compile, work
on every personal planner, and silently fail to lock on a shared one.

**H4 — a lock frame names the planner it is for.** *Landed.* At connect a connection's `Scopes` are the session's
whole grants — every planner the account may reach — which cannot be read back for the one it is working
in, because the account's own key is in all of them. The connection used to hold an `ActivePlanner` for
that, set when the client sent `active_planner`.

The three lock paths that run over the socket — waitlist pulse, viewer presence, the lock-state batch —
read it, and that was the wrong source. `active_planner` is a separate message, so a lock frame
arriving before it, or ahead of it after a reconnect, was scoped to whatever the record happened to
hold: the account's own planner, silently, on a planner shared with somebody else. Nothing enforced the
ordering the client happened to keep.

Each frame carries an `owner` handle instead, resolved and refused against the ceiling the session was
granted at connect. That is what the HTTP paths for these same operations have always done — they take
the planner from the request and refuse one the account holds no membership row for — so the two
surfaces now agree, and a frame naming nothing is refused rather than guessed at. The check reads the
in-memory ceiling rather than Mongo, because a pulse is frequent and the HTTP path's membership read
would put a database round trip behind every one. The account's own planner is admitted whether or not
it appears there, as it is for the scopes a switch builds: an account does not need a membership row to
work alone. `ActivePlanner` is gone with the last reader of it; the switch narrows `Scopes`, which is
what it was for.

**Proven end to end, not only per unit.** The unit tests show two members meeting on one Redis key;
`TestDocLockReachesEveryMemberOfAPlanner` shows the other half, which no unit can see — two accounts,
both members of one corporation planner, both connected over the websocket fixtures, both receiving a
`doc.lock` fan-out. Its pair shows a non-member receiving nothing while a member receives the same
event, so the silence means exclusion rather than a publish that never happened. Both apply the
consumer's filter reconcile rather than waiting on its debounce, which would otherwise be a flake.

**H3 — lock events reach the planner.** `doc.lock.{ownerKey}`, and `DocLockFiltersForHostedTenants`
takes the shape `DocUpdateFiltersForHostedTenants` already has. It maps only account-kind tenants
today, with a comment recording that corporation and alliance selectivity waits on this cutover — this
is that cutover. Breaking on a cross-process surface: the API publishes and the websocket consumes, and
the JetStream consumer filters change with it.

**The same-account check is already explicit**, contrary to what this stage first assumed: the
force-release script compares `existing.accountID` and refuses. What changes is that it stops being
belt-and-braces behind an account-shaped key and becomes the only thing standing between two members.
It needs a test at H2, not a change.

**Ordering.** This stage is what makes the lock *exist* on a shared planner. It does not make it
pleasant: the lock's breadth — a group lease standing in for every job in it, and a batch write refused
whole — is a separate question with no planner premise, and it is tracked as
[document-write-granularity](../document-write-granularity/contents.md) § Stage D. That project decides
whether the lock relaxes; this stage decides whether it works at all, and the two must not be confused.
A relaxation landed before this stage would be relaxing something that is not holding.

### Stage I — Where the grants ceiling is read from

**Not a planner feature — a decision about where one already-built check gets its answer.** Raised from
[auth-hardening](../auth-hardening/plan.md) § Stage E and parked here because it cannot be taken until
the membership model has settled.

**What is built.** `models.SessionGrants` sits on the account's session record in Redis, filled by
`OwnerKeysForAccount` at login and at every bootstrap, and read exactly once — at websocket connect,
into `Client.Scopes` and `Client.Ceiling`. Its only non-test reader is the ceiling test in
`handleActivePlanner`: the owner a client names when it switches planner must be in that list or the
switch is refused, and the switch is what enrols the connection in an owner's fan-out pool. Every REST
route authorises from the membership rows in Mongo directly and consults the grants list for nothing.

So the stored list is a cache of one Mongo query, kept because a planner switch is meant to be a cheap
message rather than a database round trip.

**What is unsettled about it.** Both handlers that fill the list treat a failure as a warning, so a
session can be issued whose ceiling is empty or stale. The account then finds that its shared planners
do not stream for the life of that session while every REST surface still works. That is the item
auth-hardening carries as #53, and it cannot be closed there: "make the fill fatal", "fall back to
Mongo at the reader" and "stop storing the list at all" are three answers to a question this project
owns.

**What has to be known before it can be decided**

- **§ Losing access is the case that argues for keeping the cache.** A kick has to bite on a member who
  is already connected, and the mechanism designed for it mutates the stored ceiling and pushes a
  revocation over the fan-out. Resolving membership per switch instead would leave a removed member
  streaming a planner they had already switched into until they switch again or reconnect — so the
  stored list is not only a cache, it is where a revocation is applied. That path is Stage E's one
  outstanding item and is not built yet, which is what keeps this decision cheap to take now.
- **Stage F still owes "when the grant task fires and how it resolves".** The worker's ESI task writes
  the same list from a third place. Dropping the stored list removes that write; keeping it has to say
  which of the three writers wins when they disagree.
- **Stage G's owner-scoped document load** decides what a reconnecting or switching client is told it
  missed, which is the other half of what a switch costs.

**What this stage has to answer**

- Whether the ceiling stays a stored snapshot, becomes a membership read at the moment of the switch,
  or stays stored with a read-through when the row is missing.
- If it stays stored: which writer is authoritative, and whether a failed fill refuses the session or
  is tolerated — the answer auth-hardening #53 is waiting for.
- If it stops being stored: how a revocation reaches a connection that has already switched, given
  that the fan-out revoke in § Losing access is the answer only while a stored list exists.
- Whether one Mongo read per planner switch is acceptable at all, measured rather than assumed.

**Done when** the ceiling has one stated source, a removed member loses a live planner by a mechanism
that follows from that source, and auth-hardening #53 closes against the answer.

### Stage J — The SPA stops assuming it is the only writer

The client work in this project was scoped to prove the backend: a dropdown that switches planner, the
scoped reads and keys behind it, and the document load that follows a switch. That was the whole intent
and it worked. Converting the planner itself into something two people can work in was never planned,
never costed, and is not what the dropdown did.

An audit of `frontend/src` found what that leaves. The findings are not a list of bugs against a design;
they are the absence of a design, and they fall into four groups.

#### A page reads the store once and keeps its own copy

`useEditJobInitialState` seeds the editor from `findJobInJobArray(jobID)` behind
`if (jobID === currentActiveJobID) return;` and never reads again, so a change another member makes is
in the store and not on the screen. Closing the job writes `backupJobRef.current` — a copy taken when it
opened — back over whatever arrived since. The group page has the same shape deliberately:
`groupFrame.jsx` keys its load effect on `[groupID]` with a comment saying it must not re-run when
`groupArray` updates, so a job another member adds to the open group is never fetched and never costed.
The shopping list and the price entry dialogue each build their rows once per open, so a reader buys
what is already bought and prices quantities already filled. Archive queries never refetch on their own.
Planner settings are held with a five-minute stale time and no stream at all, and a local edit
deliberately suppresses re-reads while it is pending.

Nothing tells an open editor that its job was deleted, either: there is a `clearActiveGroupIfMatches`
and an `eip-group-deleted-remotely` event for groups, and no equivalent for jobs. The editor stays open
on a document that no longer exists, and saving resurrects it.

#### A write assumes nothing moved underneath it

Every write is a whole document with no precondition, and most of them are built from a snapshot taken
earlier. `closeActiveJob` rewrites every related job in the tree from this client's copies.
`deleteMultipleJobs` reads the arrays, then awaits three round trips before committing what it read.
`mergeJobs` and `closeGroup` recompute group membership from the local job array, and membership is
lazily loaded — a member this client never fetched is dropped from the document. The price entry
dialogue writes job documents and takes no lock at all; a member holding the edit lock has their work
overwritten by a dialogue that never asked.

The one that scales worst is `releaseJobsAfterGroupRemoved`, called from the inbound websocket delete
handler: when one member deletes a group, every other connected member's tab writes all of that group's
job documents back from its own copies. N members means N racing wholesale writes, last one wins, and
none of them is the authority.

#### The scope of what a reader sees is still their account

Six of the seven planner settings are fetched, merged, and read by nothing — only extras categories
has a consumer. Structures, system indexes, broker fee, ME default, exempt types and reprocessing all
still resolve from the reader's own account, and `defaultPricing` and `jobStatuses` have no planner copy
at all. Two members open one planner and see different costs, different profit and different columns.
Stage expansion is keyed by account id in `localStorage`. Linked ESI id sets are the account's, so a job
another member linked reads as unlinked and is offered for linking again.

Identity resolves the same way. A job another member built shows "No Matching Character Found" on its
setup card and "Unknown Character" on its linked runs; the skills query fires against a hash this reader
does not have and fails four times; and `calculateTimeForSetup` falls back to an empty skills object, so
the build time is recalculated as though the builder had no skills — a wrong number rather than an
error. `AssignUsersSelect` falls back to the reader's own main character when the stored hash is not
theirs, so the control shows the wrong person as selected and any interaction writes the reader's
character into a shared job. `_meta.lastUpdatedBy` is written on every document and displayed nowhere.

#### The other actor is assumed to be another tab of your own

The lock state carries no holder identity: the server sends `holderSessionID`, the client compares it
with its own and discards it, so *another tab of mine* and *another member* collapse into one boolean.
Every blocked affordance says "another session", every snackbar says "another tab", and the passive
viewer signal is a count with a comment recording that identity was deliberately left out.

The sharpest edge is the force-release control. It is rendered for every read-only viewer, captioned "if
another tab on your account crashed", and confirms with "Remove the edit lock from the other tab on this
account?" — so a member blocked by a colleague is told their own tab is responsible and offered a button
to evict them. Clicking it does something worse than nothing: the release script treats a lock held by another
account exactly as it treats no lock at all, which the API answers 404, which the client reports as
"No active lock to remove." The member is blocked by a lock the app has just told them does not
exist.

#### What was decided, and what that leaves

The audit was an inventory and the questions it raised were product ones. They are answered.

**No member is named on screen.** Not a lock holder, not an author, not a viewer. `_meta.lastUpdatedBy`
stays written and unread, and the copy stays impersonal.

That is not the same as the client being unable to tell *another tab of mine* from *another member*,
and the two must not collapse again — the force-release control is the proof. It is offered to every
read-only viewer, captioned for a crashed tab of your own, and a lock held by another account is
answered 404 and reported as "No active lock to remove." Whether the holder shares your account is a
fact about the viewer rather than an identity, and it is what decides whether a control is offered at
all. The server already sends `holderSessionID` and the client already knows its own; a boolean derived
from the holder's *account* is what is missing, and it names nobody.

**A remote change is applied where it is only being read, and surfaced where it is being edited.** The
same instinct as a child job that does not resize under its parent: nothing is overwritten beneath
someone working in it, and a screen they are only looking at has no edit to lose. The lock already says
which of the two a reader is in.

**A shared planner has no roles yet, and will get them as designed.** Permissions remain separate,
pluggable work with three hooks reserved — see § Permissions are separate work, and must be pluggable.
Until then every member may do everything, which is now a stated position rather than an oversight.

**Stale-snapshot writing goes to
[document-write-granularity](../document-write-granularity/contents.md).** Whole-document writes with no
precondition are the shape of the SPA's persistence everywhere, and the conditional write on
`_meta.revision` — seeded and ready, read by nothing — is that project's to turn on.

**What stays here** is what is wrong whatever that project does, and two of the four are now done.

*Landed.* The group delete no longer makes every other connected member write: the member removing the
group persists the release, and every other applies it to its own copies and writes nothing. And a job
deleted while somebody has it open no longer comes back — the arrays announce what left them, the editor
tells the reader without taking the page away, and the close refuses to write a job the store no longer
holds.

*Also landed.* The force-release control no longer offers a blocked member a button that cannot work.
The release script answered a lock held by another account exactly as it answered no lock, which became
a 404 and a success-toned "No active lock to remove." It now says the two apart, the api answers 409,
and the client tells the reader to ask for access instead. Whether the holder is one of the reader's own
sessions is a boolean the lock state carries — computed per reader from the account on the record, so
the control is offered only when it can work and the caption stops telling a blocked member that a tab
of their own crashed. Nobody is named: the flag answers *may I take this back*, not *who has it*.

*Landed, and wider than the audit found it.* A setup's figures are now quoted against whoever is
reading. `calculateTimeForSetup` had been costing another member's job as though the builder had no
skills, because it read the skills of the character the setup names and this account holds none for
them. The answer was not to pick a different character to read: it was that a figure whose value
depends on who is looking has no single correct value to store. Both stored estimates are gone — the
job time and the install cost — along with the `Setup` methods that wrote them, the eight passes that
stamped the install cost onto setups after fetching system indexes, and the two fields from the stored
document and the Go model. Each figure is now worked out where it is shown, and one function,
`quotedCharacterHash`, decides whose character a setup is quoted against: its own, when the reader
holds that character, and the reader's main when it names somebody else. The Skills panel had the same
defect in its own read and goes through the same function.

Deriving the figures exposed what storing them had hidden. The install cost is worked out from the
system's cost index and the materials' adjusted prices, and the chain walk reaches every job beneath
the one being costed — but the Edit Job page fetched only the jobs one step away, and the group page
only the group's own members. A job further along contributed nothing rather than an approximation,
where before it had contributed whatever was stamped into its document the last time anything touched
it. Both screens now open on the whole chain. The stamped figure was not right either — it was
whatever the prices and indexes were when it was written, and it never refreshed — so the change
traded a stale number for a live one, and closing the fetch gap is what stops it trading it for a
missing one.

## Live data, and the cutover window

`Public` is deployed with real data, and the next deployment takes the stack down. Every data change
this project needs — the owner block, the collection renames, the statistics reshape — rides in that
window rather than being sequenced around live traffic.

What makes that safe here, and would not for a rolling deploy, is that nothing reads or writes while
it runs. A partly-finished backfill in front of live readers is the thing an expand/contract sequence
exists to prevent; with traffic stopped the failure mode is instead that the window overruns, which is
answered by rehearsing on a copy rather than by keeping two shapes readable.

**Every collection the release writes to is copied before anything writes, and a command puts the
copies back.** `prepareRelease` opens with the copy — one `$out` per collection, server-side, count
verified, recorded in `release_backups` — and `rewriteOwnerScopedIDs` takes the same copy of its own
collections before it queues a task, because it runs outside the window. The list is built from the
collection lists the steps iterate, so a step that starts writing somewhere new is backed up by the
same edit. A copy already recorded is never replaced, so a re-run after the steps have written cannot
overwrite the pre-release state with a half-migrated one. `eip cli -- revertRelease` restores every
recorded collection — `$out` from the copy into the live name, which is atomic and keeps the indexes —
empties one that was empty when copied, and refuses to run if nothing was recorded. The copies are kept
until `eip cli -- dropReleaseBackups`.

**Rehearsal is the substitute for reversibility, and it has been done.** The rename path was proven by
putting dev back to live's exact collection names and running `eip ensure-mongo` once, with every count
matching afterwards. The owner backfill and the statistics reshape have since had the same treatment
against a restored copy of live. `prepareRelease` carries every step this release owes, so the database
is ready for the window.

## Wire compatibility

| Surface | Change |
|---------|--------|
| `_meta` owner block | **migrate-required** — one cutover; no forward-compatible shape. Rollback is `revertRelease` over the copies the release takes first — see § Live data, and the cutover window |
| `_meta` on the wire | **not breaking** — the owner does not leave the server by the API, and `accountID` had one SPA reader that already falls back to the store, so the client change is a deletion. A change delivery carries `_meta.owner` regardless, which § Stage G, G5 records |
| `ChangeStreamMessage` scope fields | **Landed** as one `ownerKey`, replacing the three. Breaking core to websocket only; internal, and both ship in the same window. JetStream holds `doc.update` for an hour, so the two shapes must not be split across deploys — see [archived-jobs-stats](../archived-jobs-stats/overlay.md) § How a change reaches the right clients |
| `ArchivedJobStats` owner | **migrate-required** — same window |
| Collection names, document ids | **migrate-required**; client-facing via changestream groups and the subscribe allow-list, which are small and account-based today and move with the rename |
| `job_documents`, `job_groups`, `archived_jobs`, template `_id` | **migrate-required** — each becomes `{ownerKey}\|{id}`, rewritten in the owner walk. **Not breaking on the wire**: the bare id is what a client sends and receives, and the server composes the stored form — see § Every owner-scoped document id carries its owner |
| `SessionGrants` in Redis | records expire, and the window can clear them outright rather than tolerating two shapes |
| `upgrade_scopes` / `scopes_ack` | **removed** — no client sends them, so there is nothing to cut with; the Stage E message that narrows to an active planner is additive |
| Statistics routes | **breaking** if deferred, additive if the owner handle lands while the account is still the only value — hence it is owed by archived-jobs-stats before it ships |
| Planner, membership, invite endpoints | additive. Invites are Redis records with a TTL rather than documents, so nothing about them is migrate-required — an unredeemed invite outliving a deploy is a link that still works, and one lost to an unclean stop is reissued |
| Owner on scoped writes and reads | **additive now, required at cutover.** Absent means the account's own only while the SPA is wired around; the cutover makes it mandatory and refuses a request without one — see § Ownership is decided at creation |
| SPA query keys | additive, but mandatory — an owner-less key makes two planners share one cache entry. Archive and statistics keys carry the owner **asked for** rather than the active planner, since those reads cross planners without switching — see § The archive is read across planners without switching |
| `group_template_catalog`, `group_template_payloads` owner block | **migrate-required** — the catalogue's `_id` becomes the owner key and both collections gain `_meta.owner`; existing rows are rewritten under `account:{id}` in the same window as the other stamps |
| Document lock Redis keys | **not breaking, and no migration.** The namespace becomes the owner key, which for an account planner is the value already there; keys are ephemeral under a TTL besides, so any that do not match are abandoned rather than rewritten — see § Stage H |
| `doc.lock.{id}` fan-out subject | **breaking core to websocket only** — internal, both ship in the same window. The subject takes the owner key so lock events reach a planner's members rather than one account's tabs |
| Document lock HTTP endpoints | additive — the request body already names a collection and a document id, and the owner is resolved server-side from the document rather than sent |
| Document lock WS frames | **migrate-required** — waitlist pulse, viewer presence and the lock-state batch each carry an `owner` handle, and a frame without one is refused rather than scoped to the connection's last-known planner. Client and server ship in the same window, which this release already is |

## What the other projects owe

**[archived-jobs-stats](../archived-jobs-stats/plan.md)** — the four items below are written into that
plan as § Owner block — owed to shared planners. Nothing built needs redoing; Stage J
already keyed the queue, the delta, the rota and the tasks on `StatsOwner`. Four changes, of which
the first two are only cheap while that project is still open and touching live data:

1. Collapse `ArchivedJobStats.AccountID` / `CorpRef` into the embedded owner now, and land the
   `StatsOwner` → `Owner` rename with it. It is the row the backfill rewrites, so doing it later means
   two migrations over one collection — and the rename is theirs because all but one of the type's
   non-test call sites are their own code. **Stage A here consumes `models.Owner`, so it waits on this
   item rather than the other way round.**
2. Take the collection and document-id renames in the same pass, for the same reason.
3. Put the owner handle in the statistics route and the owner in the SPA query key, while the account
   is still the only value and the change is additive.
4. Drop that project's Stage C ownership inference. Its blocking question is answered by § Ownership is decided at
   creation, and the producer it was waiting on is not built.

**[planning-stage-panels](../planning-stage-panels/plan.md)** — one data change owed, small and
mechanical.

An invention entry's `id` was minted from the clock and stored as a number. Two entries minted in the
same millisecond took the same id, and a row is removed by matching on it, so removing one removed
both. It is a uuid now, and `models.InventionEntry` decodes either shape — a number is read as its own
digits — so nothing breaks while both are in the collection.

**Existing rows still carry numbers, and want switching in the release window.** In the live snapshot
that is **184 archived jobs and 12 live job documents** holding `build.costs.inventionEntries` with
int64 ids. Rewriting each to a uuid is one pass over two collections, alongside the other data changes
this release rides — the entries are not referenced from anywhere else, so nothing points at the old
value and no second collection needs updating with it. The collision it removes is unlikely rather than
impossible: two entries added in one millisecond needs a scripted or double-submitted add, which is why
this is worth doing in a window that already exists rather than one of its own.

Leaving it undone costs nothing immediately — both shapes decode, and the duplicate ids that exist
today were already there. What it costs is that the guarantee stays partial: a job carrying two rows
that collided before the change still loses both when either is removed.

**[entity-id-encryption](../entity-id-encryption/plan.md)** — no change owed. This project consumes
corporation and alliance refs as planner ids at Stage F and mints none. Stages A–E do not depend on it.

**websocket-realtime** — **retired into this project.** Its promotion stages described the
`upgrade_scopes` scope-ceiling model, and Stage B removed that rather than reshaping it; eight of the
files its verification table cited no longer exist. Following it would have published an authorisation
model the code does not implement, which is the failure it was written to prevent. The two facts worth
keeping moved to § Stage G — Absorbed from the retired websocket-realtime project, and the folder is
gone. Tenant strings keep their present values; a new kind is a new prefix, not a new routing model.

**[changestream-tenant-scale](../changestream-tenant-scale/contents.md)** — no code owed, but this
project's § Collection layout **withdrew that plan's Phase C**, which had been waiting for separate
corporation and alliance collections to register as their own change stream groups. One collection per
document type means those groups never exist, so its per-tenant publish queues (Phase B) become the only
thing isolating a busy planner from the tenants sharing its group cursor. Tenant strings themselves are
unchanged. That plan records the withdrawal; nothing here blocks on it, but a shared planner carrying
real traffic is what makes its Phase B matter.

## Go modernisation in scope

`go fix -diff` over the packages this plan names, re-run against the tree as it stands, reports one
remaining suggestion. It is applied with the stage that touches the file rather than as a sweep:

| File | Suggestion |
|------|------------|
| ~~`api/helper/auth/refresh_token.go`~~ | **Applied** with Stage B — `session_start` and `session_seen_at` take `omitzero`, which omits a zero time as the original tag intended, and the dead `omitempty` on the two `Grants` fields was dropped once they became structs |
| ~~`api/helper/sso/jwt.go`~~ | **Gone** — the file no longer exists; the SSO code lives under `api/v1endpoints/sso`, which the scan reports nothing for |
| ~~`websocket/server/reader.go`~~ | **Applied** — `reader.go` uses `errors.AsType` |
| ~~`core/changestream/resume.go`~~ | **Applied** — `errors.AsType` landed with the watcher's routing-log fix under [archived-jobs-stats](../archived-jobs-stats/plan.md), which put that package in its touch surface |

The remaining item does not block the plan. The scan is not a licence to modernise packages the stages
do not touch.

## Open questions

- **Access list details.** The scope name, response field names and cache timing, to be read from the
  OpenAPI spec. Also what happens when the managing character's token lapses, and how often the list
  is polled. Shape and consequences are described in § Access lists differ from the other ESI
  providers.
- **Archive attribution.** A job archived in a shared planner belongs to that planner's archive. Does
  the row also record which account archived it, for a per-member contribution view? Assumed yes, as
  a field on the row, with no second archive written.
- **Ownership transfer and deletion.** What happens to a planner and its archive when the owner leaves
  or deletes it. Soft delete plus explicit transfer is the assumption; the leaving member takes no
  history with them.
- **Moving a document between planners.** Not offered in this project. If it is ever wanted it is an
  explicit, audited operation, not an edit to an owner field.
- **Permissions in full.** Who may do what inside a planner, which models a planner may run, and how
  two active models combine. Separate work by design; this project only guarantees a model can attach.
  See § Permissions are separate work, and must be pluggable.
- **Who administers a corporation planner.** Nothing derives it, and the first member to appear is
  arbitrary. Falls out of the permissions decision above.
- ~~Group templates: account-owned or planner-owned?~~ **Settled** — they shipped without an owner
  prefix and take no owner block, so they are an account's personal library. See § Collection layout.
- **Job status labels.** The set of status ids is planner-owned; whether the *labels* stay personal is
  undecided. See § Settings split between the planner and the account.
- **Blueprint ownership.** Whose blueprints — and whose ME/TE on them — apply on a shared planner is
  not answered here. It follows the same test as the settings above: is the value baked into the job
  at write time, or read live? Stage J set the precedent for the second half of that test — a figure
  read live is worked out for the reader and not stored — but ME and TE are inputs a member chose,
  not figures derived from them, so the answer does not follow automatically.

## Done when

- Every scoped document carries one owner block, and no code reads a per-scope field.
- Query filters, indexes, collection names and document ids are expressed in owners, with the account
  kind resolving to the values the system already used.
- An account has exactly one automatically created personal planner, and can create, join and leave
  custom shared planners.
- A request naming a planner the account holds no membership row for is refused, and knowing a planner
  id or holding a revoked invite reaches nothing.
- Removing a member closes their HTTP access on the next request and drops their live websocket pools
  without waiting for a token refresh.
- Each planner has its own jobs, groups, archive and statistics, and archiving a job in one planner
  changes no figure in another.
- Editing another member's job never rewrites its structure, efficiency or character, and never
  writes a related job whose lock someone else holds.
- A figure that depends on whose character is reading it is worked out for the reader rather than
  stored on the shared document, and says so wherever it cannot be resolved.
- Corporation and alliance planners are a row reconcile and nothing else — grants, routing, archive
  and UI need no branch on which provider a planner uses.
- A reconnecting or planner-switching client is told what it missed rather than assuming it missed
  nothing, and no apply is dropped because two writers' timestamps compared equal.
- Tests ship with each stage, not as a later wave.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — the owner block, in one cutover | **Landed.** Built under [archived-jobs-stats](../archived-jobs-stats/plan.md) and now owned here. Model, vocabulary, writers, filters, index specs, renames, `ChangeStreamMessage.OwnerKey`, the `prepareRelease` stamp and its gate are all in, the rehearsal against a restored copy of live is done, and the stamp has run repeatedly as steps were added to it: every document carries an owner, counted rather than assumed, and the gate passes — see § Stage A |
| B — grants and scopes as owner lists | **Landed.** `models.SessionGrants` is the one grants type, a connection's scopes and the routing index are owner keys derived at connect, and `prepareRelease` rewrites stored grants. `upgrade_scopes` is removed rather than reshaped, and the `active_planner` message replacing it landed at Stage E — see § Why the client no longer asks for scopes. The § Go modernisation item is applied |
| C — planner and membership documents | **Landed.** C1 the two collections and their indexes, C2 the account-planner backfill and the write first login repairs from, C3 membership as the source of grants with authorisation reading the rows rather than a cached list, C4 the collection set per owner kind and document-subscribe authorisation by membership. Invites moved to Stage E |
| D — what a second member breaks | **Landed.** D1 recalculation keeping a job's build context — a live defect on personal planners, now fixed. D2 is handled server-side already; the retry-queue defect it uncovered is [document-write-granularity](../document-write-granularity/plan.md) § Stage B. D3 the extras categories, which turned out to need a settings write path as well as a picker: the list is the planner's, edited through `PUT /planners/{owner}/settings`, and the account's copy stops being edited. Job statuses needed nothing, their id space already being a frozen catalog. See § Stage D — what a second member breaks |
| E — custom planners | **Landed.** In: the planner settings document (seeded by value from the creating account, planner-held and watched), one write path for every planner, the planners listing, corporation planner creation with its name looked up server-side and NPC corporations refused, the `active_planner` message with the ceiling intersection and its restore across a reconnect, the owner handle on every delivered document, a client switcher that moves the header on every scoped request and the owner in every scoped query key alongside the connection, and invites as Redis records with the join path that redeems them. Also in: grants in both directions — every path that changes a membership row rewrites the account's stored ceiling from the rows and announces it, and every replica narrows the connections it holds for that account. **Nothing outstanding.** Keying the job and group stores by owner is met by G1: the store records the planner its arrays hold and a load for another replaces rather than merges, and Stage G has since settled that it holds that one planner and no more. See § Stage E and [overlay.md](./overlay.md) § Stage E |
| F — ESI providers | **F1 landed.** Corporation and alliance membership rows are reconciled from the ids ESI reports, at login and on the cloud token sweep, completing a task that read as finished and wrote no rows. A row grants while it exists and nothing expires one: a revoked token is a positive answer the reconcile acts on, and a two-year dormant account is cleared by `InactiveAccountPlannerCleanup`. Owed: reshaping when the grant task fires and how it resolves, and access lists |
| G — realtime state under more than one writer | **Landed.** In: the planner document load (G1's first half) — one loader behind the switch, the reconnect and the background-tab wake, with every load but the newest discarded, the planner the job store holds recorded on it, and queued job and group writes flushed before the planner moves. Also in: G2, the ordering position — a delivery carries its place in the stream, the client holds one per document and applies only what is beyond it, and a delete carries a position as readily as an upsert. And G4, the delivery construction — a full shard waits for room instead of overtaking what is queued for that owner, renewing the acknowledgement deadline while it waits and counting itself in the drain. Also in: G5, a settings change reaching the members it is for — `planner_settings` was delivered and dropped on arrival, and now has a handler that files it under the owner the delivery names rather than the owner key its `_id` carries. Also in: G3 — a resume carries how far the tab applied and is answered by comparing it with what was published for the tenants that connection reads, rather than asserting that nothing happened. Also in: the `websocket/sync` package and `skipWhileSyncing` are removed, which closes what G1 carried. Both questions the slices deferred are now answered: the stores hold the active planner only, and a gap is reloaded through rather than replayed. Absorbs what survived the retired websocket-realtime project, including keying the job and group stores by owner. **Nothing outstanding** — see § Stage G |
| H — the document lock stops being account-shaped | **Landed** (H1, H2, H3, H4). H1 put the waiting session's account on its waitlist entry, so a promotion can name the holder. H2 moved the key namespace onto the owner — lock key, waitlist, pulse and viewer set — with the acting account threaded separately to the four scripts that write or compare it, and the owner resolved from the request's planner rather than the JWT. H3 moved the fan-out to `doc.lock.{ownerKey}` and widened the consumer filters to every owner kind, which retired the corp/alliance selectivity note they carried. A personal planner's keys are byte-identical throughout, `account:{id}` being its owner key. H4 moved the socket paths off the connection's last-known planner: every lock frame names its own, refused against the session's ceiling, as the HTTP paths already did — see § Stage H |
| I — where the grants ceiling is read from | **Not started, and deliberately unscheduled.** A decision rather than a build: the ceiling is a stored snapshot read once at connect, and whether it stays one depends on the revocation path Stage E owes and the grant-task reshaping Stage F owes. Raised from [auth-hardening](../auth-hardening/plan.md) § Stage E — see § Stage I |
| J — the SPA stops assuming it is the only writer | **Landed.** The client work in this project was a dropdown to prove the backend, which is what it was for; converting the planner into something two people can work in was never planned. An audit found four groups, and the four decisions that gated them are taken: no member is named on screen, a remote change is applied where it is only read and surfaced where it is being edited, roles come later as designed, and stale-snapshot writing goes to document-write-granularity. All four of its defects are fixed: the group delete that made every member write, the editor that was never told its job was deleted — where a save recreated what somebody else removed — the force-release control, which offered a blocked member a button the server would always refuse and reported a colleague's lock as no lock at all, and the skills fallback that mis-costed another member's job. The last of those took the stored estimates with it: a figure whose value depends on the reader is worked out where it is shown rather than written into the document, which is both estimates on a setup, and the two screens that open a chain now fetch the whole of it rather than one link. See § Stage J |

## Recommended pickup order

**No defect here is unfixed.** Stage J was the last stage carrying any, and it is closed: its four
decisions are taken and all four are fixed — the group delete that made every other connected member
write, the editor that was never told its job was deleted, the force-release control that now carries
whether the lock holder shares the reader's account as a boolean naming nobody, and the setup figures,
which stopped being stored and are worked out for whoever is reading.

**Stage F's grant-task reshaping is the only buildable work left**, and it is an efficiency change
rather than a repair. The task fires on every login and every token refresh whether or not anything has
changed, and resolves the whole set each time: more often than the design wants and more work per run
than it needs, but correct as it stands with nothing waiting on it — see § Stage F.

Stage G is closed: both questions its slices deferred are answered, the stores holding the active
planner only and a gap being reloaded through rather than replayed.

**Blocked.** Stage F's other slice, access lists, waits on the scope and field names being read from
the OpenAPI spec. Stage I stays undecided and cannot be taken until Stage E's revocation path and
Stage F's grant task settle.

Stage E is closed. Its grants work leaves two trade-offs Stage I should revisit: the announcement is
fire-and-forget, so a replica that misses one keeps a revoked planner on that connection until it
reconnects, and the browser is told nothing when its scopes narrow.

**Owed to the operator**, and the one with a live consequence: the revert rehearsal in the next
section. It cannot be reached by running the release again — see why there.

### Owed to the release, not to a stage

One rehearsal has not been done: **the planner collections have never been copied while empty.** They
are copied now — that was the fix for a revert that left the documents the release created standing —
but on the database it was rehearsed against the app had already recreated one, so the copy recorded 1
rather than 0, and it is the zero that makes `revertRelease` drop a collection instead of restoring it.
The three copies still hold exactly one document each, which is that case measured rather than recalled
— [measurements/owner-stamp-coverage.md](./measurements/owner-stamp-coverage.md).
Live is a genuine first run, so that is the path it will take.

Re-running is what keeps it unproven. The first run created the planner documents; every run after it
copies a collection that is no longer empty, so no amount of repeating the release reaches the zero the
drop path needs. Dropping the three collections first, as below, is the only way this database produces
it.

To prove it: stop the worker **and** user traffic, drop `planners`, `planner_memberships` and
`planner_settings`, run `prepareRelease`, check the copy step reports 0 for each, then revert and check
all three are dropped rather than restored. Figures from the run that prompted this are in
[measurements/extras-categories-backfill.md](./measurements/extras-categories-backfill.md).
