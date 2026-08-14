# Document lock

Eve Industry Planner stores your [jobs](job%20planner.md) and [groups](groups.md) as documents that sync in the background. A document lock decides which browser session is allowed to edit a given job or group at a time, so two people (or two tabs) cannot overwrite each other’s work without a clear, coordinated hand-off.

## What you see in the app

- Normal editing — When the lock is yours, the page works as usual. The lock is kept alive and renewed while you stay on a screen that needs it, so your edits stay coherent with the server.
- Read-only — If another session already holds the edit lock for that document, your view is read-only. You can still look at the data; you cannot make changes. The app shows a clear message in the header (or the same document-lock area used elsewhere) explaining that the job (or [group](groups.md)) is being edited elsewhere. The exact text depends on whether the locked thing is a Job or a Group document.
- Asking to take over — In situations where the product offers a hand-off, you may get snackbars about another tab requesting access, a queue, or a timed offer. Follow the on-screen prompts; the point is to avoid two editors at once without a deliberate transfer.

## Where the lock shows up

On [Edit Job](edit%20job.md), two things can be locked separately: the planner job you opened, and, when that job is in a group, the group itself. The header shows the job lock first when both apply, but remember that group read-only still blocks group-level actions even while you edit the job.

Other screens that work with the same system will surface similar behaviour: if you are read-only, treat the page as view and navigate, not change and save until the lock is yours or you are otherwise allowed to edit.

## Practical tips

- If you are read-only, finish looking or close the view; the holder of the lock (another tab, device, or person) is the one who should save, or you wait until the lock is released.
- A second tab of your own can also trigger a lock conflict—use the same hand-off and messaging flow rather than “fighting” the same job from two places.

## Related pages

- [Edit Job](edit%20job.md) — Main place job (and group) document locks show up.
- [Job Planner](job%20planner.md) — How jobs and groups are organised.
- [Groups](groups.md) — Why the group document exists alongside a job when you work in a group.
