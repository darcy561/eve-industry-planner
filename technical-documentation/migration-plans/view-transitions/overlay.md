# View transitions — overlay

What changed in the SPA under this project, and how each part works after the change. Live frontend
documentation remains the truth where this file is silent; where it overlaps, this file wins until the
project promotes.

**Phases 2, 3 and 4 have landed.** The SPA carries the timing every view transition uses, the page swap
runs one, and a dialogue driven by `useDialogueTrigger` fades out as it closes. What is left is the manual
browser pass and the pending-splash case.

## How view transitions are timed

`Context/viewTransitionStyles.js` exports one function of the theme, injected once through MUI
`GlobalStyles` beside `CssBaseline` in `AppWrapper.jsx` — inside `ThemeProvider`, because it reads
`theme.transitions.duration.enteringScreen` and `theme.transitions.easing.easeInOut`. A snapshot
animation and a MUI `Fade` therefore move at one speed, from one figure, and a theme that states its own
timing moves both.

It carries two rules and no named class:

- `::view-transition-old(*)` and `::view-transition-new(*)` take the duration and easing. The `*`
  matches every transition name, so a surface wrapped in `<ViewTransition>` inherits the app's timing
  without naming a class or bringing CSS of its own.
- Under `@media (prefers-reduced-motion: reduce)`, `::view-transition-group(*)` and both halves get
  `animation: none`. MUI's components read that preference themselves through `useReducedMotion`; a
  pseudo-element cannot, so this is the only place the preference is honoured for a snapshot.

Why it is document-wide rather than a named class is in § Decisions and departures.

## What a reader sees differently

One entry per surface, naming what was on screen before, what is on screen now, and **what a reader on
a browser without view transitions sees instead** — which for this project is never the same thing, and
is the entry most easily left out.

**Closing a dialogue.** Before: the dialogue and its backdrop vanished on the frame the reader pressed
Close, because the shell renders nothing while shut and so there was nothing left for MUI to animate out.
Now a dialogue opened from `useDialogueTrigger` fades out as one piece, backdrop included, over the same
225ms. Opening looks exactly as it did. Every other dialogue still vanishes, as § Which dialogues this
reaches explains.

On a browser without view transitions, and for a reader who asked for reduced motion, closing vanishes as
it did before — so this is a gain for some readers and unchanged for the rest.

**Navigating between pages.** Before: the arriving page faded in from hidden over 225ms and the page
being left vanished on the frame it was removed. Now both halves animate over that same 225ms — the page
that left fades out from a snapshot of itself while the page that arrived fades in, in the same place. To
a reader that reads as one movement rather than as a disappearance followed by a fade.

It is two animations rather than one paired cross-fade, and that is worth knowing before debugging the
look of it: React gives each `<ViewTransition>` instance its own generated name, so keying the boundary
means the outgoing and incoming surfaces are two differently-named groups, each running the browser's
default fade. Whether naming them alike — which would make the browser pair them into a single group —
looks better is an open question for the manual pass, and untried.

On a browser without view transitions — Firefox before 144, Safari before 18 — there is **no animation at
all**: the outgoing page is replaced by the incoming one on the frame it arrives. That is a loss for
those readers, who had a fade before, and it is the cost of this change. React skips the transition
silently, so nothing breaks and nothing is reported.

A reader who has asked for reduced motion gets that same instant replacement, and the page swap is the
**first** surface in the SPA to honour the preference at all. MUI's transitions read it only when
`theme.motion.reducedMotion` is `"system"`; it defaults to `"never"` and
[`Context/ThemeContext.jsx`](../../../frontend/src/Context/ThemeContext.jsx) does not set it, so every
MUI transition in the app animates a reduced-motion reader at full duration today. § Gaps these phases
found says what that would take to fix, and it is not this project's to fix.

## How the page swap works now

`PageTransition` is one `<ViewTransition key={contentKey} update="none">` around the page surface. The
`Fade`, the `useTheme` call and the timeout are gone; the animation is the browser's, timed by the
global rules in § How view transitions are timed.

Two properties make it the shape it is, and both were settled by measurement rather than preference —
see § Decisions and departures:

