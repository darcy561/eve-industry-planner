# Job Settings

Job Settings define account-wide defaults for planner jobs: where you buy materials, how prices are read, where assets are assumed to live, and a few calculation inputs used across the [Job Planner](../job%20planner), [Edit Job](../edit%20job), and related dialogues.

These values apply to new jobs and to views that fall back to account defaults. Individual jobs can override the market hub and order type in [Edit Job](../edit%20job); structures and asset locations are overridden per setup or job as described below.

## Where you control it

- Settings → Job Settings tab
- First-login setup — Default market hub, asset location, and citadel broker fee appear during planner configuration

## Market defaults

### Default Market Hub

The app uses four trade hubs for all market order lookups: Jita, Amarr, Dodixie, and Hek. Every market dropdown in the planner chooses among them; player-owned structures and other NPC stations are not currently supported.

Default Market Hub sets which of those four is pre-selected on your account—for new planner jobs, dialogues such as the [Shopping List](../dialogues/shopping%20list), and anywhere else that has not already picked a hub for itself.

### Default Market Orders

Every market price lookup uses either Buy Orders or Sell Orders from the hub’s regional market—the planner offers both options throughout.

Default Market Orders sets which of the two is pre-selected on your account—for new planner jobs, dialogues, and anywhere else that has not already picked a listing type for itself.

## Job display

### Hide Complete Materials

When on, material rows that are fully acquired are hidden in the Purchasing stage material list ([Edit Job](../edit%20job)). The toggle also appears on the purchasing panel so you can flip it while working a job.

When off, every material line stays visible regardless of completion status.

Use this when you want the purchasing list to focus on what you still need to buy.

## Asset location

### Default Asset Location

Pick a default hangar or station from locations where your linked characters have assets (loaded via ESI). Locations the app cannot resolve to a name—no-access structure IDs—do not appear in the list.

This default is used when:

- Creating new planner jobs
- Estimating material availability against your stock
- Opening asset-related views such as the default location in the [Shopping List](../dialogues/shopping%20list) dialogue

If your assets move or you link new characters, revisit this dropdown so the default still matches where you actually keep build materials.

## Citadel broker fee

### Citadel Brokers Fee Percentage

When you link a market order on a job’s Selling stage, the app calculates the broker fee for that order. At NPC stations, the fee is calculated from your character’s Broker Relations skill and NPC standings—this setting is not used.

At player-owned structures (citadels and other non-NPC locations), the app applies a flat percentage instead. Citadel Brokers Fee Percentage sets that rate on your account, stored to two decimal places (for example `3.5` for 3.5%).

There is only one account-wide rate—the app cannot store a different percentage per structure. If you sell from player-owned locations that charge different broker fees, change this setting to match before linking each group of market orders on the Selling stage so the estimates stay accurate.

## Predefined System Indexes

EVE’s API exposes system cost indexes for manufacturing, reactions, and other activities. Some systems—especially wormholes—do not return usable index data through ESI.

Predefined System Indexes let you pin an index per system and activity type on your account. Those values apply to all jobs assigned to that system when no tighter override exists.

### Priority order

```mermaid
flowchart LR
    Job[Job setup value] --> Pre[Predefined system index]
    Pre --> ESI[ESI system index]
```

1. Job setup — Value set on the job’s structure/setup in [Edit Job](../edit%20job) wins.
2. Predefined — Your entry on this settings page for that system and activity type.
3. ESI — Live index from EVE when neither of the above is set.

### Adding an index

1. Search for a solar system.
2. Choose an activity type (Manufacturing, Reaction, Invention, and others from the dropdown).
3. Enter System Index Value as a percentage from 0 to 100.
4. Press Add.

Saved entries list under the form with a remove control per activity. This is the account-level place to maintain wormhole or private indexes you rely on for install cost estimates.

## Extras categories

Extras are optional costs attached to planner jobs (hauling, blueprint copies, LP purchases, and similar). Extras categories group those costs for monthly expense reporting.

### Default categories

The app ships with categories such as Unassigned, Hauling Service, Jump Freight Service, Blueprint Copies, Loyal Point Costs, and Other.

### Customising categories

- Add — Type a name and press the add button to create a new category.
- Delete — Remove a custom category with the chip delete control. Unassigned and Other are permanent and cannot be deleted.
- Restore — Deleted categories move to a Deleted Categories list with an Undo control. They stay restorable until the next monthly calculation runs.

Categories you define here appear when assigning extras on jobs in [Edit Job](../edit%20job).

## Related pages

- [Settings overview](../settings) — All settings tabs
- [Layout Settings](../settings/layout) — Planner appearance and stage names
- [Custom Structures](../settings/custom%20structures) — Structure bonuses and tax for jobs
- [Blueprint Settings](../settings/blueprint) — Defaults for automatic job building
- [Reprocessing Settings](../settings/reprocessing%20settings) — Default reprocessing character
