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

**Not owner-shaped.** `models.MetaData` carries `AccountID` plus optional `CorporationRef` and
`AllianceRef` — one field per scope, with the changestream reading the field *names*
(`MetaFieldCorporationRef`, `MetaFieldAllianceRef`) out of a raw `_meta` subdocument. Every base
document is scoped that way, and it is the whole of what Stage A changes.

**Already landed since, under [archived-jobs-stats](../archived-jobs-stats/plan.md).** The statistics
half is done: `models.Owner` exists, the three statistics documents carry a root owner with ids
leading on the owner key, the collections took the names they hold, and the statistics API is
`/api/v1/statistics/{owner}/{view}`. What remains is the `_meta` reshape above.

**Not built at all.** There is no planner document, no membership, no invite, no notion of an active
planner on the client, and no way for one account to see another's data by any path.

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
| `self` | the account is created — one row | none |
| `invite` | an invite is redeemed, or a member is removed | invite, accept, remove |
| `esi-access-list` | a scheduled poll of a bound access list is reconciled | none |
| `esi-corporation` | token refresh reconciles rows against the corporation ids ESI reports | none |
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
| **Owner handle** | `corporation:{raw EVE id}`, and otherwise identical | request paths, websocket `upgrade_scopes`, client payloads, the SPA |

The conversion is exactly the boundary that performs it today: `refsForRequestedIDs` on the way in
and the outgoing client payload on the way out. Account and planner kinds pass through untouched
because their ids are already client-safe. This keeps the standing rule intact — refs stay refs until
the last hop before the bytes reach a browser — and means the SPA never holds a ref for any kind.

## The account planner is the base case

Every account gets a real planner document at signup whose `_id` **is the account id**, with kind
`account` and provider `self`. Not a synthesised pseudo-row: a real document, so there is one code
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
| In-game access list | membership follows a list read from ESI | `JoinMethod.ESI` |

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

Removing a membership row does two things. It mutates the account's session record to drop that owner
key from the grants ceiling, which closes the HTTP surface immediately and bumps `GrantsVersion` under
the existing compare-and-set. And it pushes a scope revocation over the websocket fan-out that already
exists, clearing the planner from `Client.Scopes` and from the reverse indexes — the mirror of
`swapClientOrgScopesAndIndexes`. No lock is acquired around the membership write; the fan-out is the
mechanism for making other sessions current.

### Limits

Caps belong in this project rather than being discovered under load: planners created per account,
members per planner, pending invites per planner, and a rate limit on invite creation and redemption
through the middleware that already exists. A join or invite endpoint without a limit is an invitation
to fill the database.

## What each surface owes

| Surface | Today | After |
|---------|-------|-------|
| `models.MetaData` | `AccountID` + optional `CorporationRef` / `AllianceRef` | one `Owner` block; scope fields gone |
| Changestream routing | reads named `_meta` scope fields | reads `_meta.owner` generically |
| `models.ArchivedJobStats` | **done** — carries a root `Owner` | — |
| Collections | **done** — `jobs`, `statistics_rows`, … | named for what they hold; ownership lives in the document |
| Document ids | **done** — `{ownerKey}\|{jobID}` | — |
| Rebuild queue / rota | owner-keyed already | unchanged; enumerates planners rather than accounts |
| Statistics API | **done** — `/api/v1/statistics/{owner}/{view}` | — |
| `SessionGrants` | `CorporationRefs` + `AllianceRefs` | one list of owner keys, including the account's own |
| `RealtimeScopes` | `CorporationRefs` + `AllianceRefs` | one list of owner keys |
| `upgrade_scopes` / `scopes_ack` | corp and alliance id arrays | owner handles, one shape for every kind |
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
| `planner_invites` | outstanding invite tokens | — |
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

### Collection size

Putting every owner's documents in one collection does not make queries slower, and splitting by kind
would not make them faster.

Every owner-scoped index in `index_specs.go` leads with the owner key, which took the leading
position the account id used to hold; the index shape is otherwise unchanged. An owner-led index seeks into
a contiguous range of the B-tree and walks only that owner's entries, so growth costs tree depth,
which is logarithmic — one extra level of page reads between a hundred thousand documents and a
hundred million. What costs real time is scanning documents that are then discarded, and an owner-led
index never does it.

