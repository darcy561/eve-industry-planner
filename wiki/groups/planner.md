# Group — Planner tab

The Planner tab is the default view when you open a [group](../groups). It is the group’s own planner—separate from the main [Job Planner](../../job%20planner) board. See [Group planner and the main Job Planner](../groups#group-planner-and-the-main-job-planner) for how the two relate.

It shows every job in the group on the same workflow stages as the main board—Planning, Purchasing, Building, and Complete.

The Selling stage is not shown inside a group; when output jobs are ready to sell, they move to the main Job Planner—see [Using a group — Finishing](../groups#finishing--sell-archive-or-delete).

## Layout

Jobs are grouped in stage accordions (one per workflow step). Each accordion can expand or collapse independently.

Within each stage, job cards use your global [layout settings](../../settings/layout):

- Classic view — Larger cards with more detail per job.
- Compact view — Denser cards when compact view is enabled in settings.

Each stage header includes Select all for jobs in that stage only (same pattern as the main planner).

## What you can do

- Drag and drop job cards between stages to move the whole job forward or backward in the workflow.
- Multi-select jobs with checkboxes on the cards. Many [left-menu actions](../groups#left-menu-actions) use the selection, or fall back to all jobs in the group when nothing is selected.
- Edit a job from its card to open [Edit Job](../../edit%20job). When you close the editor, you return to this group and the Planner tab. Closing after quantity or link changes runs the [material tree shaker](../../material%20tree%20shaker) when automatic recalculation is enabled in [Blueprint Settings](../../settings/blueprint).

## When to use it

Use the Planner tab for day-to-day work inside a project: moving planner jobs through planning, purchasing, building, and completion without leaving the group context.

## Related pages

- [Groups overview](../groups)
- [Job tree](job%20tree) — Dependency graph of the same jobs
- [Breakdown](breakdown) — Aggregated costs
- [Scheduler](scheduler) — Timeline planning
- [Job Planner](../../job%20planner) — Main board (includes Selling stage)
- [Material tree shaker](../../material%20tree%20shaker) — Tree shaking after group build actions
