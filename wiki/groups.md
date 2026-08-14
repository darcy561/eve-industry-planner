# Groups

Groups are project containers on the [Job Planner](job%20planner). They keep a whole production chain—outputs, sub-assemblies, and ingredients—in one place instead of scattered cards on the main board.

Every job and every [parent/child](parent%20and%20child%20jobs) link is scoped to the group. New jobs and child jobs built from the group menus stay inside it and connect automatically. If a material already has a job in the group, the app links to that job and recalculates quantities (via the [material tree shaker](material%20tree%20shaker)) rather than duplicating the item.

Opening a group goes to `/group/{groupID}`. A group card also stays on the Job Planner until you archive the project or Close Group (the card remains; you are just leaving the group page).

## Group planner and the main Job Planner

Each group has its own planner on the group page—it is separate from the main [Job Planner](job%20planner) board, even though both use the same workflow stages and job cards.

| | Group planner (group page → [Planner](groups/planner) tab) | Main Job Planner |
|---|----------------------------------------------------------------|----------------------|
| What you see | Only jobs in that group | All standalone jobs, group cards, and output jobs sent to sell |
| Where | `/group/{groupID}` | `/jobplanner` |
| Stages shown | Planning → Complete | Planning → Complete → Selling |
| Typical use | Build the chain, purchase materials, link ESI industry jobs, wrap up costs | Overview of everything; Selling and market tracking |

Member jobs stay off the main board while you work inside the group. That keeps the main planner uncluttered while a large project is in progress. The group card on the main Job Planner still represents the project and can be opened to return to the group planner.

When an output job is marked Ready For Sale, that job alone appears on the main Job Planner in Selling; the rest of the chain continues on the group planner until you Archive Group Jobs or remove individual runs.

Same drag-and-drop stages, classic/compact cards, and [Edit Job](edit%20job) flows apply in both places—the difference is scope: the group planner is a dedicated workspace for one project; the main Job Planner is your account-wide board.

## Creating a group

### New Group (Job Planner)

Left menu → New Group:

- With jobs selected — Creates a group containing those jobs, opens the group page, and sets the group name from the selected output jobs (their item names joined, up to 75 characters). Parent/child links between selected jobs are kept; links to jobs not in the selection are removed so the group is self-contained.
- With nothing selected — Creates an empty group named Untitled Group. Add jobs from Add New Jobs on the group page.

### Add To Group (Add New Jobs panel)

On the [Job Planner](job%20planner), open Add New Jobs and enable Add To Group before Add:

- Queued items are built inside a new group in the same step, named from those output items.

The switch appears only when you are not already on a group page. From an open group, Add puts new jobs into the current group automatically.

### Group templates

You can also create or extend a group from a saved [group template](groups/group%20templates)—a quick way to recreate a familiar layout and setups.

## Using a group

### Output jobs — what you are building

An output job has no parent jobs in the group. It is the finished product the project is for—a hull, module batch, reaction output, and so on. Everything else in the group exists to feed those outputs.

Output jobs drive the project name, the Output drawer on the right, and per-product totals on the [Breakdown](groups/breakdown) tab. A group can have more than one output job; each has its own chain underneath.

### Build the chain and pass costs upward

This is the main workflow inside a group:

1. Add output job(s) — The products you want at the end (via Add New Jobs, New Group, or a template).
2. Build Child Jobs or Build Full Tree (left menu) — Add ingredient and intermediate runs; links are created inside the group. Existing jobs for the same material are reused and quantities updated. Both actions run the [material tree shaker](material%20tree%20shaker) afterward so run quantities match parent demand across the chain.
3. Work the chain — Move jobs through Planning → Purchasing → Building → Complete on the [Planner](groups/planner) tab, or open [Edit Job](edit%20job) from any card. Use shopping lists and price entry for the whole group or a selection.
4. Send Item Costs — When lower runs are finished, pass build costs up to parent jobs and mark those children complete in the group. Repeat until costs are rolled up to your output jobs.

Use the [Job tree](groups/job%20tree) tab to see the chain visually and [Breakdown](groups/breakdown) to check totals per output.

The group [Planner](groups/planner) tab covers Planning through Complete only. Selling is handled on the main Job Planner (see below).

