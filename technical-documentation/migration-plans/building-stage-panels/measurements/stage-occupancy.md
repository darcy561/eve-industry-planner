# How many jobs sit on each stage

Collected while designing the Building stage, to know how much of a planner's work this stage is
actually carrying. It is the evidence behind [plan.md](../plan.md) § Starting position.

**These are live figures, from a snapshot.** They come from `eve_industry_planner_snapshot` — a dump of
the live database restored into the local dev mongo, not the dev database itself. So they are real
scale at an unstated moment: the shape of the data rather than today's totals.

## Query

```js
// mongosh, against eve_industry_planner_snapshot
const dist = {};
db.user_job_documents.find({}, { jobStatus: 1 }).forEach((d) => {
  dist[d.jobStatus] = (dist[d.jobStatus] || 0) + 1;
});
```

## Result — 31,953 job documents

| `jobStatus` | Stage | Jobs | Share |
|-------------|-------|------|-------|
| 0 | Planning | 24,744 | 77.4% |
| 1 | Purchasing | 1,816 | 5.7% |
| 2 | **Building** | **1,605** | **5.0%** |
| 3 | Complete | 3,380 | 10.6% |
| 4 | For Sale | 408 | 1.3% |

## What it says

Building holds about one job in twenty at any moment, and **more jobs have passed through it than are
sitting on it** — Complete and For Sale together are 3,788 against Building's 1,605. That is the shape
of a stage a job crosses rather than dwells on, which fits what it is for: a build is installed, and
then a player comes back when the runs are due.

It also means the stage is read in short visits with a specific question, rather than worked at length
— which is the argument for it stating what is ready and when the last run lands, rather than
presenting figures to be assembled.

## What could not be measured

**Nothing about linked ESI runs.** No document in this snapshot carries an `esi` subtree at all — not
on live jobs and not on archived ones — so every figure that would describe real linking behaviour is
unavailable here:

- how many jobs have any run linked
- how many runs a job typically carries
- how often runs are corporation rather than personal
- how far apart runs on one job are installed, which is what the grouping rule in
  [plan.md](../plan.md) § Stage B is built against

The zero is an artefact of the snapshot, **not evidence that the feature is unused**, and it must not
be quoted as such. The run counts, timings and characters in the design reference are illustrative for
that reason, and are labelled so there.

Anyone with a snapshot that retains `esi.industryJobs` should re-run the same census before Stage B
fixes its grouping keys — the keys are chosen from what the two sides structurally carry rather than
from observed data, which is sound, but observed spreads would tell us whether the due-time range on a
row is usually minutes or usually hours.
