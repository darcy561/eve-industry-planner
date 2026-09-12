# Linking a parent job (`frontend/src/Components/Edit Job/parentJobOptions.jsx`)

Live SoT for which jobs the Link Parent Job dialogue offers on the job being
edited. The dialogue itself is the SPA's shared shell — see
[../technical-rules.md](../technical-rules.md) § Dialogues — so nothing here
repeats how it opens, closes, or is built; this is the list `ParentJobOptions`
draws as the dialogue's body.

## Which jobs are offered

A job is offered as a parent when all of the following hold:

- it is built from an item this job's output feeds into as a material
  (`job.build.materials` contains this job's `itemID`);
- it is not already one of this job's parents;
- it is not already queued to be added as a parent in this editing session;
- when the job being edited belongs to a group, the candidate is in that same
  group.

A job the reader has just queued for **removal** as a parent is offered
regardless of the rules above, so taking a link off and putting it back is one
uninterrupted action rather than a trip out of the dialogue.

## When the list is built

The list is derived with `useMemo` from the planner's jobs and what the reader
has already queued to add or remove, so it is correct on the dialogue's first
painted frame. Because the dialogue's body is only mounted while it is open —
the shared shell renders nothing shut — the pass over every job on the planner
costs nothing while nobody is looking at it.
