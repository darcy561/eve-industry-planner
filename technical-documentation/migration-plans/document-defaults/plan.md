# Document defaults — plan

**Status:** Phase 1 (docs) complete; no track work started. The two defects that made this visible are
already fixed as ordinary work and are **not** tracks here — see § Prerequisite.
**Code in scope:** [`services/shared/models/`](../../../services/shared/models/),
[`services/shared/documentschema/`](../../../services/shared/documentschema/),
[`services/shared/mongo/`](../../../services/shared/mongo/),
[`services/core/commands/`](../../../services/core/commands/),
[`frontend/src/Classes/`](../../../frontend/src/Classes/)
**Live SoT (until promote):** [backend/](../../backend/contents.md), [frontend/](../../frontend/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

**`go fix` in scope at Phase 1:** one file — `core/commands/live_rewrite_owner_scoped_ids_test.go`
(a `slices.Contains` opportunity). It is not in a file any track below edits; land it with whichever
slice next opens that package rather than on its own.

## Why this project exists

The planner decides what a job document contains. That is where the project started, so the SPA's
`Job` constructor is the only place a job's defaults are written down — `jobStatus || 0`,
`parentJobs || []`, `displayOnPlanner` derived from group membership, and the legacy aliases
`metaGroup → metaLevel` and `marketLocation → localMarketDisplay`. Those are defaulting and schema
upgrade steps, in JavaScript, in the browser.

The server has no counterpart for a job or a group, and four server-side paths write job documents
without going near the SPA: the archive restore, the `schemamaint` drain, the jobidentity encode, and
the `backfill_archived_at` command. Each decodes a stored document into `models.Job` and writes it
back, so an absent field becomes a Go zero on disk with nobody deciding that it should.

## Prerequisite (landed before this project)

Two defects found by the model parity sweep are fixed already, as ordinary work:

| Piece | Now |
|-------|-----|
| `ExtraCost` dropped `categoryLabel` on both decode paths | Read on both; a round-trip test fails if any field is dropped |
| `JobLayout` had no `materialPriceOverrides`, so the planner's per-material market choice was discarded on every save | Modelled and assigned in both decoders |
| `""` versus `"0"` for an unfiled extra, decided in three places and by the model in none | `models.ExtrasCategoryOrUnassigned` is the only place it is decided |

They are recorded here because this project inherits their consequences, not because it owns them.

## What the documents actually hold

Measured against a live snapshot imported into the local Mongo — 63,177 documents across 11
collections. Re-measure before relying on a row; the sweep that produced it is
[testing/harness.md](../../testing/harness.md) § Model parity.

| Question | Answer |
|----------|--------|
| Do the models decode the corpus? | Every one of 52,004 documents in the seven modelled collections, with no failures |
| Does a decode/encode round trip preserve values? | Yes — no value changed |
| Is the corpus ragged, so defaults are urgently needed? | **No.** Every job document carries essentially every model field, because the SPA always sends a complete document. The fields absent from some documents are all `omitempty`-protected |
| Then what is the exposure? | Fields added from here on. `filedCostMonth`, `filedSalesMonth`, `protected`, `categoryLabel` and `character_ref` are absent from 100% of live documents today, and `Group.archivedJobIDs` is `[]string` with no `omitempty`, so the first write to any group materialises a BSON `null` |

That is the shape of the problem: not a repair of what is stored, but the rule for field number 184.

The sweep found two things this project does not fix, listed under § Non-goals: stale copies of derived
totals sitting in every job document, and the dead `apiJobs` / `apiOrders` / `apiTransactions` fields
in 100% of them. The totals follow [archived-jobs-stats](../archived-jobs-stats/contents.md), which
rebuilds them; the dead fields have no owner today.

## Track A — The server decides a document's shape

`Upgrader.UserAccountDocument`, `.ApplicationSettings` and `.PlannerSettings` run on every read.
`.Job` and `.Group` do not: [`get_jobs.go`](../../../services/shared/mongo/get_jobs.go) has no
normalisation at all, and the only thing that ever calls `Upgrader.Job` is the offline `schemamaint`
drain, which visits a document once and never again.

So the pattern this project wants already exists in the codebase, correctly implemented, on three
document types. The two the planner writes are the ones that skip it.

### Phase A1 — Call the upgrader on the job and group read paths

Match [`get_account.go`](../../../services/shared/mongo/get_account.go), which calls it on every read.
Mechanical, and it makes every reader see one shape.

Done when: a job and a group are normalised on read the way an account is, with a test that a legacy
document reaches its caller upgraded.

### Phase A2 — Move the SPA's defaults and aliases into the upgrader

`Upgrader.Job` currently clamps `SchemaVersion` and fills nothing. The defaults and the legacy field
aliases in the SPA's `Job` constructor belong in it, as a `v1 → v2` step with a `JobSchemaCurrent`
bump — which is what [`document_schema.go`](../../../services/shared/models/document_schema.go)
already instructs. The SPA keeps only what is genuinely a UI default.

Done when: a job's defaults are stated once, in Go, and the SPA constructor no longer decides any of
them.

### Phase A3 — Decide what an unset field means

Only after A2. A field the model holds and the document lacks currently decodes to a Go zero, and a
server-side write-back materialises it. Whether that is right per field is a decision, not a default —
and it is the same question as `omitempty` versus `omitzero`, whose tag half
[backend/shared/jsoncodec.md](../../backend/shared/jsoncodec.md) § The `json` / `bson` tag pair owns.

Done when: each unprotected field either carries a deliberate default or is tagged so an absent value
stays absent, and `Group.archivedJobIDs` is one of them.

## Track B — The extras category id space

An extras category id is `"0"` … `"5"` for the six shipped defaults and a uuid for anything a user
adds. `"0"` is a real category — `{ID: "0", Label: "Unassigned"}` — not a sentinel.

Measured across 4,822 live accounts:

| Fact | Count |
|------|-------|
| Accounts holding the shipped six with the exact shipped labels, untouched | 4,816 |
| Accounts that added a custom category | 4 |
| Accounts that deleted a default | 2 |
| Extras rows across both job collections | 1,379 |
| Of those, rows filed under `""` rather than a category | 865 |

The defaults stay stored per account. They must be, because a user may remove one and that removal has
to be recorded somewhere; and storing only the divergence would buy a free default-label change, an
event that has never happened, at the price of a merge rule kept in step across Go and the SPA.

### Phase B1 — Slug ids

`"0"` … `"5"` become `unassigned`, `hauling-service`, `jump-freight-service`, `blueprint-copies`,
`loyal-point-costs`, `other`. Custom uuids are untouched. A stored row then says what it means without
a settings lookup, and the degraded chart fallback reads `Category blueprint-copies` rather than
`Category 3`.

Slugs cannot collide with digits or `""`, so the conversion is idempotent and the release step is
safely re-runnable.

Done when: `models.ExtrasCategoryUnassigned` is the slug, the SPA's `categoryOf` and
`permanentExtrasCategories` agree, and the conversion has run over `application_settings` and both job
collections.

### Phase B2 — Converge the stored rows

One `JobSchemaCurrent` bump carries B1 and the `""` rows the prerequisite left behind, so the
`schemamaint` drain rewrites each document once rather than twice.

**Order:** the conversion runs **before** the statistics rebuild, or the derived rows keep the old ids
until the next one.

Done when: the parity sweep reports no value change on `build.costs.extrasCosts[].category`.

## Non-goals (this project)

- Changing how a document is written. Whole-document `$set` and what replaces it belong to
  [document-write-granularity](../document-write-granularity/plan.md).
- Moving the shipped default categories out of the account document — see Track B for why.
- Retiring `categoryLabel`. A custom category still needs its name copied onto the row, and a
  statistics row cannot reach an account's settings.
- Cleaning the stale derived totals and the dead `apiJobs` / `apiOrders` / `apiTransactions` fields out
  of stored documents. Both are real and both persist because the upsert only `$set`s what the struct
  marshals, so an unmodelled key is never touched. The totals are regenerated by the statistics
  rebuild; the dead fields are owned by nobody and would need a release step of their own.

## Open decisions

| # | Decision | Needed by |
|---|----------|-----------|
| 1 | Does `Upgrader.Job` on the read path cost enough to matter on the hot job-planner read, or does it need a version gate to skip a document already current? | A1 |
| 2 | Which of the SPA constructor's derivations are defaults the server should own, and which are UI state that should stay in the browser? `displayOnPlanner` derives from group membership and readiness, which is the awkward case. | A2 |
| 3 | Does `other` keep its place in `permanentExtrasCategories`? Only `unassigned` is structural now that history carries its own names. | B1 |

## Done-when (project)

Both tracks closed or explicitly declined, the behaviour recorded in [overlay.md](./overlay.md), and
go-ahead given to promote into live SoT.