- **The key is on the `ViewTransition`, not on the `Box` inside it.** A navigation is then the old
  boundary leaving and a new one arriving, which React can tell apart from a change *within* a page.
- **`update="none"`** so that only that arrival and departure animate. Without it, every transition-lane
  update inside a page animates the whole page.

What has not changed is the contract the page swap already had: only the incoming page is rendered, the
outgoing one unmounts on the same commit, and a param change under one route pattern updates the page
in place. Those are what
[`pageTransition.test.jsx`](../../../frontend/src/Components/pageTransition.test.jsx) holds, now stated
without reference to opacity so they read against either mechanism.

The pending splash is not addressed yet. A Suspense reveal is view-transition-eligible, so a navigation
slow enough to show `RoutePending` can still animate twice; [plan.md](./plan.md) § S1 says what it
needs, and no measurement has been taken of it.

The claim in [frontend/navigation/spa.md](../../frontend/navigation/spa.md) § Navigating fades the
incoming page stops being true at its heading, not only in its body, so the replacement text belongs in
§ Drafts below rather than in the live file.

## Gaps these phases found

**No MUI transition in the SPA honours `prefers-reduced-motion`.** MUI reads the preference through
`theme.motion.reducedMotion`, whose modes are `"never"`, `"system"` and `"always"`. It defaults to
`"never"` and [`Context/ThemeContext.jsx`](../../../frontend/src/Context/ThemeContext.jsx) does not set
it, so all 32 of the transitions in
[measurements/transition-sites.md](./measurements/transition-sites.md) — the snackbar, the drawers, the
accordions, the login states — run at full duration for a reader who asked for less movement.

`motion: { reducedMotion: "system" }` on the theme is the whole fix, and it would change how 32 surfaces
behave. That is a one-line change with a wide blast radius, which makes it somebody's decision rather
than a side effect of this project, so it is recorded here and **not taken**. It is not a view-transition
question: the pseudo-element rules in § How view transitions are timed already honour the preference
without it.

**`ContentDialogue`'s `withSuspense` branch has no callers.** Nothing in `frontend/src` passes it, so the
second `Dialog` it renders as a suspense fallback is never built. It was found while deciding whether that
second `Dialog` needed wrapping in a `ViewTransition` too — the answer is that the question is moot. It
may be provision for a dialogue that suspends, in which case it should stay and be kept current, or it may
be a leftover, in which case it and its `suspenseFallback` and `loadingSkeleton` props go. Either way it is
the dialogue shell's question rather than this project's, and nothing here was changed on account of it.

## How a dialogue closes now

A dialogue's **opening is still MUI's** and its **closing is React's**. `ContentDialogue` wraps its
`Dialog` in `<ViewTransition enter="none" update="none">`, and `useDialogueTrigger`'s `close` — and only
`close` — runs inside `startTransition`. So:

- Opening is a plain state change, which is not view-transition-eligible, and `enter="none"` says so a
  second time. MUI's Modal animates the open exactly as before.
- Closing is a transition, so React snapshots the dialogue before removing it and the browser fades the
  snapshot out. The shell still renders nothing while shut — `if (!open) return null` is untouched — so
  the closing animation costs nothing while nobody is looking at a dialogue.
- A change *inside* an open dialogue does not animate it, which is what `update="none"` is for. Without
  it, every transition-lane update within a dialogue would fade the whole dialogue.

**The backdrop worry did not materialise, and the measurement says why.** The element React names is the
Modal root — `div.MuiDialog-root.MuiModal-root` — which *contains* the backdrop and the paper. The
snapshot is therefore of the whole dialogue at once, so there is no pseudo-element racing a separately
animating backdrop underneath it. That is the opposite of what [plan.md](./plan.md) § S2 expected to
find, and it is why this phase landed rather than recording a no.

### Which dialogues this reaches

Only the dialogues whose close runs through `useDialogueTrigger`, which is five call sites. This is not a
flag or a gate: the shell's `ViewTransition` only animates a removal that happens inside a transition, so
a dialogue whose close is a plain state change is simply unaffected.

Twenty-two components build a dialogue from the shell. Thirteen files drive one through
`useDialogueEventState` or `useSyncedDialogueEventState`, holding `isOpen` in their own reducers, and the
rest hold their own state — so a dialogue's open flag lives in three different places, not the two the
plan assumed.

