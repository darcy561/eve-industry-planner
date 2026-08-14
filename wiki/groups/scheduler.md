# Group — Scheduler tab

The Scheduler tab builds a manufacturing and reaction timeline for planner jobs in the group: which setup runs happen when, on which characters, within slot limits, while respecting [parent/child](../../parent%20and%20child%20jobs) order (prerequisite runs finish before dependent runs start).

It answers *when* to run jobs, not *what* to build—that remains on the [Planner](planner) and [Edit Job](../../edit%20job) screens.

## Summary bar

When a schedule is computed, the top of the tab shows:

- Total scheduled tasks — Individual setup runs placed on the timeline (each setup/run on a planner job can become one or more tasks).
- Unscheduled tasks — Runs that could not be placed, with a reason per task (missing duration, no free slot, precedence blocked, etc.).
- Total duration (makespan) — Wall-clock span from the first scheduled start to the last scheduled finish across the whole plan (shown as days and hours).

## Gantt view

The main area is a Gantt-style chart: tasks as bars on a time axis, grouped by character and activity type (manufacturing, reaction, science). Pan and scroll the chart to inspect long chains.

Task timing comes from job setups (runs, job counts, structure/character choices) and the slot model for each selected character.

## Character selection

At the bottom, tick which linked account characters participate in the schedule. By default, all characters on your account are included.

Each character contributes their maximum industry slot counts (manufacturing, reaction, science) derived from skills—the scheduler always plans as if that full capacity is available. There is no setting to cap or override how many slots a character uses; you can only include or exclude characters from the list.

The scheduler does not subtract slots already in use by ongoing ESI industry jobs. Active in-game jobs are ignored for scheduling, so every selected character’s slots are treated as free. Use the timeline as a plan, not a live picture of slot occupancy.

Use Select all / Clear shortcuts in the character list when toggling many rows.

## Scheduling strategy

Greedy is the strategy in use today: prefer earlier finish times, reuse slots where sensible, and reuse characters when possible to reduce fragmentation.

Additional strategies may be added in a future update.

## Precedence

Parent/child links in the group define order: a job’s tasks cannot start until tasks for jobs it depends on (parents in the production sense—jobs that consume this run’s output) have completed in the schedule.

If a chain is incomplete or durations are missing, some tasks may appear under Unscheduled with an explanatory message.

## When to use it

- Plan a multi-day build across several characters and slot types.
- See whether your current group fits in available manufacturing slots before committing in-game.
- Identify bottlenecks (unscheduled tasks or long makespan).

## Related pages

- [Groups overview](../groups)
- [Job tree](job%20tree) — See dependency structure the scheduler respects
- [Planner](planner) — Execute the plan stage by stage
- [Accounts](../../accounts) — Linked characters used in character selection
