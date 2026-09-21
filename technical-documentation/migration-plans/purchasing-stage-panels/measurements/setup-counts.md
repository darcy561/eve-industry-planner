# How many setups a job actually carries

Collected to settle how the Job costs panel draws its setup list: whether one shape serves every job,
and what the worst case really is. It is the evidence behind [plan.md](../plan.md) § Stage I,
§ Several setups.

**These are live figures, from a snapshot.** They come from `eve_industry_planner_snapshot` — a dump of
the live database restored into the local dev mongo, not the dev database itself. So they are real
scale at an unstated moment: the shape of the data rather than today's totals.

## Query

```js
// mongosh, against eve_industry_planner_snapshot
const dist = {};
db.user_job_documents.find({}, { "build.setup": 1 }).forEach((d) => {
  const c = Object.keys((d.build && d.build.setup) || {}).length;
  dist[c] = (dist[c] || 0) + 1;
});
```

The archived pass is the same over `archivedJobs`, limited to the first 5,000 documents.

## Active jobs — 31,953 documents

| Setups | Jobs | Share |
|--------|------|-------|
| 1 | 29,230 | 91.5% |
| 2 | 2,704 | 8.5% |
| 3 | 15 | 0.05% |
| 4 | 3 | — |
| 5 | 1 | — |

The single five-setup job is a **Rattlesnake**: five setups that are identical in every field — ME 0,
TE 0, one run × one job, NPC Station, Jita, 52,187,827 ISK install each. That is not redundancy; it is
a player occupying five industry slots in parallel, which is why collapsing identical setups into one
row would hide the thing the player did.

## Archived jobs — first 5,000 documents

| Setups | Jobs |
|--------|------|
| 1 | 4,812 |
| 2 | 179 |
| 3 | 5 |
| 4 | 2 |
| 18 | 1 |
| 30 | 1 |

## What the numbers decided

- **One and two setups are the design.** They cover 99.9% of active jobs, and they get cards.
- **Three or more must not break**, and at that point a reader is comparing setups rather than looking
  at one, so the list becomes a table.
- **Thirty must still render.** The archive proves the tail is real, so the table scrolls vertically
  past about six rows rather than growing without limit.

The current `JobSetupInfoFrame` turns on `overflowX: auto` above five setups, which pushes the
many-setup case off the side of the screen one card at a time — the opposite of what the distribution
asks for.