`jobs` is already a collection holding every account's jobs. This design does not introduce
multi-tenant storage; it generalises who the tenant is.

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

**Group templates are an open question.** They are listed without an owner above, on the unresolved
reading that a template library belongs to the person. A corporation planner wanting shared templates
would make them owner-scoped instead. **Settled by what shipped:** the renames landed them as
`group_template_catalog` and `group_template_payloads` with no owner prefix, and the owner backfill's
collection list does not include them — so they are account-owned, as a personal library.

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
it belongs with the account-scoped view preferences described in § Settings stay with the account.

**Changing a template needs no migration, but it is retroactive.** Because nothing stores a
capability set, changing `eligibleFor` is a code change that reaches every planner at once, with no
document to upgrade. Adding a capability is therefore safe. **Narrowing or removing one is not**:
withdrawing eligibility takes the capability from every planner that held it in the same moment,
including whatever in-flight state it owned, so a removal carries the care of a breaking change and
needs an answer for its data. The discipline sits on narrowing eligibility rather than on migration.

Where a template change does imply a stored shape — a capability needing a new field on a job or on
the planner document — that is ordinary schema versioning through `documentschema.Upgrader`.
`planners`, `planner_memberships` and `planner_invites` join `SchemaMaintainedCollections` when they
land, since the scheduler rotates that list and the batch dispatches on it.

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

## Settings stay with the account

A shared planner does not need a split settings document. A job **stores its own results**:
`build.materials`, `build.costs` and `build.setup` are all persisted, and the setup records the
structure, efficiency and runs actually used. Settings are inputs at write time, not values read at
render time, so a job is self-describing — one member opening another's job sees what that member
built, not a recomputation under their own structures. That is also what people expect: the person who
set a job up used their own structure, and the job says so.

So `ApplicationSettings` stays account-owned, including `DefaultMaterialEfficiencyValue`,
`CustomStructures`, `PredefinedSystemIndexes`, `DefaultCitadelBrokersFee`, `ReprocessingSettings`,
`ExemptTypeIDs`, market location and every display preference.

Two settings are exceptions, both for the same reason: **their ids are stored inside shared
documents**, so a per-account id space makes a shared document ambiguous.

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

### The persist gate must cover the whole cascade

`closeActiveJob` collects the parent/child tree through `getAllRelatedJobs`, adds it to
`batchUpdates`, and writes all of it through `saveJobsViaApi`. The gate,
`canPersistJobClose(inputJob.jobID, groupID)`, tests the lock on the edited job or its group — not on
each related job the cascade rewrites.

On a personal planner the whole tree has one owner and the gap is invisible. On a shared planner
another member can hold the lock on a related job and have it written anyway. The gate has to cover
every document a close will write.

## Data models

Shapes, with the reasoning for what is present and what deliberately is not. Field-by-field detail
that is self-evident is left to the code.

These are the **core** models: the owner, the planner, membership, invites and grants. Access-list
binding is described in § Access lists differ from the other ESI providers but is deliberately not
modelled yet — it adds a join type, a binding on the planner and a poll schedule, none of which the
core needs to be correct.

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

**The owner does not go on the wire.** `_meta.accountID` is read in exactly one place in the SPA
(`Classes/job.js`), nothing downstream reads it back, and the server overwrites whatever a client
uploads. So the field is decorative and the client change is a deletion rather than a repoint — which
also means no corporation or alliance ref can reach a browser through `_meta` at all.

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
type JoinMethod struct {
	Self   *SelfJoin   `bson:"self,omitempty" json:"self,omitempty"`
	Invite *InviteJoin `bson:"invite,omitempty" json:"invite,omitempty"`
	ESI    *ESIJoin    `bson:"esi,omitempty" json:"esi,omitempty"`
}

type SelfJoin struct{}

// JoinKind is derived from the populated branch, for logging and display. It is
// never stored — the branch is the stored discriminator.
type JoinKind string

func (j JoinMethod) Kind() JoinKind
func (j JoinMethod) Validate() error

