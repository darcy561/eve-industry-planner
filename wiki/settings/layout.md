# Layout Settings

Layout Settings control how Eve Industry Planner looks and how workflow labels read on the [Job Planner](../job%20planner) and in [Edit Job](../edit%20job). They are account-wide preferences: changes save automatically and follow you across devices.

## Where you control it

- Settings → Layout Settings tab (`/settings`)
- First-login setup — Compact view and related planner preferences appear during initial configuration

## Enable Help Cards

The Enable Help Cards switch controls tutorial panels and inline guidance across the app.

### When the switch is on

- Welcome and intro panels appear where the app offers them—for example the Job Planner drawer when Add New Jobs is closed (see [Job Planner](../job%20planner)).
- Help text on [Edit Job](../edit%20job) workflow steps is shown.
- Contextual hints in dialogues such as Price Entry are visible.
- On the [Dashboard](../dashboard), tutorial content is available for logged-in users.

### When the switch is off

- Those panels and hints are hidden for a cleaner workspace.
- Core functionality is unchanged—you are only turning off guidance, not features.

This is the same family of control referenced in [Edit Job](../edit%20job) as Enable Help Cards. If you already know the planner, turning it off reduces visual noise without affecting your jobs or data.

## Enable Compact View

The Enable Compact View switch switches between classic and compact presentation in several list and board views.

| Area | Classic | Compact |
|------|---------|---------|
| [Job Planner](../job%20planner) job cards | Full card body with stage summary | Name, type stripe, and hover info |
| [Group planner](../groups/planner) job cards | Same as main planner | Same compact layout |
| [Blueprint Library](../blueprint%20library) | Standard row spacing | Denser rows |

Compact view does not remove information from Edit Job—it mainly affects how much fits on the board and in library lists. You can toggle it at any time; open jobs and selections are unaffected.

## Job stage names

Below the two switches, Job stage names lets you rename the five workflow steps used on the [Job Planner](../job%20planner), inside [groups](../groups), and in the [Edit Job](../edit%20job) vertical stepper.

Each field corresponds to one stage in order. Leave a field blank to keep the built-in default (shown as helper text under the field).

| Stage | Default name | Typical meaning |
|-------|--------------|-----------------|
| 1 | Planning | Blueprint, setup, and cost configuration |
| 2 | Purchasing | Buying and tracking materials |
| 3 | Building | In-game industry runs and ESI job links |
| 4 | Complete | Build finished; costs wrapped up |
| 5 | For Sale | Market orders and sales tracking (shown as Selling in some docs when using the default label) |

Custom names appear everywhere that stage label is shown—accordion headers on the planner, step titles in Edit Job, and bulk-move actions. They do not change job logic: a job in stage 3 is still in the building step even if you rename it “Production”.

Renaming is useful when your corp vocabulary differs (for example “Procurement” instead of “Purchasing”) or when you want shorter labels on a small screen.

## Related pages

- [Settings overview](../settings) — All settings tabs
- [Job Settings](../settings/job) — Market, asset, and job defaults
- [Custom Structures](../settings/custom%20structures) — Structure presets for jobs and reprocessing
- [Blueprint Settings](../settings/blueprint) — Automatic job building defaults
- [Reprocessing Settings](../settings/reprocessing%20settings) — Default reprocessing character
