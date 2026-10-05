# Open migration projects — review index

**Rules:** Read and following [`./documentation-rules.md`](./documentation-rules.md)
and [`./technical-rules.md`](./technical-rules.md) (migration-plans).
This index and the reviews it links edit nothing outside `migration-plans/`, move no status in any
`plan.md`, and touch no live SoT. They record what the code bears out so each plan can be corrected
deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## What this is

Every open project under `migration-plans/` now carries a `review.md`. Each one answers the same three
questions in the same shape:

1. **Verified status.** Each stage's claimed status checked against the code, with the file that proves
   it and a verdict: confirmed, overstated, understated, partly or unverifiable.
2. **What each remaining step changes.** What exists today and what it becomes, with model examples
   (stored documents, Go and JS shapes, wire messages, screen behaviour), the work items, and whether
   the change is additive, breaking or migrate-required.
3. **Decisions needed.** Every point that is not an implementer's to settle, with the options, a
   recommendation, and what stays blocked until it is taken.

This file is the map across them: where every project really is, what the shared release still owes,
the findings that belong to no single project, and an order to take the decisions in.

"Landed" in every review means **on this branch's lineage**. The deployed branch is `Public`, and
almost none of the work reviewed here is on it. The whole of shared-planners, job-document-drafts,
document-write-granularity and the landed half of auth-hardening reaches production together, in the
one release window.

## Where every project is

| Project | The plan says | The code bears out | Review |
|---------|---------------|--------------------|--------|
| shared-planners | Stages A–H and J landed; I and K not started | Backend matches, with one exception: Stage E is recorded as landed with nothing outstanding and no custom planner can be created. The release is not ready to rehearse | [review](./shared-planners/review.md) |
| document-write-granularity | A–E landed; F in progress | Confirmed throughout. F's two built slices exist only as uncommitted changes | [review](./document-write-granularity/review.md) |
| job-document-drafts | Stages 1–5 landed | The reshape, the editor store and the removal of the `Job` class are in. `layout` is claimed retired and is still stored and edited. Stage 2b has no status row and is in nobody's release list | [review](./job-document-drafts/review.md) |
| document-defaults | Phase 1 only | Confirmed. Three of its premises are wrong or stale | [review](./document-defaults/review.md) |
| job-groups | Unblocked, no product work | Confirmed, and the unblocking is real. Its schema argument rests on a false premise | [review](./job-groups/review.md) |
| entity-id-encryption | Primitive, boundaries and token encryption landed; one sweep and two cleanups left | The landed part is confirmed. The remaining sweep is larger than the plan reads, and its planned gate would pass without converting anything | [review](./entity-id-encryption/review.md) |
| auth-hardening | A, B, E, G landed; H's wire half landed; C, D, F not started | Confirmed in every stage. Two of its stages contradict each other | [review](./auth-hardening/review.md) |
| planning-stage-panels | A–O done; P and Q designed | Confirmed. The plan, overlay and promote drafts have fallen behind the code, so it is not promotable as it stands | [review](./planning-stage-panels/review.md) |
| purchasing-stage-panels | Phase 1 only; A–J not started | Confirmed. The plan misdescribes how purchases are recorded today | [review](./purchasing-stage-panels/review.md) |
| building-stage-panels | Stage A landed; B–H not started | Confirmed. Two later stages lean on Purchasing work that does not exist yet | [review](./building-stage-panels/review.md) |
| archived-jobs-stats | Every stage complete | Confirmed, and already promoted. What remains is the release window and plan text that has drifted from the code | [review](./archived-jobs-stats/review.md) |
| reprocessing-rebuild | B, C, D1, D3, E complete; F onward not started | B–E are real and tested but uncommitted. Stage F is mid-slice in the tree while the plan says not started | [review](./reprocessing-rebuild/review.md) |
| realtime-message-routing | A and C steps 1–3 landed; B, C step 4, D open | Confirmed. The premise it is parked on has been overtaken by the code | [review](./realtime-message-routing/review.md) |
| changestream-tenant-scale | A-0 landed; A, B, D open; C withdrawn | Confirmed. Two overlay files still call Phase C open | [review](./changestream-tenant-scale/review.md) |
| mongo-test-database | A landed; B landed per run; C and D not started | Confirmed. Not promotable: no CI job exists and the promote draft is an empty stub | [review](./mongo-test-database/review.md) |
| spa-delivery | A landed; B–E open | Confirmed. The remaining stages are described against code that has since moved | [review](./spa-delivery/review.md) |
| static-data-build | Phase 1 only | Confirmed. Blocked on static-data-delivery in two places the plan does not name | [review](./static-data-build/review.md) |
| static-data-delivery | D partial; A, B, C, E open | Confirmed. One of Stage C's items is already in code and undeployed | [review](./static-data-delivery/review.md) |
| react-19-idioms | Phase 1 only | Confirmed. The inventory has drifted by a handful of sites | [review](./react-19-idioms/review.md) |
| view-transitions | Phases 2–5 done | Confirmed with passing tests. At its close condition, unpromoted | [review](./view-transitions/review.md) |
| spa-module-homes | Phase 1 only | Confirmed. Nothing has moved | [review](./spa-module-homes/review.md) |