type InviteJoin struct {
	InvitedBy string    `bson:"invitedBy" json:"-"`
	IssuedAt  time.Time `bson:"issuedAt" json:"-"`
	InviteID  string    `bson:"inviteID,omitempty" json:"-"`
}

type ESIJoin struct {
	EntityRef     string `bson:"entityRef" json:"-"`
	CharacterHash string `bson:"characterHash,omitempty" json:"-"`
}
```

The composite `_id` of `{ownerKey}|{accountID}` gives one row per account per planner without a unique
index; the two lookups needed on the request path are indexed on `accountID` and `plannerID`.

`JoinMethod` records how the membership came about. The **branch that is set is the method** — there
is no separate type constant beside it, because a stored tag and a stored branch encode the same fact
and nothing keeps them agreeing. It also avoided a lossier problem: four join constants mapped onto
three payload shapes, since corporation and alliance share `ESIJoin`, so the constant-to-struct
relationship was implicit.

Corporation and alliance need no discriminator of their own either: `EntityRef` is a ref, and
`entityid.ParseKind` reads `corp_…` or `alliance_…` straight off it.

The costs, taken deliberately: invalid states are representable — no branch set, or two — so
`Validate` is called on write rather than the type making it impossible; and queries select on
`$exists` rather than an equality match. The alternative that makes invalid states unrepresentable is
an interface with hand-written BSON marshalling, which is not worth it for three branches in a repo
whose models are otherwise plain structs with tags.

`InviteJoin` copies who invited the account and when the invite was issued, rather than pointing at
the invite for them. **An invite is a credential; a membership is a record.** The credential is meant
to be disposable — a TTL index on `ExpiresAt` removes expired invites, and a spent or revoked one is
deleted outright — so the record keeps what it needs and lets the invite go. `InviteID` is retained
only for correlation while the invite exists and is allowed to dangle. Nothing keeps a hashed token
past its purpose, and the collection stays the size of the outstanding invites rather than of every
invite ever issued.

`ESIJoin` records which entity granted access — on an alliance planner, the corporation an account is
present through. That is what makes a reconcile removal explainable rather than mysterious. Entity ids
arrive from ESI raw and are converted to refs at ingest; nothing raw is persisted.

The row carries **no role**. A permission model brings its own vocabulary and most likely its own
storage, so a role field here would be a guess at that model's shape, and ambiguous the moment two
models are active. The row answers access and nothing else.

### Invites

```go
type PlannerInvite struct {
	ID             string     `bson:"_id" json:"id"`
	SchemaVersion  int        `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	PlannerID      string     `bson:"plannerID" json:"-"`
	TokenHash      []byte     `bson:"tokenHash" json:"-"`
	BoundAccountID string     `bson:"boundAccountID,omitempty" json:"-"`
	MaxUses        int        `bson:"maxUses" json:"maxUses"`
	Uses           int        `bson:"uses" json:"uses"`
	ExpiresAt      time.Time  `bson:"expiresAt" json:"expiresAt"`
	RevokedAt      *time.Time `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	CreatedBy      string     `bson:"createdBy" json:"-"`
}
```

The `json:"-"` tags are load-bearing: the hash, the binding and the creator never leave the server. An
invite grants membership and nothing more, so it carries no role either.

Invites are **not** retained indefinitely. A TTL index on `ExpiresAt` clears expired ones, and an
invite that is spent or revoked is deleted; what the membership needed from it was copied at join
time.

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
	PlannerInviteSchemaCurrent     = 1
)
```

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

Two consequences of that, both load-bearing rather than incidental:

- The window's gate — **zero documents without `_meta.owner`** — is what makes the deviation safe. It
  is not a formality.
- `owner` is written by `$setOnInsert` only, because a document does not change owner as a side effect
  of a save. So a document the step misses never gains one through ordinary use; the only repair is
  re-running `prepareRelease`, which is idempotent.

`JoinMethod`, `InviteJoin` and `ESIJoin` are only ever inside `PlannerMembership`, so its version
gates them; versioning them separately would create two numbers that must agree with nothing keeping
them in step.

**`SessionGrants` takes no version.** It lives in Redis and its records expire, so its shape change
rolls out rather than migrating; a version there would imply a migration that cannot happen.

