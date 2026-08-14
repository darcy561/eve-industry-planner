# Job Planner

The Job Planner is your account-wide workflow board for manufacturing and reaction builds (invention support is planned). Planner data syncs to your account like your groups and settings. Open it from the main navigation at `/jobplanner`.

## What the Job Planner is

If you build many things in EVE—ships, modules, reactions—you need a place to track what you are building, how far along each run is, and what it cost before you sell. The Job Planner is that workspace. It does not cover planetary interaction or other activity types today.

Think of it as a production board:

- The board is split into five workflow stages (Planning → Selling), each shown as a stacked accordion—not side-by-side columns.
- Each job card is one planner job: one manufacturing or reaction build you are tracking in the app (one output item and target quantity), from first blueprint check through to sale. This is not the same as a single in-game industry job on a character’s industry tab—you may link many ESI industry jobs to one planner job while building.
- You move cards between stages as work progresses—by dragging or using the left menu—so you always see at a glance what still needs planning, buying, building, or selling.

The board is not EVE’s industry window itself. It is your planner: you record plans, purchases, linked ESI industry jobs, and sell data here so costs and profit stay accurate. Open Edit on a card (or View when read-only) for the full detail—see [Edit Job](edit%20job).

Getting started: left menu → Add New Job, search for an item, queue it, and press Add. Your first card appears in Planning. Work the job in Edit, then move the card forward when you are ready for the next stage.

## Job cards

A job card is a summary of one planner job on the board. It is always shown in the stage accordion that matches the job’s current workflow step—so a card under Purchasing is a planner job where you are still buying materials, and a card under Building is one where in-game industry is underway.

### On every card

| Part | Meaning |
|------|---------|
| Checkbox | Select the card for bulk actions (shopping list, move, delete, …). |
| Item name | The product this planner job builds. |
| Type icon | EVE type icon for that item. |
| Edit / View | Opens [Edit Job](edit%20job). View appears when the job is read-only ([document lock](document%20lock)). |
| Delete (trash) | Removes this planner job from the board. |
| Coloured stripe | Job type—manufacturing or reaction (same colour coding used elsewhere in the app). |

Classic cards show more detail in the body; compact cards show the name and stripe, with an info hover for the same stage summary—controlled in [Layout settings](settings/layout).

### What changes by stage

The middle of the card highlights the most useful progress hint for that step:

| Stage | Card shows (typical) |
|-------|----------------------|
| Planning | Target quantity and setup count (how many blueprint runs you configured). |
| Purchasing | Awaiting materials (remaining vs total) or Ready to build when everything is bought. |
| Building | ESI industry jobs linked vs total setup runs needed for the planner job. |
| Complete | Items built (target quantity for the run). |
| Selling | Linked market orders and transactions counts. |

Moving a card to another stage updates the planner job’s workflow step on the board. Most real work (blueprints, purchases, ESI links, orders) happens inside Edit Job—the card is your at-a-glance status, not the full editor.

Planner jobs can link to other planner jobs as [parent and child](parent%20and%20child%20jobs) (ingredients and assemblies). Those links are managed in Edit Job; each card stays one row on the board for that output item.

## What else appears on the board