### Finishing — sell, archive, or delete

When ingredient and intermediate jobs are done and costs sit on the output jobs, you can wrap up the project:

- Ready For Sale (optional) — On an output job in [Edit Job](edit%20job) at Complete, use Ready For Sale to move that job to Selling on the main [Job Planner](job%20planner) and track market sales there. Child jobs can still be in the group until you archive. Use this when you want the normal Selling workflow (orders, transactions, profit) for that product.
- Archive Group Jobs — When output jobs are finished (ready to sell or simply done), archive the project: supporting runs are archived, the group is removed, and you return to the Job Planner. Output jobs already marked Ready For Sale stay on the board in Selling; the rest of the chain is archived with the group.
- Delete — Remove selected jobs from the planner if you need to drop individual runs before archiving (selection required).

You do not need to mark every output Ready For Sale before archiving—use Archive Group Jobs when the build is complete and you want to clear the group, whether or not those outputs go to market.

### Open, close, and the group page

Open — Click a group card on the [Job Planner](job%20planner).

Close Group (left menu) — Saves, releases the [document lock](document%20lock), and returns to the Job Planner without archiving. The group card remains.

While the group page is open, the app holds a group document lock. Another session editing the same group puts you in read-only mode. See [Document lock](document%20lock).

Layout:

- Group name (top) — Editable when you hold the edit lock.
- Tab bar (for logged-in users) — Switches the main view; the active tab is stored in the URL.
- Left menu — Batch actions ([table below](#left-menu-actions)).
- Right drawer (desktop) — Output cards by default, or Add New Jobs when opened from the menu.

## Group page views

Each tab works on the same set of group jobs; they differ in presentation:

| View | Page |
|------|------|
| Planner | [Planner tab](groups/planner) — Stage accordions (Planning → Complete) |
| Job tree | [Job tree tab](groups/job%20tree) — Parent/child dependency graph |
| Breakdown | [Breakdown tab](groups/breakdown) — Group and per-output costs |
| Scheduler | [Scheduler tab](groups/scheduler) — Timeline across characters and slots |
| Templates | [Group templates](groups/group%20templates) — Save and reapply layouts |

## Left menu actions

| Action | Scope | What it does |
|--------|-------|----------------|
| Close Group | Whole group | Save, release lock, return to Job Planner |
| Add New Jobs | — | Open add-jobs panel |
| Save as template | Whole group | Save layout/setups ([details](groups/group%20templates)) |
| Apply template… | — | Add jobs from a template to this group |
| Shopping List | Selected if any, else all | [Materials dialog](dialogues/shopping%20list) |
| Add Item Costs | Selected if any, else all | [Price entry](dialogues/price-entry) |
| Build Child Jobs | Selected if any, else all | Next ingredient tier; then runs the [material tree shaker](material%20tree%20shaker) |
| Build Full Tree | Selected if any, else all | Full material tree from chosen jobs downward; then runs the [material tree shaker](material%20tree%20shaker) |
| Move Backwards / Forwards | Selection required | Move selected jobs one stage |
| Send Item Costs | Selection required | Pass costs to parents; mark selected jobs complete |
| Select All | — | Select every job in the group |
| Clear Selection | — | Clear checkboxes |
| Delete | Selection required | Remove selected jobs from the planner |
| Archive Group Jobs | Whole group | Archive supporting runs; remove group; return to planner |

Scope: Selected if any, else all uses checked jobs when at least one is selected; otherwise every job in the group. Selection required shows a prompt if nothing is selected.

When read-only, mutating actions are disabled. Close Group, Shopping List, Select All, and Clear Selection still work.

The Output drawer lists one card per output job (quantity, build cost from children, highlight-in-tree, open [Edit Job](edit%20job)).

## Related pages

- [Job Planner](job%20planner) — Main board, New Group, and Selling stage
- [Parent and child jobs](parent%20and%20child%20jobs) — How production links work inside a group
- [Material tree shaker](material%20tree%20shaker) — How build actions align quantities across the chain
- [Edit Job](edit%20job) — Configure jobs and Ready For Sale
- [Document lock](document%20lock) — Edit vs read-only across sessions
- [Dialogues](dialogues) — Shopping list, price entry, and related dialogs
