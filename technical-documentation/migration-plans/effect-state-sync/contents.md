# Effect-driven state synchronisation

**Status: closed.** Every finding is resolved and the live SoT is promoted. This folder is **history only**, kept because [job-document-drafts](../job-document-drafts/contents.md) and [react-19-idioms](../react-19-idioms/contents.md) cite its verdicts.

## Owns

The SPA components and hooks that hold a copy of something in state and keep it in step with an
effect, and the question of whether that shape is worth keeping.

- **State synchronised from a prop, the store, or the route** — a component holding its own copy of a
  value it was given, with an effect that writes the copy again whenever the original moves. What the
  reader sees on the frame before that effect runs, and what the copy is for.
- **State written to drive something imperative** — a counter bumped so a view below re-runs a fit or
  a focus, where the state carries no value of its own and exists only as a signal.
- **State set on the guard path of a subscription effect** — an effect that exists to attach an
  observer or a listener, and that also writes an "off" value when it decides not to attach.
- **State recomputed from other state** — a derived list or flag written into state by an effect
  rather than computed while rendering.
- Whether these are four separate tidy-ups or one shape the area should stop using, and what a
  refactor would have to be worth to be justified.

## Does not own

- The React Compiler rules themselves, and whether the compiler is turned on → the lint bar lives in
  [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md).
- The Edit Job reducer's in-place mutation of `state.activeJob`, which is a settled decision with its
  own reasoning and measurements → `planning-stage-panels/`.
- Panel and props shape on the Planning stage, including what re-renders when a dispatch lands →
  `planning-stage-panels/`.
- Anything about how the asset tree virtualises or measures its rows.

## Task map

| I need to… | Read |
|------------|------|
| See what has already changed and what a reader sees differently | [overlay.md](./overlay.md) |
| Understand the goal, the phases, and what closes this project | [plan.md](./plan.md) |
| See the findings themselves, how they were counted and grouped | [measurements/inventory.md](./measurements/inventory.md) |
