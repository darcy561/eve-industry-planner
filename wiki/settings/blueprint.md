# Blueprint Settings

Blueprint Settings control how the app builds planner jobs automatically and what defaults apply when blueprints are added. They affect [Job Planner](../job%20planner) actions such as Build Child Jobs, Build Full Tree, and Add New Jobs, as well as material trees inside [groups](../groups).

These are account-wide preferences. Individual jobs still let you change blueprint ME/TE and setups in [Edit Job](../edit%20job).

## Where you control it

- Settings → Blueprint Settings tab

## Default Material Efficiency

Choose the default Material Efficiency (ME) for new manufacturing job setups. ESI-owned blueprints (character and corporation) take priority when a match is found; this value is used when no matching blueprint is available from ESI.

## Automatically Recalculate Jobs

When on (default), closing [Edit Job](../edit%20job) after you change quantities or [parent/child](../parent%20and%20child%20jobs) links runs the [material tree shaker](../material%20tree%20shaker) over every job in that chain—tree shaking aligns planned output with what parent jobs need.

When off, tree shaking on close is skipped and you adjust each job in the chain yourself.

Edit from the top of the production chain (output jobs) when possible; output jobs have no parent jobs and are not resized by tree shaking—you set the target quantity, and jobs further down are adjusted when their parent jobs’ material lists change. See [Material tree shaker](../material%20tree%20shaker) for the full algorithm, diagram, and every trigger (Build Child Jobs and Build Full Tree always run it; Edit Job close only when this switch is on).

Turn this off only if you want full manual control over chain quantities; most users leave it enabled so linked jobs stay aligned after edits.

## Ignore Items Without Blueprints

When on, items with no matching ESI blueprint (character or corporation) are treated as not buildable:

| Where | Behaviour |
|-------|-----------|
| Automatic builds | Skipped in Build Child Jobs, Build Full Tree, group tree builds, and similar |
| Add New Jobs search | The item dropdown lists only recipes you have a blueprint for (helper text: *Filtered by available blueprints*) |

When off, automatic builds include every item in the chain, and Add New Jobs search shows the full recipe list.

Filtering applies when you are logged in and blueprint data has loaded from ESI. When logged out or offline, search is not blueprint-filtered even if this switch is on.

How “has a blueprint” is decided: The check uses blueprints from every linked character and every corporation your account can read from ESI. If any matching blueprint exists for that recipe, the item counts as buildable. The app does not check copy vs original, remaining runs, or whether you have enough runs for the quantity you want—presence only.

Use this to keep automatic trees and job search focused on items you can actually produce in-game.

## Materials To Ignore

Some materials you may choose to always buy or handle outside the planner—capitals, fuel blocks, niche components. Materials To Ignore is an exclusion list for automatic job building only.

How to manage the list:

1. Search for an item in the field above the chip list.
2. Select it to add a chip (name and type icon).
3. Remove an item with the delete control on its chip.

| Behaviour | Detail |
|-----------|--------|
| Automatic builds | Listed materials are not turned into child planner jobs |
| Child jobs | Any subtree those materials would have created is skipped |
| Manual adds | You can still add the material or a job for it by hand |
| [Material Prices](../edit%20job/planning/material%20prices) panel | Buildable rows show an info icon—orange (warning) for ignored materials, blue (primary) for everything else. Opening the popover shows *Material has been marked as exempt from builds.* |

The list is stored on your account and applies everywhere automatic building runs—including inside [groups](../groups) when you expand a production chain. The same list drives the highlight on the [Material Prices](../edit%20job/planning/material%20prices) panel so you can spot “buy only” items while comparing purchase vs build costs.

## Related pages

- [Settings overview](../settings) — All settings tabs
- [Layout Settings](../settings/layout) — Planner appearance and stage names
- [Job Settings](../settings/job) — Market and asset defaults for built jobs
- [Custom Structures](../settings/custom%20structures) — Structure defaults for automatic jobs
- [Reprocessing Settings](../settings/reprocessing%20settings) — Default reprocessing character
