# Job status accordions (`frontend/src/Hooks/useJobStatuses.js`)

Live SoT for the planner's job status accordion list — the stages a job moves
through, and whether each one is expanded.

## What the hook returns

`useJobStatuses` builds the ordered list of stages from application settings'
stage names and a per-stage expanded map, and returns that list plus
`toggleExpanded`. The expanded map is read from local storage, keyed on the
signed-in account, once — on mount, and again only if the account id changes.

## Following the account

The planner page stays mounted across a sign-out, so the accordions follow
whichever account is signed in rather than keeping the previous reader's
choices: a reader who signs out and back in as someone else sees that
account's collapsed stages, not the ones left behind.

## Persisting a toggle

`toggleExpanded` writes the new map back to local storage for the current
account immediately, so the collapsed/expanded state survives a reload without
a network round trip.
