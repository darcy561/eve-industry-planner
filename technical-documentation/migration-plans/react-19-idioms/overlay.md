# React 19 idioms — overlay

What changed in the SPA under this project, and how each part works after the change. Live frontend
documentation remains the truth where this file is silent; where it overlaps, this file wins until
the project promotes.

**Nothing has changed yet.** Phase 1 is docs only, and product work starts at Phase 2. The sections
below are the shape this overlay takes as each phase lands — a phase is not finished until its
section here says what a reader sees differently.

## What a reader sees differently

_Empty until Phase 2._

Each entry names the surface, not the file: what was on screen before, what is on screen now, and on
which frame. Most of Tier 1 changes only which frame a correct value appears on, and that is worth
saying plainly rather than dressing up as a fix. Tier 6 is the opposite — a panel that never followed
its value now follows it — and that difference is the point of saying which is which.

## The defects

_Empty until Phase 2._

One entry per defect (D1–D3, listed together in [plan.md](./plan.md)): the
symptom a reader could hit, what the code does now, and the test that would have caught it.

D4 and D5 were fixed outside this project and owe no entry here — a reader sees the market panels follow
prices and the link/unlink rows act at once, and those changes belong to the work that made them. What
they owe instead is a line in the inventory saying so, which they have.

## How these parts work now

_Empty until Phase 3._

The behaviour overlay proper. One section per shape rather than one per file, because the tiers are
shapes: where a copy of a value is brought into step and what reads it; where data arrives from and
what owns its loading state; what the Edit Job reducer is handed and by whom; what the route supplies
before a page renders; which store values a component subscribes to rather than sampling.

## Drafts for live documentation

_Empty until the shapes settle._

Live SoT that turns out to be missing or wrong is drafted here first and promoted at the end. The
frontend rules already carry § A value that follows another and the `useEffect` paragraph in
§ React 19 idioms; if this project's reading changes what those should say, the replacement text goes
here rather than into the live file. The Tier 6 distinction — reading an action through `getState()`
is right, reading a value through it is not — is the most likely candidate, since the rules do not say
it anywhere today.

## Decisions and departures

_Empty._

Where implementing a verdict from the inventory showed the verdict was wrong, record what was tried,
why it was rejected, and what replaced it — with the tests that made the case. The closed
[effect-state-sync](../effect-state-sync/contents.md) project's group-name panel entry is the model
for these.
