# Measurements — what the extras and invention rows actually hold

Collected 2026-09-19 against `eve_industry_planner_snapshot`, a live snapshot restored into the local dev
Mongo, where `user_job_documents` is today's `job_documents` and `archivedJobs` is today's
`archived_jobs`. [plan.md](../plan.md) § Stage 2c says counts taken in dev say nothing about how many
exist in production; these are production's, and they should be re-taken against live before a step runs.

Every row of both collections was typed with `$type`, so a value's *type* is what is counted rather than
whether it reads as something.

| Field | `job_documents` | `archived_jobs` |
|---|---|---|
| `extrasCosts` rows | 319 | 1,070 |
| …`id` is a number | **0** | **0** |
| …`id` is absent | 0 | 0 |
| …`category` is absent or empty | 87 | 778 |
| …`category` is a number | 0 | 0 |
| …`categoryLabel` is absent | 319 | 1,070 |
| …`extraText` is a number | 0 | 0 |
| …`extraValue` is a string | 0 | 0 |
| …`deletedAt` is a number | 0 | 0 |
| `inventionEntries` rows | 19 | 226 |
| …`id` is a number | **19** | **226** |
| …`id` is absent | 0 | 0 |

## What that says

**The extras half of Stage 2c has no work to do.** Not one of 1,389 extras rows carries a numeric id, and
none is missing one. The clock-minted ids that stage was written against are gone from live data — every
row has been saved at least once since the generator moved to `crypto.randomUUID()`.

**The invention half is where all of it is.** Every invention entry in the corpus carries a numeric id —
245 rows, 100% of them. That is the population the step exists for, and it is small.

**The other coercions have nothing to absorb.** No numeric `category`, no numeric `extraText`, no string
`extraValue`, no epoch-milliseconds `deletedAt`. The read-side tolerances for those shapes are absorbing
a case the live corpus does not contain.

**865 extras rows carry no category at all** — 87 live and 778 archived, matching what
[document-defaults](../../document-defaults/plan.md) § Track B measured independently. They are filed
under nothing rather than under a category that means nothing, which is the distinction that decides what
the conversion writes.

**`categoryLabel` is absent from every row**, which is the expected shape rather than a gap: it is a field
added after these documents were last written, and the upsert only `$set`s what the struct marshals.
