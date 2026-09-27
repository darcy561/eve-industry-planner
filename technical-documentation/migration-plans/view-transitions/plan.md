# View transitions — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for every surface this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../frontend/documentation-rules.md`](../../frontend/documentation-rules.md).
Phase 1 (project folder and docs) before any product work.
No Go surfaces are in scope, so `go fix -diff` does not apply.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Put React's `<ViewTransition>` behind the two places the SPA animates a **whole surface arriving or
leaving**, and write down the boundary that keeps every other animation on MUI.

The prize is not new choreography. It is that a view transition animates a **snapshot taken before the
commit**, so a surface can animate out *after* React has removed it. Both target surfaces are shaped
by not having had that: one carries a documented workaround for it, and the other accepts a missing
animation as the price of a rule.

## Why this is possible now

React 19.3.0 is in the SPA. It adds exactly `ViewTransition` and `addTransitionType` (and Fragment
refs, which this project does not use). Nothing else about the upgrade bears on this work.

## What is true about the two mechanisms

Established by reading React 19.3.0, MUI 9.4 and TanStack Router 1.170 rather than from documentation
about them. These facts are what the phases below are costed against.

- **MUI animates the live element.** `Fade`, `Grow`, `Collapse`, `Slide` and `Zoom` are
  `react-transition-group`: each clones its single child, requires that child to accept a `ref` and a
  `style`, and tweens the element's own inline style. To animate an exit it **keeps the element
  mounted** until `onExited`.
- **React animates a picture of the element.** `<ViewTransition>` writes `view-transition-name` and
  `view-transition-class` into the inline style of every host instance beneath it, suffixing
  `_1`, `_2` where there is more than one, lets the browser snapshot old and new, animates
  `::view-transition-*` pseudo-elements at the document root, then restores what the `style` prop
  said. Props are `name`, `default`, `enter`, `exit`, `update`, `share` and the matching `on*`
  callbacks.
- **They cannot be layered on one element.** `<Fade><ViewTransition>…` does not work at all, because
  Fade injects `style` and a ref into its child and a `ViewTransition` is not a host element. The
  other order type-checks and wastes one of the two: while the browser animates the snapshot the real
  element is not on screen, so MUI's tween is invisible and can be captured mid-fade.
- **Exits are mutually exclusive.** MUI holds the node mounted to fade it out; `ViewTransition` needs
  React to remove it during the commit.
- **Only a transition-lane commit animates.** `startTransition`, `useTransition`, `useDeferredValue`
  and Suspense retries. A plain `setState` in an `onClick` — which is how every dialogue's `open` flag
  moves today — produces no view transition.
- **Route navigation is already eligible.** `@tanstack/react-router`'s `Transitioner` overrides
  `router.startTransition` to wrap match commits in `React.startTransition`, so the outlet swap is a
  transition with no plumbing added.
- **The router's own option must stay off.** `router-core` has a `viewTransition` /
  `defaultViewTransition` that calls `document.startViewTransition` directly. The browser allows one
  active view transition, so enabling both means React's is skipped.
  [`appRouter.jsx`](../../../frontend/src/appRouter.jsx) sets neither today.
- **MUI knows nothing about any of this.** There is no `startViewTransition` or `view-transition`
  anywhere in `@mui/*` at 9.4, so nothing is inherited and nothing conflicts by default.
- **Support is broad but not total.** Chrome and Edge 111+, Firefox 144+, Safari 18 / iOS 18+,
  Samsung 23+, per the `caniuse-lite` the SPA already builds against. React skips the animation where
  it is missing, so an unsupported browser gets an instant swap.

## The boundary this project exists to establish

**MUI transitions inside a mounted surface; `ViewTransition` only where React adds or removes a whole
surface inside a transition.**

Without that written down, this becomes seventeen files of somebody's judgement. The SPA has **33 MUI
transition sites across 17 files**, inventoried in
[measurements/transition-sites.md](./measurements/transition-sites.md), and **32 of them stay exactly
as they are** — they animate within a surface that is already mounted, on plain state, and are not
eligible for a view transition at all.

## The two surfaces

### S1 — the page swap

[`Components/pageTransition.jsx`](../../../frontend/src/Components/pageTransition.jsx) is a keyed
`<Fade in appear>` around the outlet. Its own doc comment records the workaround: each page gets its
own surface and fades in from hidden, because sharing one surface hands the arriving page the opacity
the leaving page left behind, and the only route to a hidden frame is to animate the old page *out* —
which paints it, removes it, and brings it back, reading as a slow flash on a heavy page.

That constraint is exactly what a snapshot removes. The navigation doc's other promise — that the
outgoing page unmounts at once so its effects and document locks release — is kept, because the
animation no longer needs the element.

Two expressions, and the spike picks between them rather than this plan:

1. **Key the `Box` inside a stable `<ViewTransition>`.** React sees one named transition whose host
   instance was replaced and cross-fades old against new.
2. **Key the `<ViewTransition>` itself**, giving `exit` on the old and `enter` on the new as two
   independent animations. Closer to today's code, but two animations to tune into looking like one.

The pending splash is the trap. A Suspense reveal is eligible too, so a navigation slow enough to show
`RoutePending` would animate twice — page → splash → page — which is the old flash arriving from the
other end. It wants `exit="none"`, or to stay outside the transition as the root-pending case already
does.

### S2 — the dialogue close

[`ContentDialogue.jsx`](../../../frontend/src/Styled%20Components/Dialogue/ContentDialogue.jsx) opens
with `if (!open) return null`, so closing removes the `Dialog`, its Modal, backdrop and paper in one
commit. That is why the frontend rules record "a dialogue disappears at once rather than fading" as the
cost of the shell rendering nothing while shut. A snapshot animates after the removal, so the rule can
keep its benefit and lose its cost.

