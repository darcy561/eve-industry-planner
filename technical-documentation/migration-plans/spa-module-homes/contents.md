# SPA module homes

## Owns

Where a module lives in the SPA and what it is called — placement and naming only, never behaviour.

- **The job model's home.** Its selectors, commands and draft store sit under one page's hooks folder
  while being imported app-wide, and the store slice that holds a job imports *upward* into a component
  folder to find its own state shape.
- **Folders named for a technique rather than a subject**, `Functions/Debounce/` being the one that
  still holds work for five unrelated domains.
- **Tests that do not sit beside what they cover** — two dozen of them in `Classes/`, including two
  named after a file that no longer exists.
- **Duplicates the scattering caused**: a module forked because the second author did not find the
  first, and forwarding wrappers left after a conversion.
- **Which test-name suffixes mean something**, and writing the survivors down.

## Does not own

- **Any behaviour.** A move that changes what the code does is not this project's; it is the project
  that owns that code. Nothing here may alter a rendered screen, a stored document or a wire shape.
- **Emptying `Classes/`.** Four survivors carry real behaviour, and what `jobSetup.js` holds for the
  industry facility rules is
  [../../frontend/industry-facilities/contents.md](../../frontend/industry-facilities/contents.md).
  Converting `group.js` is a behaviour project of its own.
- **The areas that were filed correctly** — `Functions/MarketData/`, `Functions/Custom Structures/`,
  `Functions/Endpoints/`, `Zustand/` slice layout, `WebSocket/`, `frontend/src/tests/` and the
  `Planning/Standard Layout/` panel tree. They are the model, not the work.
- Live SPA behaviour → [frontend/](../../frontend/contents.md) (promote target).

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when | [plan.md](./plan.md) |
| See what is misplaced and why it got there | [plan.md](./plan.md) § What the survey found |
| Know which moves are cheap and which are a bet | [plan.md](./plan.md) § The moves, by what they cost |
| Know what must not move | [plan.md](./plan.md) § What stays where it is |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