Only one status across the twenty-one is materially wrong: **shared-planners Stage E**. Everything
else the plans call landed is in the code. The drift runs the other way: plans and overlays that still
describe code as it stood before a neighbouring project landed on top of it.

Six projects are closed and were not reviewed: swarm-stack, collection-naming, effect-state-sync,
market-pricing-defaults, market-locations and market-price-delivery. Each is promoted and kept only
because an open project still cites it. `collection-naming/` carries no status line of its own; the
section [`contents.md`](./contents.md) is the only place that says it is promoted.

## The release every project ships in

shared-planners owns the release window and the order of its `prepareRelease` steps. The step list in
`services/core/commands/prepare_release.go` holds 26 steps and matches the plan's list of steps that
are in:

```text
check the owner-scoped id rewrite has finished
copy every collection this release writes to                          (required)
complete outstanding schema maintenance                               (required)
stamp the owner onto every scoped document                            (required)
drop retired change stream resume tokens
drop unaddressable rebuild queue entries
stamp extras category labels onto jobs
reshape every job document                                            (required)
store every extras and invention row in the shape its model writes
drop retired statistics fields
queue every account for rebuild
rebuild the current SDE version
give every account its planner
move each account's extras categories onto its planner
give every document a write counter at _meta.revision
rewrite session grants as owner keys
seed each account's buying and selling pricing defaults
fold custom structures into one array
give every settings document an empty market lane
fold rig slots onto every saved structure
move every saved market onto its own lane
fold rig slots onto every setup
clear the system left on a setup that moved off The Fulcrum
drop the market keys this release retires
verify every document carries an owner
verify every owner-scoped id carries its owner
```

What the open projects still owe that list, and what each review found about it:

| Owed step | Owner | State in the code | What the review found |
|-----------|-------|-------------------|-----------------------|
| Convert stored ids to entity refs, with a gate | entity-id-encryption | `tasks encodeJobIdentity` exists outside the release; no gate | Its filter names `build.costs.linkedJobs`, which the reshape step moves to `esi.industryJobs`. A gate counting that filter reports zero on a reshaped database whether or not anything converted. The step must sit after the reshape, not after the owner stamp as two plans say. The core service holds no `ENTITY_ID_KEY`, so a step cannot convert in-process as the stack stands |
| Convert extras category ids to slugs | document-defaults | Not built | Its planned slot breaks the earlier label stamp, which would stop naming the 865 unfiled rows once the constant is a slug. `planner_settings` must be converted too, or the later planner backfill merges six slug rows beside six digit rows |
| Move reprocessing settings onto the planner | reprocessing-rebuild | Not built, while the model change it migrates **is** in the tree | The account model has already dropped five reprocessing fields, uncommitted. Deployed without this step, every account's stored choices are silently discarded |
| Repair group membership, drop derived sets | job-groups | Not built | Its backfill has no rule for when the group's list and a job's `groupID` disagree |
| Owner stated once, archive block | job-document-drafts Stage 2b | Not built, and not in the shared-planners owed list at all | It moves stored paths and wants this window. By default it misses the release |
| Rewrite invention entry ids as uuids | planning-stage-panels, shared-planners | The existing step writes digit strings | Two plans say uuids; the step leaves the collision they name |

