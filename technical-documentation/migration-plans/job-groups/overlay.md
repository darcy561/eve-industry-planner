# Job groups — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this
file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [frontend/group/contents.md](../../frontend/group/contents.md) and
[backend/](../../backend/contents.md).

## Stage A — Membership becomes the job's, and the damage is repaired

*Nothing landed yet — the project is blocked behind the document lock work, see
[plan.md](./plan.md) § What this project waits on.*

Sections to fill: what a caller asks to learn a group's members, on each side; which call sites read
the store and which ask the server, and how that was decided; what the backfill found and how many
orphans it repaired; the index the member query runs on and what `explain` reported.

## Stage B — The group document stops carrying derived data

*Nothing landed yet.*

Sections to fill: the document's fields and who writes each; how `outputTypeIDs` is set and when it is
refreshed; where per-job completion lives and what reads it; the `1 → 2` upgrade step and its ordering
constraint against the backfill; what `PUT` accepts and what it does with anything else; what is left
of the `Group` class and how a rename reaches the server without the persist queue.

## Stage C — Creation is one request

*Nothing landed yet.*

Sections to fill: the creation request and what the server writes from it; where the parent/child
pruning runs; what a reader sees while it is in flight now that there is no page to host it; what
happens to the group and the jobs when it fails.
