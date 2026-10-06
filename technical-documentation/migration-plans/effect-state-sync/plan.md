# Effect-driven state synchronisation — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for the surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md).
Phase 1 (project folder and docs) before any further product work.
No Go surfaces are in scope, so `go fix -diff` does not apply.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Decide whether the components that keep a copy of something in state, synchronised by an effect,
should each be corrected where they stand or whether the area wants a different shape — and have the
evidence to say which.

The question is not whether the individual findings can be fixed. Three already have been, and each
took a characterisation test written first because none of the files had one. The question is whether
working through the rest one file at a time is the right use of the effort, or whether the count is
telling us something about how state is held in this part of the SPA.

## Starting position

The SPA's lint bar includes `react-hooks`, which carries the React Compiler's rules. Those rules
flagged 21 places where state is set inside an effect. **All 21 are resolved**, each with tests
written before the change to the file it was in.

The findings are not one problem — they are several shapes sharing a lint rule. Every one is listed,
grouped and given a verdict in [measurements/inventory.md](./measurements/inventory.md); Phase 2 below
carries what that reading found.

**Process note.** The three resolved findings were done before this project existed, as part of
clearing the lint backlog. They are recorded in [overlay.md](./overlay.md) because they changed what a
reader sees, and this project exists to decide what happens to the rest. Phase 1 gates the *remaining*
work, not what preceded it.

## Phases

### Phase 1 — this folder (done when merged)

Project folder, `contents.md`, this plan, the overlay carrying what has already changed, the finding
inventory, and a row on the section task map. No product work.

### Phase 2 — read the eighteen — **done**

Every finding read at its call site and given a verdict in
[measurements/inventory.md](./measurements/inventory.md). No code changed.

**Twelve of the eighteen were corrections in their own file** (one of them has since been made). The
other six are not eighteen problems but two mechanisms plus one misplaced fetch:

- **A signal sent by bumping a counter**, in three places: the job tree dialogue and the group job
  tree both bump a session counter so the tree below re-runs a fit, and the tree itself unpacks that
  composed key back into an id. The state carries no value — it is a message — so removing it is a
  question about how that message is sent, not about the effect.
- **The price entry rows**, in two places: unconfirmed entries are *seeded* rather than derived, and
  then edited by the reader, so they cannot simply be computed while rendering. The second of the two
  clears them on a trigger counter — the same signal mechanism again.
- **One fetch**, in `itemWatchContainer.jsx`, whose loading flag exists because the fetch is hand-run
  in an effect. The frontend rules already say that belongs in React Query.

Reading also turned up one finding that genuinely misbehaves, though not in the way the rule is
about: `CharacterSelection.jsx` re-selects every character whenever the character array is rebuilt
and the current selection is empty, so a reader who deselected everyone has the lot re-selected under
them.

### Phase 3 — decide — **settled for the commonest shape**

The answer to the question this project was opened to ask:

**No broad refactor.** Two thirds of the findings are corrections where they stand, each in its own
file.

**The commonest shape is now one hook — settled and done.** A value that follows another was being
brought into step by hand in four places, each with its own `seen`/`setSeen` pair, and four more of
the verdicts called for the same thing. That is `useHasChanged` in `frontend/src/Hooks/`: it answers
whether a value moved since the last render, and the caller writes its own update so what is being
set stays at the call site. Five places use it.

Its answer is only true for the render it fires on, and that render is replaced by the one the update
causes — so it cannot be read afterwards, only acted on in the moment. Worth knowing before reaching
for it, and the reason its tests observe each render rather than the settled value.

**The counter-bump signal is settled.** A parent that wants the tree below it to focus a job passes
the request as a value — the job, and what tells two asks for the same job apart — rather than raising
a counter the tree reads as a poke. The dialogue keys its request on the opening it came from; the
group page has no key to give, and needs none: the job to focus arrives in the route search, and
every path that sets it crosses back from the job page, so the tree is mounted afresh for each
request. (What makes that safe is the mount boundary, not the navigation that clears the search
param afterwards — a future path that changed the param without remounting would need an `at`.)
Neither keeps a counter now, and the tree acts on the request changing instead of unpacking a
composed string twice.

**The defect is fixed**, on its own merit rather than as lint work. See the overlay.

Done.

### Phase 4 — do the agreed work

Only after Phase 3. Each file gets a characterisation test before it is changed, because none of them
has one and the previous round showed why that order matters: a test written after the change passed
against a predicate that could not tell the two states apart.

**Every *correct in place* finding is done, and so is the fetch.** The watchlist's prices are a
React Query call now, behind `useMarketPricesQuery` in `Hooks/React Query/World/` — the shopping
list dialogue fetches prices the same way by hand and is the obvious second caller, though it is not
one of this project's findings.

The price entry rows were the last of them, and they answered the seeded-and-edited question the
inventory raised: the entry a reader types into still cannot be derived, but it can follow *what is
left to price* rather than the identity of the list it was read from. Its sibling finding turned out
not to be a signal question at all — Confirm All wrote into the entries array in place, which is why
it had to announce itself with a counter, and writing a new array the way the clipboard-import path
beside it already did removed the need.

The group name panel's two findings are done. Its second one did not end up where Phase 2 said it
would, and the reason is recorded with the verdicts: a copy that is only read while an editor is
open wants seeding when the editor opens, not keeping in step the rest of the time. Worth carrying
into the remaining files — ask what reads the copy before deciding what has to keep it current.

The edit job page's two are done as well. They were one effect written twice, and came out as a
hook — `useIsScrolledOutOfView` — that owns the observer behind a ref, so nothing has to set state
to answer "is that control still on screen". The floating buttons it served, and the hook with them,
were later deleted by [planning-stage-panels](../planning-stage-panels/plan.md) § Stage Q.

The tutorial card and the dashboard row it sits in went together, because they are two halves of
one fade: the card now leaves the timing to MUI's `Fade`, and the row is taken back on the reader
wanting help rather than on the card letting go. Worth carrying into the remaining files — a
hand-run timer beside a transition is the transition's own callback written out longhand.

The price history chart's window went the way Phase 2 said, with one addition: the effect also reset
the window when the page crossed the phone breakpoint, so the guard carries the window size beside
the series identity. Its opening window is now the state's initial value rather than something
corrected after the first render — worth looking for elsewhere, since a state seeded with a
placeholder and put right in an effect is the same finding wearing different clothes.

Done.

## Done when

- Every one of the remaining findings is either resolved or carries a recorded, reasoned exception.
- The refactor question has an answer with evidence behind it, not an impression.
- The overlay describes the behaviour a reader sees today across every file this project touched.
- Promotion is approved, the overlay is folded into live frontend documentation, and this folder is
  deleted.

## Out of scope

- Turning the React Compiler on. It is not enabled, and this work is a prerequisite for that question
  rather than an attempt to answer it.
- **The Edit Job reducer's in-place mutation of `state.activeJob`.** Out of scope here, and since
  done separately on its own ask: the components that wrote into the job they were handed now say
  what changed and the reducer rebuilds it. Live behaviour, not promoted through this project.
- The props shape of the Planning stage panels and what re-renders on a dispatch.
- **The SPA's dialogue kit.** The parent job dialogue's finding was resolved by deriving its list
  while rendering, and separately — on its own ask — the shared dialogue shell gained a
  component-driven hook and the rule that nothing is built until a dialogue is open. That is not
  this project's work and is not promoted through it: it is live behaviour already, written up in
  [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) § Dialogues.