Three more things make the window not yet rehearsable, none of them a step:

- **Corporation planners are reachable today**, so a planner with two people in it ships in this
  window whether or not custom planners do. That turns three items the plan treats as later work into
  release questions: the delivery gate's missing collection dimension (G6), where the grants ceiling
  is read from (Stage I), and the lock between two people (Stage K).
- **`layout` comes back after the window.** The reshape deletes `layout` from every stored job, and
  the SPA and `models.JobLayout` still write it, so the first save of each job restores it.
- **Entity refs reach the browser** on a change delivery for an organisation-owned planner, in `_id`,
  `docID` and `_meta.owner.id`. shared-planners records it and assigns it to nobody.

## Findings that belong to no single project

Each of these was found by one review and affects several plans. They are listed here because no one
project's review can close them.

### Live already holds schema version 1

shared-planners, job-groups and document-defaults each justify "no schema version moves in this
release" with the same sentence: `Public` has no `document_schema.go`, so live has never held a v1
document. That is not so. The file is on `Public` at a different path, with a batch task that stamps
the version onto job and group documents:

```go
// Public: services/shared/shared/models/document_schema.go
const (
	UserAccountDocumentSchemaCurrent = 1
	ApplicationSettingsSchemaCurrent = 1
	JobSchemaCurrent                 = 1
	GroupSchemaCurrent               = 1
)
```

Live jobs and groups therefore carry `schemaVersion: 1` in the old shape. The no-bump conclusion may
still be the right one, but it needs different grounds, and no conversion step can use the version to
find the documents it missed. The live count of stamped documents has not been measured.
Detail: [document-defaults](./document-defaults/review.md) § Decisions needed,
[job-groups](./job-groups/review.md) § Decisions needed.

### One field, three plans, no owner

`LinkedESIJob.CorporationID` stores a plain corporation id on a job's linked industry runs.
job-document-drafts claims it under Stage 2b, document-write-granularity lists it as an open question
for "whoever owns the cipher", and entity-id-encryption still names it at its pre-reshape path.
`layout.esiJobTab` is in the same position between building-stage-panels and job-document-drafts.

### Editing without the lock is designed in three places

job-document-drafts carries a design for drafting without the lock. document-write-granularity built
the held layer and the change-review panel that such editing would use. shared-planners Stage K says
an expired lease keeps changes in that held layer and rebases through that panel. None of the three
names the others as owner. Meanwhile `useActiveJobReadOnly` still disables controls in 15 files.

### Two projects wait on things that have already happened

- realtime-message-routing is parked until the connection's grants ceiling is refreshed. It already
  is: `applySessionGrantsChanged` replaces `Client.Ceiling` in place. What is left in shared-planners
  Stage I is a decision, not a build.
- purchasing-stage-panels says its ore panel waits on reprocessing-rebuild Stages C to E. Those are
  built. The panel now waits only on Purchasing's own stages.

### A hosting provider is written into two plans

spa-delivery Stage C and static-data-delivery Stage D both name Cloudflare: a `Cloudflare-CDN-Cache-Control`
header, a Cache Rule, `cf-cache-status` in a done-when. EIP is self-hostable and its repository does
not assume a provider. Both reviews recommend the standard `CDN-Cache-Control` header and restating
the edge rule as an operator note rather than a stage.

### Work with no project

- **The Shopping List.** react-19-idioms defers seven effects to "its own redesign", and
  reprocessing-rebuild designs an ore-aware copy for it. No project is scoped to redesign it.