### Grants

```go
type SessionGrants struct {
	OwnerKeys []string `json:"owner_keys"`
}
```

One list covering every kind, including the account's own key, so nothing downstream special-cases the
account. It is filled by one query at session bootstrap: the owner keys of every membership row for
this account.

## Stages

### Stage A — The owner block, in one cutover

**Landed, under [archived-jobs-stats](../archived-jobs-stats/plan.md).** The model, the vocabulary, the
writers, the query filters, the index specs and the `prepareRelease` stamp are all implemented; what
that plan still owes is `ChangeStreamMessage`, which decomposes the owner back into three route fields.
Design as built → [archived-jobs-stats](../archived-jobs-stats/plan.md) § The owner block landed as one
cutover. Behaviour → [archived-jobs-stats](../archived-jobs-stats/overlay.md) § The owner block. The
window below is the operator sequence and remains owed against live.

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

The contrast is still worth knowing, because it is why some writes are harmless:
`UpsertStructPreservingMeta` and `buildPreservingMetaUpsertModel` exclude `_meta` from the `$set` and
patch it with dotted paths, which leaves unknown fields alone. Only the whole-struct writers destroy.

**Order inside the window.** Implementation of this stage belongs to
[archived-jobs-stats](../archived-jobs-stats/plan.md) — the `MetaData` reshape is inseparable from the
writers, query filters and changestream work that plan owns, and the owner stamp is a
`prepareRelease` step there rather than a task of its own, so an operator running the release command
cannot silently skip it.

1. Stop user traffic, **and stop the worker**.
2. Back up, with the restore already exercised.
3. `eip ensure-mongo` — renames, index specs, retired indexes.
4. `eip update` — the images carrying the owner block.
5. `eip cli` → `tasks prepareRelease`, one command: outstanding schema maintenance first, then the
   owner stamp, then the rest, with the rebuild queue last. The first two stop the run if they fail,
   because every step after them reads what they write.
6. **Gate:** zero documents without `_meta.owner`, and counts matching. Then worker up, traffic back.

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
`upgrade_scopes` / `scopes_ack` take owner handles in one shape for every kind.

Session records live in Redis and expire, so this is a rolling deploy rather than a migration — a
property worth using rather than working around. It does mean the API and websocket must tolerate both
grant shapes for the length of one session lifetime.

### Stage C — Planner and membership documents

The planner document, the membership collection, and the code that keeps rows current for the `self`
provider only. Every existing account is backfilled a planner whose `_id` is its owner key,
`account:{accountID}`, and one membership row. Purely additive: no existing document's owner value
changes, because the owner id inside that key is the account id those documents already carry.

Membership is a separate collection rather than an array on the planner. Both directions are on the
request path — "which planners can this account see" on every session bootstrap, "who is in this
planner" on every roster read — so both need an index, and an embedded array would make the roster a
hot-write contention point on the planner document itself.

### Stage D — What a second member breaks

The work that has to land **before** any planner can hold two people, because getting it wrong writes
bad figures into an archive that then needs rebuilding.

The two shared id spaces move to the planner: the extras category ids, which key
`ArchivedJobStats.ExtraCategoryTotals`, and the job status id set, which `job.jobStatus` indexes. Both
are described in § Settings stay with the account, along with why everything else stays personal.

Recalculation stops re-deriving a job's build context. `recalculateJobForNewTotal` clears
`build.setup` and rebuilds it from the current user's blueprints, default structure and main
character; it must instead preserve the structure, ME/TE and character of the setup being rebuilt.
This is also a live defect on personal planners, so it stands on its own merits.

The persist gate covers the whole close cascade rather than the edited job alone, so a write cannot
reach a related job whose lock another member holds.

Its test is exact: on a single-member planner, every figure must be identical before and after.

### Stage E — Custom planners

Creation, invite tokens, the join path, the shared authoriser, the limits, and the revocation path.
On the client: the active planner, its persistence, the planner switcher, and the owner in every
scoped query key. Archiving names its destination planner in the UI, because a job archived into the
wrong archive is tedious to unpick.

### Stage F — ESI providers