| Card type | What it represents |
|-----------|-------------------|
| Job card | One planner job (manufacturing or reaction)—see [Job cards](#job-cards) above. |
| Group card | A [group](groups) project. Click to open the group’s own planner; member jobs stay off this board until an output is Ready For Sale or you archive the project. |

Standalone planner jobs and group cards appear in the same stage accordions. Jobs inside an active group are managed on the group planner instead—see [Group planner and the main Job Planner](groups#group-planner-and-the-main-job-planner).

## Workflow stages

The board has five stages. Default names map to the production lifecycle; you can rename each stage under [Layout settings](settings/layout) (Job workflow stage labels).

| Stage | Typical use |
|-------|-------------|
| Planning | Blueprints, setups, profitability, and material planning before you commit. |
| Purchasing | Buy materials and record what you paid. |
| Building | Materials are in place; link and track ESI industry jobs against the planner job. |
| Complete | Wrap up costs after the build finishes. |
| Selling | Market orders, transactions, and profit—main-board jobs and group outputs marked Ready For Sale. |

Each stage is an accordion you can expand or collapse. Stage open/closed state is remembered per account in the browser.

Within a stage, cards use your global [layout settings](settings/layout): classic (more detail) or compact (denser). Each stage header has Select all for jobs in that stage only.

## Working with cards

- Drag and drop — Move a job or group card to another stage to advance or step back the workflow (same effect as Move Forwards / Move Backwards in the left menu).
- Multi-select — Checkboxes on job and group cards. Many left-menu actions require at least one selected card.
- Edit — Opens [Edit Job](edit%20job) for a job card.
- Document lock — If another session holds the edit lock on a job or group, that card is read-only (no drag, no delete). See [Document lock](document%20lock).

## Page layout

Two collapsible side areas flank the stage accordions:

| Panel | Role |
|-------|------|
| Left menu | Bulk actions (add jobs, groups, shopping list, move, merge, delete, …). |
| Right drawer | Welcome tutorial (default) or Add New Jobs when opened from the left menu. |

On mobile, the right drawer is hidden. Add New Job opens a search bar at the top of the board instead (search, queue chips, Add / Clear / Add To Group—no ship-fitting import on mobile).

## Left menu

Most actions need one or more selected job or group cards; otherwise the app prompts you to select first.

| Action | Scope | What it does |
|--------|-------|--------------|
| Add New Job | — | Opens the Add New Jobs panel in the right drawer (or mobile search bar). |
| New Group | Selection optional | With jobs selected — Creates a group containing those jobs and opens the group page. With nothing selected — Creates an empty Untitled Group. See [Groups — Creating a group](groups#creating-a-group). |
| Group Templates | — | Logged-in users only. Creates a new group from a saved [group template](groups/group%20templates). |
| Shopping List | Selected jobs | Opens the [shopping list](dialogues/shopping%20list) for remaining materials. |
| Add Ingredient Jobs | Selected jobs | Builds new planner jobs for combined ingredient totals across the selection. |
| Add Item Costs | Selected jobs | Opens [item price entry](dialogues/price-entry) for bulk cost input. |
| Move Backwards | Selected jobs or groups | Moves each selection one stage back. |
| Move Forwards | Selected jobs or groups | Moves each selection one stage forward. |
| Merge Jobs | Selected jobs | Combines selected jobs into one job (groups not merged). |
| Select All | — | Selects every job on the board (not group cards; skips read-only locked jobs). |
| Clear Selection | — | Clears all checkboxes. |
| Delete | Selected jobs | Removes selected jobs from the planner (group cards are not deleted here). |

## Add New Jobs panel

Opened from Add New Job on desktop/tablet (right drawer). On mobile, the same flow uses the top search bar.

1. Search for buildable manufacturing or reaction items and add them to a queue (shown as chips under the search field).
2. Add — Creates the queued planner jobs on the board and clears the queue.
3. Clear — Empties the queue without creating jobs.
4. Add To Group — When enabled, creates a new group containing the queued jobs when you press Add (named from the output items). The switch is shown only on the Job Planner, not when adding from an open group page.

Ship fittings (desktop right panel only) — The lower half of the Add New Jobs panel can import a fit from the clipboard. Checked buildable lines are added to the queue; Fit Quantity multiplies every checked item’s quantity before add.

## Welcome panel

When the right drawer is not showing Add New Jobs, a short Job Planner introduction appears. Whether it opens by default follows Enable Help Cards in [Layout settings](settings/layout) (same family of control as tutorial/help behaviour elsewhere).

## Related pages

- [Edit Job](edit%20job) — Full workflow for a single job
- [Groups](groups) — Project containers and the group planner
- [Group templates](groups/group%20templates) — Save and recreate group layouts
- [Parent and child jobs](parent%20and%20child%20jobs) — Production links between jobs
- [Material tree shaker](material%20tree%20shaker) — Tree shaking across linked jobs (group build actions and Edit Job close)
- [Document lock](document%20lock) — Read-only when another session is editing
- [Settings](settings) — Layout, defaults, and stage names
- [Dialogues](dialogues) — Shopping list, price entry, and shared tools