- **Minerals bought as ore** on the Planning stage and the Shopping List: designed and drawn, owned by
  nobody. Purchasing's part is held open in purchasing-stage-panels.
- **The Setups panel and Blueprint Library**: the last two Planning panels on the old shell. A design
  exists and no project is scoped.
- **A fragility shared-planners parks with auth-hardening**: `ensurePlannerSession` cannot tell "not
  yet logged in" from "credentials unavailable". auth-hardening has no stage for it.

### Live documentation already out of step

These are recorded for whoever promotes; nothing here was edited.

- `backend/api/document-lock/locks.md` still shows `holderSessionID` and `doc.lock.{accountID}`. The
  code renamed both, and neither auth-hardening's nor shared-planners' promote list names the file.
- `frontend/navigation/spa.md` describes a page `Fade` that no longer exists, and
  `frontend/technical-rules.md` says dialogues do not fade out. Both wait on view-transitions.
- `frontend/editjob/` already exists with two topic docs describing controls that planning-stage-panels
  Stages P and Q remove. That project's promote README calls the area new.
- `backend/api/auth/sessions.md` cites a keyring path that has moved.

## Decisions, in the order they unblock work

The reviews hold 125 decisions between them. Most gate one stage of one project and can wait until
that stage is picked up. The ones below gate the release or more than one project, and are listed in
the order that frees the most work.

### Before the release can be rehearsed

1. **What Stage E ships.** Build custom planners in this window, or correct the status and defer them
   to a stage of their own. [shared-planners](./shared-planners/review.md)
2. **Which owed steps gate the window** and which are explicitly deferred. Six are listed above.
   [shared-planners](./shared-planners/review.md)
3. **The schema version, now that live holds v1.** Keep no-bump on corrected grounds, or bump once for
   this build. [document-defaults](./document-defaults/review.md), [job-groups](./job-groups/review.md)
4. **How the entity-ref conversion runs in the window, and what its gate counts.** In-process in core
   needs the key on core; queued to workers needs a second run to gate on.
   [entity-id-encryption](./entity-id-encryption/review.md)
5. **Whether Stage 2b rides the window.** [job-document-drafts](./job-document-drafts/review.md)
6. **`layout` before the window.** Retire it, and say where the selected setup lives instead.
   [job-document-drafts](./job-document-drafts/review.md)
7. **What reprocessing's release step converts.** The plan is silent on two of the fields.
   [reprocessing-rebuild](./reprocessing-rebuild/review.md)
8. **Where the slug conversion sits** relative to the label stamp.
   [document-defaults](./document-defaults/review.md)
9. **Invention entry ids: digits or uuids.** [shared-planners](./shared-planners/review.md)

### Because two people can share a planner on day one

10. **Whether Stage K gates the window**, at least for the subset that loses work.
    [shared-planners](./shared-planners/review.md)
11. **G6: separate the account's documents from its personal planner's by collection or by owner**,
    and which project edits the delivery walk. [shared-planners](./shared-planners/review.md),
    [realtime-message-routing](./realtime-message-routing/review.md)
12. **The grants ceiling: stored, read live, or read through.** Closes auth-hardening #53 and frees
    realtime-message-routing Stage B. [shared-planners](./shared-planners/review.md)
13. **Who closes the ref leak on organisation-owned deliveries.**
    [entity-id-encryption](./entity-id-encryption/review.md)
14. **Group templates: the planner's or the account's.** The plan settles it both ways.
    [shared-planners](./shared-planners/review.md)
15. **Who owns editing without the lock.** [job-document-drafts](./job-document-drafts/review.md)

### That free a whole project

16. **Whether logs carry a session id at all.** auth-hardening Stage H says no and Stage C says every
    failure log does. Neither can be built until one gives. [auth-hardening](./auth-hardening/review.md)
17. **What an archive becomes** once a save is one change. The mechanism writes one collection and an
    archive writes two. [document-write-granularity](./document-write-granularity/review.md)