It needs two things, and the second is the risk:

- **Eligibility, once, in the shared hooks.** Every dialogue's open flag moves through
  `useDialogueTrigger` or `useDialogueEventState`, so `startTransition` belongs there rather than at
  each call site.
- **The animation in the shell**, so every dialogue inherits it. The snapshot is a pseudo-element at
  the document root, above MUI's own backdrop `Fade`, and those two may not agree. If they fight, the
  answer is to drop it and leave the rule's cost recorded — that is a legitimate outcome of Phase 4,
  not a failure.

Turning MUI's Modal transitions off and animating the whole open and close ourselves is **rejected**:
it rebuilds Modal behaviour rather than wrapping it.

## Phases

### Phase 1 — this folder (gate)

Project folder, `contents.md`, this plan, the site inventory, the overlay scaffold, and a row on the
[section task map](../contents.md). No product work.

**Done.**

### Phase 2 — the foundation

One stylesheet for the `::view-transition-*` pseudo-elements, injected through MUI `GlobalStyles`
beside `CssBaseline` in [`AppWrapper.jsx`](../../../frontend/src/AppWrapper.jsx), inside
`ThemeProvider` so its durations and easings are read from `theme.transitions` rather than written
again. Carries the `@media (prefers-reduced-motion: reduce)` rule that MUI's own `useReducedMotion`
gives the components for free.

No surface uses it yet, so nothing changes on screen. Landing it alone is what keeps the spikes small.

**Done**, and it sets timing for **every** view transition rather than for a named class — see
[overlay.md](./overlay.md) § How view transitions are timed. Phase 3 therefore adds no CSS of its own.

### Phase 3 — S1, the page swap

Both expressions above, one characterisation test first, then the choice and the reasoning recorded in
the overlay. `usePageKey` is not touched.

**Done.** Expression 2 — the key on the `<ViewTransition>` — with `update="none"`, which the spike showed
is required rather than optional. [overlay.md](./overlay.md) § Decisions and departures has the
measurement, and § Gaps these phases found records something it turned up that this project is not
fixing. The pending splash named above is still open.

### Phase 4 — S2, the dialogue close

`startTransition` into the two dialogue hooks, then the shell. One dialogue proves it before the shell
change lands for all 22. A recorded "no" is an acceptable result.

**Done, and it is a yes.** The backdrop conflict this phase was braced for does not exist: React names the
Modal root, which contains the backdrop, so the whole dialogue is one snapshot. It reaches the five
dialogues driven by `useDialogueTrigger` rather than all of them, because only that hook owns an open flag
— [overlay.md](./overlay.md) § Which dialogues this reaches says what extending it would mean.

### Phase 5 — the boundary, written down

The rule from § The boundary, as a draft for
[`../../frontend/technical-rules.md`](../../frontend/technical-rules.md), in the overlay until
promotion. Also the answer to what a reader on a browser without view transitions sees, which the
rules do not currently have to say anywhere.

**Done.** [overlay.md](./overlay.md) § Drafts for live documentation carries three, not the two this plan
expected: the new § What animates a surface, a replacement for the last paragraph of § Dialogues — which
states a cost this work has paid back — and a replacement for the navigation doc's page-swap section,
heading included.

## Done when

- The foundation is in, S1 has landed on one of its two expressions, and S2 has either landed or
  carries a recorded and reasoned no.
- Each changed surface carries a characterisation test written **before** the change, and the limits of
  that coverage are stated rather than implied — see § What tests can and cannot say.
- `npm run lint`, `npm run format:check` and the Vitest suite pass.
- The boundary rule is drafted for the frontend rules, and the 32 sites that stay are still 32.
- A manual pass in a browser with view transitions and one without, on both surfaces.
- Promotion is approved, the overlay is folded into the live frontend documentation, and this folder is
  deleted.

## What tests can and cannot say

jsdom has no `document.startViewTransition`, so React skips the animation and every existing test keeps
passing while proving nothing about it.
[`pageTransition.test.jsx`](../../../frontend/src/Components/pageTransition.test.jsx) is the clearest
case: it will stay green either way.

What the suite can hold is the **DOM contract** — that the outgoing content is unmounted on the same
commit, and that React applied the expected `view-transition-name` — which needs a
`startViewTransition` stub in [`frontend/src/tests/`](../../../frontend/src/tests/) rather than one per
test file, per the frontend rules on shared helpers. Everything about how it *looks* is a manual check,
and this plan says so rather than implying the tests cover it.

## Out of scope

- **The 32 MUI transition sites that stay**, listed in
  [measurements/transition-sites.md](./measurements/transition-sites.md). They are not eligible and
  they are not wrong.
- **Fragment refs.** Also new in 19.3.0, and nothing in the tree needs them: the SPA's one observer
  hook watches a single element and already uses a callback ref, there is no `.focus()` call in
  application code, and nothing measures or listens to a group of siblings.
- **`addTransitionType`.** Direction-aware animation — a page entering from the left on Back — is a
  second question, and worth asking only once S1 has landed plainly.
- **The First Login step slide.** `FirstLoginPage.jsx` animates between steps with `CSSTransition` and
  two hard-coded millisecond constants, and re-attaches a `ResizeObserver` on a timer derived from
  them. It is a step change inside a mounted page on plain state, so it is not eligible, and the
  observer's timer is already a recorded finding in
  [react-19-idioms](../react-19-idioms/measurements/effect-inventory.md).
- **Turning the React Compiler on**, which remains where react-19-idioms left it.
