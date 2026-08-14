# Group templates

Group templates let you save a group’s job layout and setups and recreate it later without rebuilding every job by hand. They are useful when you run the same production chain often—apply a template and you get a fresh group (or new jobs in an existing group) with the same items, quantities, links, and setup presets. Templates are stored on your account like your jobs and groups and are only available to logged-in users.

They capture structure, not live progress: manufacturing or reaction job types, quantities, parent/child links within the template, and preset setups (ME/TE, structure, system, runs, character choices). They do not copy purchasing records, ESI links, or planner stage positions from the saved group.

## Creating or filling a group from a template

| Entry point | What happens |
|-------------|----------------|
| [Job Planner](../../job%20planner) → Group Templates | Creates a new group from the template—all jobs, quantities, and parent/child links are built fresh—then opens that group page. |
| Group page → Apply template… | Adds jobs from the template into the current group and merges parent/child links with jobs already there. |

On a group page, Save as template and Apply template… are disabled when the group is read-only (see [Document lock](../../document%20lock)).

To save a template from a group you are editing, use Save as template on the group page left menu. See [Save as template](#save-as-template) below.

## Save as template

Group page (left menu) → Save as template.

Opens Save group as template:

1. Optionally pick an existing template from the catalog (search by name, description, or output item name).
2. Enter a name and description for what you are saving.
3. Choose an action:
   - Save as new — Creates a new template from the group’s current jobs.
   - Replace existing — Overwrites the selected template (confirmation required).
   - Delete existing — Removes the selected template permanently (confirmation required).

The group must contain at least one job. Each job must have valid setups, consistent quantities (setup math must match the job’s total product quantity), and parent/child links that stay inside the group—jobs pointing outside the group cannot be saved until you include or unlink those references.

Each saved template stores, per planner job: the item, manufacturing or reaction type, target quantity, parent/child links, and preset setups (runs, ME/TE, rig, structure, system, tax, optional character).

## Apply template

Job Planner → Group Templates, or group page → Apply template….

Opens Apply group template:

1. Search and select a template from your catalog.
2. Review the description and outputs summary (item icons, names, quantities).
3. Apply — Creates a new group when opened from the Job Planner, or adds jobs to the current group when opened from a group page (see table above).
4. Delete — Remove the selected template (confirmation required).

After apply, the app fetches missing market/index data and recalculates install costs for the new jobs, same as other bulk job creation flows.

## What templates are good for

- Repeat builds — Same ship fit, reaction batch, or module tree you run every month.
- Reusable layouts — Save a chain once and apply it again as new jobs whenever you need a fresh copy, without duplicating purchases, ESI links, or completion state from an existing group.
- Starting points — Apply a template, then adjust quantities or setups in [Edit Job](../../edit%20job) before purchasing.

Templates are not a backup of in-progress jobs (purchases, linked ESI jobs, sell stage). Keep active projects in your normal groups and jobs—they sync to your account the same way templates do.

## Related pages

- [Groups overview](../groups) — Other ways to [create a group](../groups#creating-a-group)
- [Parent and child jobs](../../parent%20and%20child%20jobs) — Links preserved inside a template
- [Job Planner](../../job%20planner) — Group Templates menu entry
- [Edit Job](../../edit%20job) — Refine jobs after apply