18. **Promote planning-stage-panels A–O now, or hold for P and Q.** The drafts went stale while
    waiting. [planning-stage-panels](./planning-stage-panels/review.md)
19. **Whether offline job creation must keep working.** Gates static-data-delivery Stage E and
    reprocessing-rebuild Stage M. [static-data-delivery](./static-data-delivery/review.md)
20. **Where the job model lives in the SPA.** Blocks every wide move in spa-module-homes.
    [spa-module-homes](./spa-module-homes/review.md)
21. **One database per test binary, or stay serial.** Blocks the CI job.
    [mongo-test-database](./mongo-test-database/review.md)
22. **How the resume token advances once publishes are out of order.** Decides whether
    at-least-once delivery survives per-tenant queues.
    [changestream-tenant-scale](./changestream-tenant-scale/review.md)
23. **Ship reprocessing's stand-in figures, or hold them for three in-game checks.**
    [reprocessing-rebuild](./reprocessing-rebuild/review.md)
24. **Who owns the Shopping List, the ore-on-stages work, and the last two Planning panels.** Three
    designed pieces of work with no project. [react-19-idioms](./react-19-idioms/review.md),
    [reprocessing-rebuild](./reprocessing-rebuild/review.md),
    [planning-stage-panels](./planning-stage-panels/review.md)

## What can be built with no decision

Each review names its own next slice. These are the ones that wait on nothing:

| Project | Next slice |
|---------|------------|
| document-write-granularity | Add the delivery leg for a change carrying a removal to the live loop test, which completes the merge slice already in the tree |
| reprocessing-rebuild | Endpoint and full-loop tests for the settings write path already in the tree |
| purchasing-stage-panels | Stage A, the price ladder, which is a correctness fix the frozen plan price depends on |
| planning-stage-panels | Stage Q's delete confirmation, the one place a mis-click loses work |
| react-19-idioms | Phase 2's three defects, each behind a characterisation test |
| view-transitions | The pending-splash test |
| changestream-tenant-scale | Phase A, metrics, for a baseline before queues |
| static-data-delivery | Stage A, compact output |
| static-data-build | Stage A, less the cancellation item that waits on delivery |
| spa-delivery | Deploy what is already committed, then take `env.js` out of the edge cache |
| spa-module-homes | Delete the six dead modules and rehome the settled orphan tests |
| building-stage-panels | Stop `tabPanel.jsx` writing `layout.esiJobTab` |

## Plan corrections owed

Every review lists where its plan, overlay or drafts no longer match the code. None was applied,
because several of those files carry another session's uncommitted edits. The corrections that change
what a reader would do:

- **shared-planners:** the Stage E status row; two contradictory Stage F overlay sections; the
  "`ReprocessingSettings` is the next to move" line, which the tree has overtaken.
- **job-document-drafts:** a status row for Stage 2b; the wire table's "whole documents" line; the
  statement that nothing prompts mid-edit; the editor's layers, which omit `held`.
- **document-write-granularity:** three passages still describing the advisory lock that was weighed
  and not taken.
- **entity-id-encryption:** the paths in § What it converts; the step's position.
- **archived-jobs-stats:** a status row for Stage K; the eight-step release list and the
  `tasks backfillMetaOwner` command, neither of which exists; `shared/archivestats`, which is
  `shared/statistics`.
- **purchasing-stage-panels:** § Starting position on how purchases are recorded; the ore panel's
  dependency.
- **planning-stage-panels:** Stage L's storage location; the custom-structure hand-off; five stale
  places in the promote drafts.
- **realtime-message-routing:** § What this project is waiting on.
- **changestream-tenant-scale:** Phase C in two overlay files.
- **spa-delivery:** Stage B's missing mention of the existing version check; Stage D's shared imports;
  two open questions that are answered.
- **mongo-test-database:** the promote draft, which is empty with two stages landed.
- **reprocessing-rebuild:** Stage F's status, which is behind the tree.
