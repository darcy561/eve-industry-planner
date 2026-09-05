# Archived jobs statistics

## Owns

Plan, stage notes, and behaviour overlays for rebuilding archived-job build statistics: per-account and per-corporation aggregation, the monthly timeline, snapshot history, and the statistics API surface that serves them.

Also owns the salvage decisions for `feature/archived-jobs-redesign` — which parts of that branch are carried forward, reimplemented, or dropped.

The live topic docs this project added are promoted and are now SoT:
[backend/worker/statistics.md](../../backend/worker/statistics.md) and
[backend/api/archive.md](../../backend/api/archive.md). This folder no longer describes their
behaviour; it holds the decisions that produced it.

## Does not own

- Live archived-jobs behaviour → [backend/contents.md](../../backend/contents.md) (promoted only when this project closes)
- Live Mongo access layer → [backend/shared/mongo.md](../../backend/shared/mongo.md)
- The owner block, the planner document, membership and everything that decides which planner a job belongs to → [shared-planners/plan.md](../shared-planners/plan.md). This project applies the four items that plan hands it; it does not own the model.
- Entity refs (`char_…` / `corp_…` / `alliance_…`), the `shared/crypto/entityid` cipher that derives them, and the `encodeJobIdentity` conversion → [entity-id-encryption/plan.md](../entity-id-encryption/plan.md)
- Frontend SPA conventions → [frontend/technical-rules.md](../../frontend/technical-rules.md)

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, stages, and done-when | [plan.md](./plan.md) |
| Promote this project into live documentation | [plan.md](./plan.md) § Promote map |
| Know why the folder is not deleted on promote | [plan.md](./plan.md) § Promote map |
| See what this project owes the shared-planners owner block | [plan.md](./plan.md) § Owner block — owed to shared planners |
| See why the existing branch is not merged | [plan.md](./plan.md) § Starting position |
| Know what the statistics surface looks like after each stage | [overlay.md](./overlay.md) |
| Check what has landed and what is still open | [plan.md](./plan.md) § Stage status |
| See what a job records at ingest, and what still does not scope it | [overlay.md](./overlay.md) § Ingest — entity ids on stored jobs |
| Find the data steps owed before Stage C can be designed | [plan.md](./plan.md) § Operational steps owed |
| Understand why a job belongs to exactly one archive | [plan.md](./plan.md) § Ownership is a property of the job |
| Add the archived-jobs page, its charts, or the restore flow | [plan.md](./plan.md) §§ Stage F, G, H |
| Know why a group can be rebuilt without having been stored | [plan.md](./plan.md) § Groups are rebuilt from their jobs |
| See how the archive is read, filtered and grouped today | [overlay.md](./overlay.md) § Stage F |
| Decide whether a query belongs in `shared/` or a service | [overlay.md](./overlay.md) § The queries live in the API |
| Restore a job, a group, or a set of related jobs | [plan.md](./plan.md) § Jobs come back individually, by group, or by related set |
| See how restore works today, and why its order is what it is | [overlay.md](./overlay.md) § Stage G |
| Understand what happens to a group when one of its jobs is archived | [overlay.md](./overlay.md) § Group membership while a job is archived |
| Know which group a restored job rejoins, and whether it is merged or rebuilt | [overlay.md](./overlay.md) § Every restored job returns to its own group |
| Find out why a restore can be refused while another session is editing | [overlay.md](./overlay.md) § The group's lock stands for its archived members |
| See what the archived-jobs page renders and how its charts are layered | [overlay.md](./overlay.md) § Stage H |
| Show one item's history over time, or add to the item tab | [plan.md](./plan.md) § Item statistics is its own tab |
| Know why a period's figures are sliced in the browser rather than fetched | [plan.md](./plan.md) § Item statistics is its own tab |
| Mark a job whose figures have not reached the aggregates yet | [plan.md](./plan.md) § List and restore |
| Write a test that renders an archive page against its endpoints | [plan.md](./plan.md) § Handoff status |
| Understand why group derivation exists twice, and what keeps the two honest | [overlay.md](./overlay.md) § Stage I |
| Change a rule about what a group derives from its jobs | [overlay.md](./overlay.md) § The corpus is the rule |
| Get archive data on a dev account to work against | [overlay.md](./overlay.md) § Generated archive data for development |
| Know what a job's cost is made of | [overlay.md](./overlay.md) § What a period cost, and what it was spent on |
| Change how a job's cost is worked out | [overlay.md](./overlay.md) § One corpus holds the two implementations together |
| See which stored figures changed and why a rebuild is owed | [overlay.md](./overlay.md) § Corrections to figures already served |
| Add or change a chart on the statistics tab | [overlay.md](./overlay.md) § The charts, and what each answers |
| Add a chart, or reuse one with different data | [plan.md](./plan.md) § Chart primitives are data-agnostic |
| Know what happens to the price-history chart | [plan.md](./plan.md) § Price history moves onto the primitives |
| Understand why archiving a job must not rebuild the whole account | [plan.md](./plan.md) § Stage J |
| See why the stored snapshot array is being removed | [plan.md](./plan.md) § J1 |
| Know what the build history panel shows and where each figure comes from | [plan.md](./plan.md) § J1 |
| Decide what the build history panel compares an item's history against | [plan.md](./plan.md) § Open — what the panel compares history against |
| Apply a job's statistics as a delta instead of a rebuild | [plan.md](./plan.md) § J2 |
| See what the delta path landed, and what it still owes | [plan.md](./plan.md) § J2 — Statistics are applied as a delta |
| Know why a rebuilt row is stamped as already counted | [plan.md](./plan.md) § J2 — Statistics are applied as a delta |
| Find where the delta shape lives, and why it is not in either caller | [plan.md](./plan.md) § J2 |
| Change how often archived-job statistics are recalculated | [plan.md](./plan.md) § J3 |
| Understand why a long rebuild queue currently makes no progress | [plan.md](./plan.md) § J3 |
| Split statistics work across per-account tasks and priorities | [plan.md](./plan.md) § Three tiers of work |
| Add or rename a statistics task, and know what else must change | [plan.md](./plan.md) § The operator surface moves with the tasks |
| Scope statistics to something other than an account | [plan.md](./plan.md) § Owners, not accounts |
| Stop a delta being overwritten by a rebuild running beside it | [plan.md](./plan.md) § A delta must never race a rebuild |
| Know why an empty bucket is deleted on a count and not a total | [plan.md](./plan.md) § Subtracting to nothing |
| Find out what happens when a statistics write keeps failing | [plan.md](./plan.md) § The delta is a task, and its work list is the rows themselves |
| Detect and correct aggregates that disagree with their rows | [plan.md](./plan.md) § J4 |
| Compare stored figures without float noise reading as drift | [plan.md](./plan.md) § Comparing figures that are floats |
| Decide when an owner's turn to be reconciled comes round | [plan.md](./plan.md) § Scheduling |
| See what reconciliation landed, and what it shares with the rebuild | [plan.md](./plan.md) § J4 — Reconciliation, and how drift is corrected |
| Know why a bucket carries a row count, and why a rebuild once lost it | [plan.md](./plan.md) § The bucket's contributing-row count |
| Know why archive and statistics documents are no longer fanned out | [plan.md](./plan.md) § The archive and statistics change streams are removed |
| Tell the client its figures moved, or that a rebuild is outstanding | [plan.md](./plan.md) § J5 |
| Add a realtime message kind, or a handler for one | [plan.md](./plan.md) § Messages gain a family and a kind |
| See what the notification path landed, and who publishes one | [plan.md](./plan.md) § J5 — How the client learns the figures moved |
| Know why archiving still invalidates its own caches | [plan.md](./plan.md) § Departed from: the notification does not replace call-site invalidation |
| Find where a failed recalculation is recorded and read | [plan.md](./plan.md) § Telling the user when figures are known to be behind |
| Show a user that their figures are being rebuilt, or are stale | [plan.md](./plan.md) § Where the client shows it |
| Decide what a change invalidates in the SPA's caches | [plan.md](./plan.md) § One place decides what a change invalidates |
| Find out how a document says who owns it | [overlay.md](./overlay.md) § The owner block |
| Write a query scoped to an owner | [overlay.md](./overlay.md) § How code filters on it |
| Know why a filter on the wrong field fails silently | [overlay.md](./overlay.md) § How code filters on it |
| Choose between the two `_meta` upsert forms | [overlay.md](./overlay.md) § How `_meta` is written |
| Add or reshape an owner-scoped index | [overlay.md](./overlay.md) § The indexes |
| Understand why the owner block shipped as one cutover | [plan.md](./plan.md) § The owner block landed as one cutover |
| See what the owner block still owes | [plan.md](./plan.md) § What is not done |
| Run or extend the release migration | [plan.md](./plan.md) § Operational steps owed |
| Know what a dry run reports before the owner stamp has run | [overlay.md](./overlay.md) § The dry run tells an unstamped database from an idle one |
| Decide whether a deprecated collection still needs the owner | [plan.md](./plan.md) § What is not done |
| Retire an index on a collection that is also being renamed | [overlay.md](./overlay.md) § The indexes |
| See which index each job-document query wins on | [plan.md](./plan.md) § The indexes moved with the queries |
| Read the account id off a change stream log line | [overlay.md](./overlay.md) § What the publish log reports |
| Add a delivery branch, or change how a message is routed to clients | [overlay.md](./overlay.md) § How a change reaches the right clients |
| See what covers the routing key, on both sides | [overlay.md](./overlay.md) § How a change reaches the right clients |
| Check that one owner's documents cannot reach another | [overlay.md](./overlay.md) § How a change reaches the right clients |
| Change how recipients are chosen for a broadcast | [overlay.md](./overlay.md) § How a change reaches the right clients |
| Add a delivery path for a new owner kind | [overlay.md](./overlay.md) § How a change reaches the right clients |
| Write a query that groups on the owner rather than filtering on it | [overlay.md](./overlay.md) § One place names the owner block, and one names its leaves |
| Run the live-Mongo tests | [overlay.md](./overlay.md) § Live Mongo tests — draft for `testing/harness.md` |
| Connect a test to the stack's Mongo | [overlay.md](./overlay.md) § Live Mongo tests — draft for `testing/harness.md` |
| See how far live coverage reaches from Mongo to the browser | [overlay.md](./overlay.md) § How a change reaches the right clients |
| Know why a routing field never reaches the browser | [overlay.md](./overlay.md) § How a change reaches the right clients |
| Rename or retire an index a query hints | [overlay.md](./overlay.md) § The indexes |
| Write `_meta` from a writer that replaces the whole document | [overlay.md](./overlay.md) § How `_meta` is written |
| Add a release step that filters on the owner | [overlay.md](./overlay.md) § The dry run tells an unstamped database from an idle one |
| Know why two release steps stop the run when they fail | [plan.md](./plan.md) § Operational steps owed |