That makes the rollout self-limiting rather than deliberate, and it is a **departure from what
[plan.md](./plan.md) § S2 assumed** — that every dialogue's open flag moves through one of two shared
hooks, so one edit would reach all of them. It does not: only `useDialogueTrigger` owns an open flag.
Extending it to the rest means making each one's close a transition, which is a decision about those
surfaces one at a time rather than a line in a shared hook.

## Drafts for live documentation

Three pieces of live SoT are owed, written here as the text to promote. Each is written as live
documentation — what the SPA does, with no before-and-after and no reference to this project.

### 1. New section for [frontend/technical-rules.md](../../frontend/technical-rules.md)

To sit after § Dialogues, since both are about the shared shell.

> ## What animates a surface
>
> The SPA animates with MUI's transitions — `Fade`, `Grow`, `Collapse`, `Slide`, `Zoom` — and with
> React's `<ViewTransition>`, and which one it is follows from what is being animated:
>
> **MUI inside a mounted surface. `ViewTransition` only where React adds or removes a whole surface
> inside a transition.**
>
> A MUI transition tweens the live element's own style and keeps it mounted to animate it out, so it
> animates things that stay: a row appearing in a list, a drawer opening, a panel collapsing, a
> snackbar sliding in. That is nearly everything, and it is the default.
>
> `<ViewTransition>` animates a **snapshot taken before the commit**, which is the only way to animate
> something React has removed. Two surfaces need that and have it: the page swap in
> `Components/pageTransition.jsx`, and a dialogue's close in the shared shell.
>
> The two cannot be layered on one element. A MUI transition inside a `ViewTransition` boundary wastes
> one of the two — while the browser animates the snapshot, the live element is not on screen — and a
> `ViewTransition` inside a MUI transition **throws**: MUI writes the animated style straight onto its
> child's DOM node, reached through a ref it forwards into the child, and a `ViewTransition` is not a host
> element so that ref never resolves to a node.
>
> A view transition runs only for a **transition-lane** commit: `startTransition`, `useTransition`,
> `useDeferredValue`, or a Suspense retry. A plain `setState` in a handler animates nothing, which is
> why a surface that wants one says so at the call site that changes the state, not only at the
> boundary. Two props keep a boundary to the case it was added for: `update="none"` so that changes
> *within* the surface do not animate it, and `enter="none"` where something else already owns the
> arrival.
>
> Timing for every view transition is set once, from the theme, in `Context/viewTransitionStyles.js` —
> injected through `GlobalStyles` in `AppWrapper.jsx`. A surface inherits it by being wrapped and needs
> no CSS of its own; a named `view-transition-class` is how two surfaces would differ, and none do.
>
> Those global rules are also the only place `prefers-reduced-motion` is honoured. MUI reads the
> preference through `theme.motion.reducedMotion`, which is `"never"`.
>
> Browsers without view transitions — Firefox before 144, Safari before 18 — get the change with no
> animation. React skips the transition silently, so a surface must be correct without it.

### 2. Replacing the last paragraph of § Dialogues in [frontend/technical-rules.md](../../frontend/technical-rules.md)

The paragraph that currently reads "The cost of that rule is the closing transition: a dialogue
disappears at once rather than fading. Opening still animates."

> Opening is MUI's and closing is React's. The shell wraps its `Dialog` in a `<ViewTransition>`, so a
> dialogue whose close runs inside a transition fades out from a snapshot after the shell has already
> stopped rendering it — the rule above keeps its benefit and costs nothing on the way out.
> `useDialogueTrigger` puts its `close` in a transition and its `open` deliberately not. A dialogue
> holding its own open state animates its close by doing the same; one that closes with a plain state
> change disappears at once, which is the shell working as intended rather than a fault.

### 3. Replacing § Navigating fades the incoming page in [frontend/navigation/spa.md](../../frontend/navigation/spa.md)

Heading included — the section is no longer about the incoming page alone.

