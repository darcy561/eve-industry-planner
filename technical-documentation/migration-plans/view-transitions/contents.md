# View transitions

**Status: every phase has landed; the project is at its close condition.** The SPA carries the timing every
view transition uses, navigating between pages animates the page that left as well as the one that arrived,
a dialogue driven by `useDialogueTrigger` fades out as it closes, and the drafts that fold all of it into
live SoT are written. What stands between this and promotion is a manual browser pass on both surfaces and
a decision on the pending splash — [plan.md](./plan.md) § Done when lists them.

## Owns

Where the SPA animates a **whole surface arriving or leaving**, and which mechanism animates it.

- **The page swap.** `pageTransition.jsx`, today a keyed MUI `Fade` carrying a documented workaround
  for not being able to animate the page that left.
- **The dialogue close.** `ContentDialogue` removes everything on close, which is why closing does not
  animate today; a snapshot animates after the removal, so the shared shell can have a closing
  transition without keeping a dialogue's body mounted.
- **The boundary between the two mechanisms** — MUI inside a mounted surface, `ViewTransition` only
  where React adds or removes a whole surface inside a transition — and the draft that puts it into the
  frontend rules.
- **The foundation the pseudo-element animations need**: one stylesheet fed by `theme.transitions`,
  injected once, with the reduced-motion rule MUI's components already get for free.
- **What a reader on a browser without view transitions sees**, which is an instant swap.

## Does not own

- **The 32 MUI transition sites that stay.** Counted and listed in
  [measurements/transition-sites.md](./measurements/transition-sites.md) so they are not swept again.
  They animate inside mounted surfaces on plain state and are not eligible.
- **The React 19.3.0 upgrade itself**, which landed before this project and is recorded in
  [react-19-idioms/measurements/idiom-inventory.md](../react-19-idioms/measurements/idiom-inventory.md)
  § Swept and clean.
- **Fragment refs and `addTransitionType`**, the upgrade's other additions — see [plan.md](./plan.md)
  § Out of scope.
- **The effects, store reads and pending state** being swept by
  [react-19-idioms](../react-19-idioms/contents.md), including the `FirstLoginPage` observer timer.
- **Live frontend SoT**, until this project promotes.

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, the mechanism facts both designs rest on, and the phases | [plan.md](./plan.md) |
| See every animation in the SPA and what happens to it | [measurements/transition-sites.md](./measurements/transition-sites.md) |
| Know what a reader sees differently as phases land | [overlay.md](./overlay.md) |
| Know why MUI and `ViewTransition` cannot be layered on one element | [plan.md](./plan.md) § What is true about the two mechanisms |
| Know what the tests can and cannot prove here | [plan.md](./plan.md) § What tests can and cannot say |
