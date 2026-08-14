# Edit Job

The Edit Job page is where you open a single planner job from the [Job Planner](job%20planner.md) and work it through the same five lifecycle stages. Each stage has its own panels and options so you can configure the blueprint, buy materials, follow the build, close out the job, and then handle sales, in one place. Unsaved work is protected by a leave confirmation if you try to go away with changes. When the document is open in two places, [document lock](document%20lock.md) rules apply: you may be read-only until the lock is yours. Parent and child links (up and down the production chain between planner jobs) are described in [parent and child jobs](parent%20and%20child%20jobs.md).

## Overview

The planner job’s *stage* matches the [Job Planner](job%20planner.md) stage accordion it appears under. The five steps below follow the same order as the board; you can rename the stage labels under [Layout settings](settings/layout). Help text on each step follows Enable Help Cards in settings—the same switch that controls the planner welcome panel.

- [Planning](edit%20job/planning.md) — Blueprint, setups, materials, prices, skills, and production planning before you buy.
- [Purchasing](edit%20job/purchasing.md) — Record purchases, invention and material costs, and child-job hand-offs.
- [Building](edit%20job/building.md) — Link and track ESI industry jobs while the planner job is in the build stage.
- [Complete](edit%20job/complete.md) — Finish the run, add extras, and (for [Group](groups.md) jobs) mark ready to sell when the group is aligned.
- [Selling](edit%20job/selling.md) — Market orders, transactions, and sales-side costs and stats.

A planner job that is in a group and not yet marked ready to sell cannot move into Selling until you set that flag from Complete—so the group is not split across market prep by mistake. Standalone planner jobs are not blocked by that rule. See [Complete](edit%20job/complete.md) for when each button appears.

### The header

A bar at the top shows the product icon (on wider screens), the item name as the title, and a few actions:

- Item tree — Opens a diagram of how this planner job connects to others in the chain (same idea as the group [Job tree](groups/job%20tree)). If you opened Edit Job from a group, returning later takes you back to that group.
- Delete / Close / Save — Remove the planner job, leave without saving, or save your changes. Close warns you if anything is unsaved. Saving or closing after quantity or parent/child changes runs the [material tree shaker](material%20tree%20shaker) when [Automatically Recalculate Jobs](settings/blueprint#automatically-recalculate-jobs) is enabled.

### Parent jobs

Under the header, Parent jobs is how you look up the chain: it lists any other run whose build requires what this run produces—not the jobs that *supply* you, but the ones *above* you in the *finished-product* direction. The rows show as chips with type icons; you can add, open (search params are carried when applicable), or remove links. Child links, material prices rolling *up* the chain, and down-chain *estimation* are covered in [parent and child jobs](parent%20and%20child%20jobs.md) and the stage wikis.

### The stepper and stage navigation

The vertical stepper is the primary navigation. Step names and order follow your [Job Planner](job%20planner.md) / settings stage list. You can click a step to jump to that stage, except you cannot "jump" to the step you are already on, and you cannot jump to Selling while the group / ready to sell lock is active (see Overview).

Between the stage panels, Move to previous step and Move to next step use the up and down arrow buttons. The same move actions appear again as floating circular controls when the inline row scrolls off screen (e.g. long content), so you are not forced to scroll back to change stage. Moving here updates the job’s stage for the board the next time you return to the planner.

### What carries across the stages

- ESI and linking — Where a stage has industry, market, or transaction panels, the app can pull the usual EVE data. [Parent and child](parent%20and%20child%20jobs.md) build links and material hand-offs are documented in the [Planning](edit%20job/planning.md) and [Purchasing](edit%20job/purchasing.md) subpages in more detail.
- Costs and profit — Earlier stages record spend; Selling ties in orders and transactions for outcome.

Global tools—[shopping list](dialogues/shopping%20list), price history, market data, assets—open from Edit Job when a panel needs them, the same as elsewhere in the app.

## Related pages

- [Document lock](document%20lock.md) — Read-only and multi-session editing.
- [Parent and child jobs](parent%20and%20child%20jobs.md) — BOM links between planner jobs.
- [Material tree shaker](material%20tree%20shaker) — Tree shaking when closing Edit Job or building group chains
- [Job Planner](job%20planner.md) — Workflow board and bulk actions for all planner jobs.
- [Groups](groups.md) — How jobs are grouped on the planner.
- [Blueprint library](blueprint%20library.md) — Managing blueprints outside a single job.
