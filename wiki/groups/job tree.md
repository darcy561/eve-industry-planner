# Group — Job tree tab

The Job tree tab shows how jobs in the group connect through [parent and child](../../parent%20and%20child%20jobs) links as an interactive dependency graph.

Built jobs sit lower in the layout; jobs that consume their output appear above. Connector lines run from child to parent (ingredient runs up toward assemblies that need them).

## Legend and job nodes

Each job is a card showing the item icon, job name, and a coloured stripe along the bottom for job type—manufacturing or reaction (same colours as on the planner).

A legend at the bottom of the canvas explains the status overlays that can appear on top of a card:

| Indicator | Meaning |
|-----------|---------|
| Green check | The job is marked complete in the group and build costs have been passed to parent jobs. |
| Ready (amber chip) | All materials are purchased and the job is waiting to be built—no ESI industry jobs are linked yet. |
| ESI n (blue chip) | The job is actively building; n is how many linked ESI industry jobs are attached. |

Only one of these overlays applies at a time: complete takes precedence; otherwise you see ESI when builds are linked, or Ready when materials are bought but nothing is running yet. Jobs still in earlier stages (planning, purchasing, and so on) show only the type stripe with no overlay.

When you click a job to highlight its chain, the selection ring uses the same colours (green, amber, or blue) when one of those statuses applies.

## Interacting with the tree

- Pan — Drag the canvas (including over job nodes) or use two-finger scroll on trackpads.
- Zoom — Toolbar controls, pinch gesture, or Ctrl / ⌘ + scroll.
- Click a job — Locks highlight on that job’s parents and children in the tree.
- Double-click a job — Opens [Edit Job](../../edit%20job) with return navigation back to this group and tab.
- Open in dialog — Expand the tree in a full-screen dependency dialog for a larger view.

## Highlighting from the Output panel

On the group page right drawer, each output job card has a highlight control. Using it on the Job tree tab dims the graph to that output’s production chain (only the relevant jobs and their connectors stay emphasized).

This uses the same highlight state as clicking through the tree, so you can jump from an output product to “everything that feeds this build.”

## Focus on a specific job

When you return to the group from [Edit Job](../../edit%20job) after opening a job from the Job tree tab, the app briefly centers the graph on that job so you can find it again after editing.

That happens automatically when you:

1. Are on the Job tree tab (or open a job from the full-screen dependency dialog while viewing the tree).
2. Open a job — double-click a node, or use the dialog’s edit action.
3. Close, save, or delete the job and navigate back to the group.

The return URL includes `focusJobId` for a moment; the tree pans to that job, then the parameter is removed so bookmarks and shared links stay clean. You do not set `focusJobId` yourself — it is only used for this return-from-edit handoff.

## Empty state

If the group has no jobs yet, the tab shows a short empty message. Add jobs from Add New Jobs on the [group overview](../groups) left menu.

## Related pages

- [Groups overview](../groups)
- [Parent and child jobs](../../parent%20and%20child%20jobs) — What the links mean
- [Planner](planner) — Stage-based view of the same jobs
- [Breakdown](breakdown) — Cost roll-ups per output job