Corporation and alliance reconcile membership rows from the ids ESI reports, at token refresh and
only when the derived set differs from the stored one. Nothing else is needed: grants already derive
from membership rows, so a new row is a new grant. That there is no other work is the measure of
whether the abstraction held.

## Live data, and the cutover window

`Public` is deployed with real data, and the next deployment takes the stack down. Every data change
this project needs — the owner block, the collection renames, the statistics reshape — rides in that
window rather than being sequenced around live traffic.

What makes that safe here, and would not for a rolling deploy, is that nothing reads or writes while
it runs. A partly-finished backfill in front of live readers is the thing an expand/contract sequence
exists to prevent; with traffic stopped the failure mode is instead that the window overruns, which is
answered by rehearsing on a copy rather than by keeping two shapes readable.

**Rehearsal is the substitute for reversibility.** The rename path has already been proven by putting
dev back to live's exact collection names and running `eip ensure-mongo` once, with every count
matching afterwards. The owner backfill and the statistics reshape want the same treatment before the
window opens: run them against a restored copy of live, time them, and check the counts.

## Wire compatibility

| Surface | Change |
|---------|--------|
| `_meta` owner block | **migrate-required** — one cutover; no forward-compatible shape, so rollback is a database restore |
| `_meta` on the wire | **not breaking** — the owner never leaves the server, and `accountID` had one SPA reader that already falls back to the store, so the client change is a deletion |
| `ChangeStreamMessage` scope fields | **breaking**, core to websocket only; internal, and both ship in the same window |
| `ArchivedJobStats` owner | **migrate-required** — same window |
| Collection names, document ids | **migrate-required**; client-facing via changestream groups and the subscribe allow-list, which are small and account-based today and move with the rename |
| `SessionGrants` in Redis | records expire, and the window can clear them outright rather than tolerating two shapes |
| `upgrade_scopes` / `scopes_ack` | **breaking in shape**, but every value is unchanged for corporation and alliance, so client and server cut together |
| Statistics routes | **breaking** if deferred, additive if the owner handle lands while the account is still the only value — hence it is owed by archived-jobs-stats before it ships |
| Planner, membership, invite endpoints | additive |
| SPA query keys | additive, but mandatory — an owner-less key makes two planners share one cache entry |

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

**[entity-id-encryption](../entity-id-encryption/plan.md)** — no change owed. This project consumes
corporation and alliance refs as planner ids at Stage F and mints none. Stages A–E do not depend on it.

**[changestream-tenant-scale](../changestream-tenant-scale/contents.md)** and
**[websocket-realtime](../websocket-realtime/contents.md)** — no change owed. Tenant strings keep
their present values; a new kind is a new prefix, not a new routing model.

## Go modernisation in scope

`go fix -diff` over the packages this plan names reports suggestions in four files, to be applied
with the stage that touches each rather than as a sweep:

| File | Suggestion |
|------|------------|
| `api/helper/auth/refresh_token.go` | drop `omitempty` on the `Grants` fields (Stage B edits this file) |
| `api/helper/sso/jwt.go` | same class |
| `websocket/server/reader.go` | `errors.AsType` in place of `errors.As` |
| `core/changestream/resume.go` | same class |

None of these block the plan. The scan is not a licence to modernise packages the stages do not touch.

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
  undecided. See § Settings stay with the account.
- **Blueprint ownership.** Whose blueprints — and whose ME/TE on them — apply on a shared planner is
  not answered here. It follows the same test as the settings above: is the value baked into the job
  at write time, or read live?

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
- Corporation and alliance planners are a row reconcile and nothing else — grants, routing, archive
  and UI need no branch on which provider a planner uses.
- Tests ship with each stage, not as a later wave.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — the owner block, in one cutover | Not started, and **implemented under [archived-jobs-stats](../archived-jobs-stats/plan.md)** rather than here: `models.Owner` and the collection renames already landed there, and the `MetaData` reshape is inseparable from the writers, filters and changestream work that plan owns. This plan records the design and the window; that one carries the code |
| B — grants and scopes as owner lists | Not started |
| C — planner and membership documents | Not started |
| D — what a second member breaks | Not started |
| E — custom planners | Not started |
| F — ESI providers | Not started |
