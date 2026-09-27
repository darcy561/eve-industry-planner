# React 19 idioms

The SPA against the idioms table in [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
§ React 19 idioms, row by row. Every `useEffect` read and given a verdict, and every other row of that
table swept for what still fails it.

The sweep's main result is that **effects are almost the whole of the gap**. There is no `forwardRef`
in the tree, no class component, no `PropTypes`, no `document.title` write, no dialogue built from raw
MUI parts, and no data path outside React Query. What is left beyond the effects is nine sites
across four shapes — fourteen were counted, and five have since been resolved by work outside this
project.

## Owns

- **The effect inventory** — all 93 `useEffect` call sites in `frontend/src`, what each does, and
  which survives. Counted and reproducible, not sampled.
- **The effects that only derive**, that fetch, that fix up a write someone else made, that navigate,
  or that fire analytics — and the three defects found while reading them.
- **Store reads that take no subscription** — a component calling a Zustand action in its render body
  through `getState()` and using what it returns, so nothing redraws when that value changes.
- **The two contexts still on `useContext()` and `<Context.Provider>`.**
- **Hand-rolled pending state** where `useTransition` owns the same job, including one flag
  prop-drilled into a child.
- **A timer standing in for a transition** — an animation delay wrapped around a real mutation, with
  no cleanup. Both call sites have since gone; the tier is kept for the lesson, not for work.
- **An imperative handle published from `useLayoutEffect`**, the SPA's only layout effect.
- **The record of what was swept and found clean**, so the next reader does not sweep it again.

## Does not own

- **The lint-flagged `set-state-in-effect` findings.** All 21 were read, decided and resolved by the
  closed [effect-state-sync](../effect-state-sync/contents.md) project, and its verdicts stand —
  including the two it decided to leave alone. This project does not revisit them.
- **`useHasChanged` itself** — the shared hook for a value that follows another, and the rule that
  governs it, are live SoT in [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md).
  This project uses it; it does not redesign it.
- **The shopping list's seven effects.** The worst in the tree, deliberately left: that logic is
  moving into the reducer under a separate redesign.
- **Turning the React Compiler on.** Not enabled, and not this project's question.
- **The Edit Job reducer's ownership of `state.activeJob`** → `planning-stage-panels/`.
- **The stored shape of an open job** → `job-document-drafts/`.
- **The dialogue shell and its hooks** → live SoT in
  [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) § Dialogues.

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal, the phases, and what closes this project | [plan.md](./plan.md) |
| Find an effect call site and what it should become | [measurements/effect-inventory.md](./measurements/effect-inventory.md) |
| Find a non-effect idiom finding, or see what was swept and found clean | [measurements/idiom-inventory.md](./measurements/idiom-inventory.md) |
| See what has changed and what a reader sees differently | [overlay.md](./overlay.md) |
