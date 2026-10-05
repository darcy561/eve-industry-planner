# View transitions — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project puts React's `<ViewTransition>` behind the two places the SPA animates a whole surface
leaving, the page swap and a dialogue's close, and writes down the boundary that keeps everything else
on MUI. **Every phase the plan marks Done is in the code**, with tests, and the three test files that
hold it pass (25 tests, run on their own for this review).

What is left is what `contents.md` says is left: a manual browser pass, which code cannot show, and
the pending splash, which has had no measurement. Promotion has not happened, and until it does two
live documents describe behaviour the SPA no longer has: `frontend/navigation/spa.md` § Navigating
fades the incoming page, and the last paragraph of `frontend/technical-rules.md` § Dialogues.

The thing most worth deciding is reach. Seven dialogues fade out as they close; the event-driven ones,
which are most of them, still vanish. The overlay records that as self-limiting and leaves it there.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1, folder and docs | Done | Present | this folder; `../contents.md:39` | confirmed |
| Phase 2, foundation | Done | One stylesheet from the theme, injected once inside `ThemeProvider`, with the reduced-motion rule | `frontend/src/Context/viewTransitionStyles.js`; `frontend/src/AppWrapper.jsx:45-47`; `Context/viewTransitionStyles.test.jsx` (4 tests) | confirmed |
| Phase 3, S1 page swap | Done, expression 2 with `update="none"` | `<ViewTransition key={contentKey} update="none">` around the page surface; no `Fade` | `frontend/src/Components/pageTransition.jsx:30`; `frontend/src/App.jsx:47-49`; `pageTransition.test.jsx` § what animates the swap (4 tests) | confirmed |
| Phase 3, pending splash | Still open | Open; nothing addresses or measures it | `frontend/src/appRouter.jsx:15` sets `defaultPendingComponent: RoutePending`; no test renders a pending route under the stub | confirmed |
| Router's own option stays off | Neither option set | Neither set | `frontend/src/appRouter.jsx` has no `viewTransition` or `defaultViewTransition` | confirmed |
| Phase 4, S2 dialogue close | Done, a yes; reaches "five" `useDialogueTrigger` dialogues | Shell wraps `Dialog` in `<ViewTransition enter="none" update="none">`; `close` runs in `startTransition`, `open` does not; `if (!open) return null` untouched | `Styled Components/Dialogue/ContentDialogue.jsx:106,293`; `useDialogueTrigger.js:16-17`; `ContentDialogue.test.jsx` § what animates a dialogue (3 tests) | partly |
| Phase 5, boundary drafted | Done, three drafts | Three drafts in the overlay; none promoted | [overlay.md](./overlay.md) § Drafts for live documentation; `frontend/technical-rules.md:90` and `frontend/navigation/spa.md:160` unchanged; no § What animates a surface in the live rules | confirmed |
| Shared test stub | In `frontend/src/tests/` | Present | `frontend/src/tests/viewTransitions.js` (`stubViewTransitions`) | confirmed |
| Done-when: the 32 that stay are still 32 | 32 | 32 sites in 16 files | the grep in [measurements/transition-sites.md](./measurements/transition-sites.md), run today | confirmed |
| Done-when: Vitest passes | Passes | The three files this project owns pass, 25 tests | scoped run of `pageTransition.test.jsx`, `ContentDialogue.test.jsx`, `viewTransitionStyles.test.jsx` | partly |
| Done-when: lint and `format:check` | Pass | Not run (whole-tree checks) | none | unverifiable |
| Done-when: manual pass in two browsers | Outstanding | Cannot be shown from code | none | unverifiable |
| Done-when: promotion | Outstanding | Not promoted | live docs above | confirmed |
| Gap: no MUI transition honours reduced motion | Recorded, not taken | True | `Context/ThemeContext.jsx` sets no `motion.reducedMotion` | confirmed |
| Gap: `withSuspense` has no callers | Recorded | True for `withSuspense` and `suspenseFallback`; false for `loadingSkeleton` | `ContentDialogue.jsx:95,329`; `Dialogues/Market Data/dialogueFrame.jsx:76`, `Dialogues/Price History/dialogueFrame.jsx:65` | partly |

### Discrepancies

- **"Five call sites" is five files and seven dialogues.** `useDialogueTrigger()` is called seven
  times: once each in `Settings/Standard Layout/Job Settings/marketGroupPricing.jsx:135`,
  `Edit Job/Linked Job Badge.jsx:29`, `Purchasing/Standard Layout/Material Cards/materialCardFrame.jsx:35`
  and `Selling/Standard Layout/Linked Transaction Panel/linkedTransactionPanel.jsx:30`, and three times
  in `Dashboard/Components/ItemWatch/ItemWatchPanel.jsx:13-15`. All seven predate the overlay (commits
  of 2026-09-11 and 2026-09-13), so this is a miscount and not drift. The reach is wider than stated.