> ## Navigating animates both pages
>
> `PageTransition` wraps the outlet in a `<ViewTransition>` keyed on the page. The router commits a
> navigation inside a React transition, so the browser snapshots the page being left, and that snapshot
> fades out while the arriving page fades in. Timing comes from the global view-transition rules.
>
> Only the incoming page is rendered — the outgoing one unmounts on the same commit — so a page being
> left releases its effects and document locks on navigation rather than being held alive for the length
> of an animation. The animation runs on a picture of it, which is what makes that possible.
>
> The boundary carries `update="none"`, so a transition *inside* a page — a planner switch, an archive
> restore — does not animate the page around it.
>
> `usePageKey` supplies the key, and it is the **route pattern** (`/editjob/$jobID`), not the resolved
> path. Changing a param — opening a child job from an open one, switching group — updates the page in
> place. Keying on the path instead would treat a param change as a page change and remount the route,
> re-running setup that the route's own effects already handle from their `jobID` / `groupID`
> dependencies.

## Decisions and departures

Where implementing something in [plan.md](./plan.md) showed the plan was wrong, record what was tried,
why it was rejected, and what replaced it — with the tests or the browser pass that made the case.

**Phase 2 times every transition rather than a named class.** [plan.md](./plan.md) § Phase 2 sketched an
`eip-page` view-transition-class carrying its own keyframes. Rejected before it was written, for two
reasons: the class would have shipped in Phase 2 with nothing using it until Phase 3, and it would have
made Phase 3 carry a stylesheet as well as a component change.

Setting the duration and easing on `::view-transition-old(*)` and `::view-transition-new(*)` instead
works because the cascade resolves per longhand: those two properties override the browser's defaults
while its built-in cross-fade `animation-name` stays in place, so no keyframes need restating. A surface
wrapped in `<ViewTransition>` inherits the app's timing without naming anything.

The figures are not a new choice either. `pageTransition.jsx`'s `Fade` passes a `timeout` and no
`easing`, which MUI resolves through `theme.transitions.create` to `easing.easeInOut` — so
`duration.enteringScreen` with `easing.easeInOut` is what the surface being replaced already animates
with, stated explicitly.

A named class stays available for the day two surfaces have to differ. Nothing needs one yet, and one
added before then would be a guess at which pair of surfaces disagree.

**Phase 3 took expression 2, and it needs `update="none"`.** [plan.md](./plan.md) § S1 offered two
expressions and left the choice to the spike. The spike answered it, and the reason is not the one the
plan expected:

Expression 1 — a stable `<ViewTransition>` with the key on the `Box` inside — animates a navigation, but
React reaches that animation through its **update** path rather than through enter and exit, because the
boundary itself never leaves. That has a consequence the plan did not anticipate: a view transition then
runs for *any* transition-lane update inside the page, not only for a navigation. The SPA has four
`useTransition` call sites inside pages — the planner switcher, the archived jobs restore, the lock
header's request-access and the login retry — plus a `startTransition` in the settings layout frame, so
using any of them would have cross-faded the entire page. Adding `update="none"` to expression 1 does
not rescue it: the navigation stops animating too,
which is the proof that React saw the swap as an update all along.

Expression 2 — the key on the `<ViewTransition>` — makes a navigation a boundary leaving and another
arriving, which React distinguishes from an update, so `update="none"` suppresses in-page updates while
the swap still animates. Three tests hold this: a navigation runs exactly one transition, the surface it
animates is the one holding the outgoing page, and a change under the same key runs none. Removing
`update="none"` fails the third and nothing else, which is what makes it load-bearing rather than
decoration.

The measurement was possible because
[`frontend/src/tests/viewTransitions.js`](../../../frontend/src/tests/viewTransitions.js) stands in for
the browser API jsdom does not have. It drives React's update callback and answers the animation
queries React makes afterwards — `document.fonts`, `getAnimations` and `Element.animate` — and it
records which elements React named, both before the DOM changed and after. It proves *that* a transition
ran and *which surfaces* it was applied to. It proves nothing about how it looks, which remains a manual
check.

Two things about reading it. It ignores `<html>`, which React also names while a transition runs as its
own bookkeeping rather than as a surface being animated. And the arrays hold live elements whose names
React clears once the transition finishes, so a name has to be read at capture time — a test that reads
one later finds it empty.