- **The other dialogue counts have moved.** 24 components now render `<ContentDialogue>` (the plan and
  overlay say 22), and 17 files call `useDialogueEventState` or `useSyncedDialogueEventState` (the
  overlay says 13). Draft 2 does not quote a number, so the drafts are unaffected.
- **`loadingSkeleton` is in use.** The overlay says that if the `withSuspense` branch is a leftover,
  "it and its `suspenseFallback` and `loadingSkeleton` props go". Two dialogues pass `loadingSkeleton`
  on the ordinary path, where the shell uses it at `ContentDialogue.jsx:144,175`. Only `withSuspense`
  and `suspenseFallback` are without callers.
- **The plan's site count is the count before Phase 3.** "33 MUI transition sites across 17 files" in
  [plan.md](./plan.md) § The boundary and in the measurements file is now 32 across 16, because
  `pageTransition.jsx`'s `Fade` was the 33rd. The Done-when figure is right; the standing prose is one
  step behind.
- **Vitest is "partly"** only because the whole suite was not run here, which other in-flight work in
  the tree would make meaningless as a statement about this project.

## What each remaining step changes

Phases 1 to 5 have landed; how each part works now is in [overlay.md](./overlay.md) § How view
transitions are timed, § How the page swap works now and § How a dialogue closes now. Nothing in this
project touches a stored shape or a message. **Wire: none** for every step below.

### The pending splash

**Today.** `RoutePending` is the router's `defaultPendingComponent`, so it renders through the
`<Outlet />` that `App.jsx` wraps:

```jsx
<PageTransition contentKey={pageKey}>
  <Outlet />
</PageTransition>
```

```jsx
<ViewTransition key={contentKey} update="none">
  <Box>{children}</Box>
</ViewTransition>
```

A slow navigation therefore shows the splash inside the keyed boundary and then reveals the page
inside it. [plan.md](./plan.md) § S1 expects that to animate twice. Nobody has measured whether it
does. There is a reason to think it may not: the reveal happens inside a boundary that carries
`update="none"`, which is the prop that already stops in-page transitions animating the page. That is
an inference from how the boundary is configured, not a result.

**After.** One of two outcomes, and the plan allows both: a test showing a pending navigation runs one
transition, with nothing changed; or `exit="none"` on the splash, or the splash moved outside the
boundary, with that test holding it.

**Work.**
1. Add a case to `pageTransition.test.jsx` using `stubViewTransitions`: a key change whose incoming
   content suspends and then resolves, asserting on `started.length`.
2. If it is one, record the measurement in [overlay.md](./overlay.md) § Decisions and departures and
   close the item.
3. If it is two, apply the plan's fix and keep the test.
4. Look at it in a browser during the manual pass either way, with the network throttled.

### The manual browser pass

**Today.** jsdom proves a transition ran and which elements React named. Nothing proves how it looks.

**After.** A recorded pass, in the overlay, over both surfaces in a browser with view transitions and
one without.

**Work.**
1. Page swap: ordinary navigation, a param change under one route (must not animate), a planner switch
   and an archive restore (must not animate the page), Back and Forward.
2. Dialogue close: one of the seven `useDialogueTrigger` dialogues, checking the backdrop leaves with
   the paper; one event-driven dialogue, which should vanish as before.
3. Reduced motion set in the OS: both surfaces swap instantly.
4. A browser without the API (Firefox before 144 or Safari before 18): instant swap, no errors.
5. The untried question the overlay raises: whether naming the outgoing and incoming page alike, so
   the browser pairs them into one group, reads better than two independent fades.

### Promotion

**Today.** `frontend/navigation/spa.md:160-165` says `PageTransition` "fades new content in" with a
`Fade` that no longer exists, and `frontend/technical-rules.md:90` says a dialogue "disappears at once
rather than fading".

**After.** The three drafts in [overlay.md](./overlay.md) § Drafts for live documentation replace
them, and a new § What animates a surface follows § Dialogues.

**Work.**
1. Before folding: correct "five call sites" and the `loadingSkeleton` sentence in the overlay, and
   re-word draft 2 if the reach decision below changes what it should say.
2. Fold the three drafts into the two live files.
3. Run the keep-or-delete grep from `../documentation-rules.md`. Today
   [react-19-idioms](../react-19-idioms/contents.md) does not link into this folder, so nothing holds
   it open.
4. Delete the folder and its row in `../contents.md`.

## Decisions needed

### Whether event-driven dialogues should fade out too

**Question.** Should the closing fade reach the dialogues driven by `useDialogueEventState` and
`useSyncedDialogueEventState`, or stay with the seven that `useDialogueTrigger` drives?

**Why it is James's call.** It is a consistency question about how the app feels, and the overlay
stops short of it on purpose: it calls the current reach "self-limiting rather than deliberate". A
reader today sees some dialogues fade out and most vanish, with nothing on screen to say why.

**Options.**
1. Leave it. No further work; the inconsistency is documented by draft 2 as "the shell working as
   intended".
2. Make the close a transition inside the two event hooks. One edit per hook reaches every dialogue
   that uses them, which matches how the dialogue rules already describe the hooks as the only
   difference between one dialogue and another. It needs the overlay's claim that "only
   `useDialogueTrigger` owns an open flag" re-read, because the event hooks hold `isOpen` in their own
   reducers and a transition around that dispatch is the same mechanism. Risk: 17 files change
   behaviour at once, including the heavy assets, shopping list and price entry dialogues.
3. Opt dialogues in one at a time. Lowest risk, slowest, and it is the per-surface judgement the
   boundary rule was written to avoid.

**Recommendation.** Option 2, proved on one event-driven dialogue first and then landed in the hook,
before promotion so draft 2 can say "a dialogue fades out as it closes" without a list of exceptions.

**Blocked until decided.** The final wording of draft 2, and so promotion.

### How the pending splash is closed

**Question.** Is the pending splash a measurement to take or a change to make?

**Why it is James's call.** `contents.md` names it as one of two things between the project and
promotion and calls it "a decision". The plan offers `exit="none"` or keeping the splash outside the
transition, and neither has been tried.

**Options.** Measure first and change nothing if one transition runs; apply `exit="none"` regardless
as a guard; or move `RoutePending` outside the boundary, which also changes where the login progress
screen sits.

**Recommendation.** Measure first. It is one test with a stub that already exists, and it either
closes the item or says exactly which fix is needed. Moving the splash is the last resort because
`routePending.jsx` deliberately shows login progress on the page the reader asked for.

**Blocked until decided.** Promotion.

### Whether MUI transitions should honour reduced motion

**Question.** Should the theme set `motion: { reducedMotion: "system" }`?

**Why it is James's call.** The overlay records it as a one-line change that alters 32 surfaces and
declines to take it. As things stand the page swap and dialogue close respect the preference and the
snackbar, drawers, accordions and login states do not.

**Options.** Set it in this project before promotion (consistent, and the manual pass already covers
reduced motion); set it as its own small change afterwards; or leave MUI as it is and keep draft 1's
sentence saying the preference is honoured only for view transitions.

**Recommendation.** Set it, as its own change with its own look in a browser, not inside this
project. It is an accessibility fix that stands on its own merits, and draft 1's last paragraph about
reduced motion is then rewritten to say both mechanisms honour it.

**Blocked until decided.** Nothing here; only what draft 1 says.

### What happens to the shell's unused suspense branch

**Question.** Is `ContentDialogue`'s `withSuspense` branch provision or a leftover?

**Why it is James's call.** The overlay hands the question to the dialogue shell's owner. Similar
unused seams in this app are deliberate provision, so it cannot be assumed dead.

**Options.** Keep it and wrap its fallback `Dialog` in the same `<ViewTransition>` so it stays
current; or delete `withSuspense` and `suspenseFallback` and keep `loadingSkeleton`, which two
dialogues use.

**Recommendation.** Delete the two unused props and the branch. Nothing suspends inside a dialogue
because data arrives through React Query's loading state, which is what `loadingSkeleton` serves.

**Blocked until decided.** Nothing.

## Dependencies and order

- **Waits on.** Nothing in another project. React 19.3.0 is in (`frontend/package.json:30-31`), and
  the router commits navigations inside a transition without help.
- **Waits on this.** The two live documents named above, which are wrong until promotion.
  [react-19-idioms](../react-19-idioms/contents.md) Tier 7's lesson, a timer standing in for a
  transition, is now partly answered by this project's `startTransition` in `useDialogueTrigger`; that
  project does not depend on this folder surviving.
- **Not this project's.** The `FirstLoginPage.jsx` step slide and its observer timer stay with
  react-19-idioms, as both projects say.
- **Recommended next slice.** The pending-splash test, since it is the only remaining code question
  and takes an hour. Then the reach decision and, if it is option 2, the hook change on one dialogue.
  Then the manual pass over everything at once, the overlay corrections, and promotion.
