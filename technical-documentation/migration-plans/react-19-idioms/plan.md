# React 19 idioms — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for every surface this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../frontend/documentation-rules.md`](../../frontend/documentation-rules.md).
Phase 1 (project folder and docs) before any product work.
No Go surfaces are in scope, so `go fix -diff` does not apply.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Take the SPA to the React 19 idioms its own rules already require, row by row of the table in
[`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) § React 19 idioms — and have
a recorded verdict for every site, including the ones that should stay as they are.

The frontend rules say the 18→19 migration happens as files are touched, **and not as a sweep unless a
sweep is asked for**. This project is that ask. It exists so the sweep has an order, a per-site
verdict, and a bar for what counts as done.

## Starting position

The tree is in better shape than the count of effects suggests, and the sweep's first result is worth
stating before its findings: **effects are almost the whole of the gap.** There is no `forwardRef`
anywhere, no class component, no `PropTypes` or `defaultProps`, no `document.title` write, no `<form>`
with an `onSubmit`, no dialogue built from raw MUI parts, no data path outside React Query, and every
dependency is current. All of that is recorded in
[measurements/idiom-inventory.md](./measurements/idiom-inventory.md) § Swept and clean so nobody
sweeps it again to find out.

### The effects — 93 call sites

Every one read at its call site; the reading is
[measurements/effect-inventory.md](./measurements/effect-inventory.md).

| | Count |
|---|---|
| In test files — out of scope | 3 |
| Kept: synchronising with something outside React | 48 |
| To change (Tiers 1–5) | 35 |
| Deferred to the shopping list redesign | 7 |
| **Total** | **93** |

Forty-eight is the number that matters most. This is not a tree drowning in effects; it is a tree where
slightly over a third of them are doing something else, in five shapes rather than thirty-five
separate puzzles. The document lock alone accounts for 21 of the kept, every one attached to a
websocket, a timer, a listener or a lease.

### The rest of the table — 9 sites

Counted in [measurements/idiom-inventory.md](./measurements/idiom-inventory.md).

| Shape | Sites | Tier |
|-------|-------|------|
| Store read during render with no subscription | 4 | 6 |
| A timer standing in for a transition | 0 | 7 |
| Context on the React 18 spelling | 2 contexts | 8 |
| Hand-rolled pending state | 2 | 9 |
| Imperative handle from `useLayoutEffect` | 1 | 10 |

### Three defects

None of them found by a lint rule; all found by reading. Each is a bug on its own merits rather
than a consequence of the idiom.

Two more were counted and have since been fixed outside this project: **D4**, the price panels that did
not follow the price, and **D5**, the mutation that outlived the component. Both verdicts and what
replaced them are in [measurements/idiom-inventory.md](./measurements/idiom-inventory.md) § The two
defects found here, and where they went.

1. **D1 — the group breakdown never updates.** `Groups/Breakdown/itemFrame.jsx` computes five totals
   into state under an empty dependency array, from a store read taken with `getState()`. Neither half
   notices the group's jobs changing. A reader watching the breakdown while costs move sees the
   figures the panel had on mount.
2. **D2 — the reprocessing panel destroys the reader's clipboard.**
   `Reprocessing/advancedMineralOutput.jsx` finds out whether it may write to the clipboard by writing
   the literal string `test` into it, on every mount.
3. **D3 — a leaked interval on the new-group path.** `Groups/New Group/newGroupPage.jsx` returns a
   cleanup function from a `Promise` executor, where nothing calls it. Its 1-second poll leaks
   whenever the 10-second timeout wins the race — the path that also navigates away.

## Relationship to the closed effect-state-sync project

[effect-state-sync](../effect-state-sync/contents.md) asked a narrower question: the React Compiler's
`set-state-in-effect` rule flagged 21 places, and that project decided what to do about them. All 21
are resolved and its findings are promoted. **Its verdicts stand and are not reopened here.**

What this project adds is the rest of the tree. `set-state-in-effect` only sees an effect that calls a
setter, so it never flagged an effect that fetches, one that writes to the Zustand store, one that
mutates the active job in place, one that navigates, or one that fires analytics — and it saw none of
Tiers 6–10 at all.

Two things to carry forward from it:

- **`useHasChanged` already exists** and five places use it. Tier 1 is mostly a matter of reaching for
  it rather than designing anything.
- **Characterisation test first, every time.** That project found a test written *after* a change
  passing against a predicate that could not tell the two states apart. Same order here.

## Phases

### Phase 1 — this folder (gate)

Project folder, `contents.md`, this plan, both inventories, the overlay scaffold, and a row on the
[section task map](../contents.md). No product work.

**Done.**

### Phase 2 — the three defects (3 sites)

Fixed first and separately from the idiom work, because each is user-visible today and none should
wait behind a conversion.

- **D1** is fixed *by* its Tier 1 rewrite together with its Tier 6 read — computing during render from
  a subscribed value is what makes it current — so `itemFrame.jsx` comes out of both tiers and lands
  here, with `breakdownframe.jsx` (6.4) beside it since they share the read.
- **D2**: the clipboard probe stops being destructive. Small on its own; the Tier 3 conversion of that
  file still happens later, in Phase 5.
- **D3**: the interval is cleared on both arms of the race, in place. The Tier 4 rewrite still happens
  later, in Phase 6, and is much larger.

Three sites in total: `itemFrame.jsx`'s effect from Tier 1, and findings 6.3 and 6.4 from Tier 6. D2
and D3 are fixes made inside files whose own effects are counted in Phases 5 and 6, so they add no
site here. Every one is counted once — the phases below sum with these to 44, which is the 35 effects
plus the 9 other sites.

### Phase 3 — Tier 1: derive during render (9 sites; the tenth is `itemFrame`, in Phase 2)

The copies and the mirrors. Each costs a frame: the effect runs after paint, so the first frame
carries the previous value. `useHasChanged` covers most; two want no state at all.

Smallest diffs in the project and the ones that most directly remove a visible wrong frame.

### Phase 4 — Tier 2: write at the write site (10 sites)

Effects that correct or copy state immediately after something else wrote it — a persist-to-storage
after the setter, a normalisation after the reducer, a query result copied into the store, the active
job mutated from cached ESI data.

The two `localStorage` mirrors are near-trivial. The three that mutate `activeJob` are the delicate
ones and want reading against `planning-stage-panels/` first, because that project owns what the
reducer may be handed. This tier also carries the sweep's one duplicated source of truth:
`assetLibraryView.jsx:116` and `Dialogues/Assets/dialogueContent.jsx:81` are byte-identical.

### Phase 5 — Tier 3: React Query (9 sites)

Async calls hand-run on mount, each with its own loading flag and cancellation boolean. One dialogue
or page at a time — the largest diffs after Tier 4's `newGroupPage`.

`useEditJobInitialState.js` and `groupFrame.jsx:97` are the two big ones and go last within the tier,
after the smaller conversions have established the shape. Read `job-document-drafts/` before the
first of those: that project is reshaping what an open job is held as, and converting this twice
would be easy to arrange by accident.

### Phase 6 — Tier 4: routing (3 sites)

Defaults applied by rendering and then redirecting, and page work done on mount that belongs to the
route. TanStack Router's `validateSearch` and loaders own both. `newGroupPage.jsx` is most of the work.

### Phase 7 — Tier 5: analytics from the handler (3 sites)

`trackAppEvent` fired from an effect behind a ref latch, where the handler that caused the transition
could fire it directly. Cheapest tier and least valuable; do them while already in those files, which
Phases 3–6 arrange for all three.

### Phase 8 — Tiers 6 and 9: subscriptions and pending state (4 sites)

The two remaining store reads — 6.5 and 6.6, the main-character-hash reads — and the two remaining
hand-rolled pending flags. Phase 2 takes 6.3 and 6.4; 6.1 and 6.2 were D4 and are resolved.

The duplicated panel behind 9.2 and 9.3 has already been consolidated into one `CustomStructuresForm`,
rendered from both the settings page and the first-login step, so what is left is the pending state in
that single component.

### Phase 9 — Tiers 8 and 10: context and the imperative handle (3 sites)

`use()` and `<Context>` for the two contexts, and `useImperativeHandle` for the virtualised listbox.
Self-contained, no behaviour change intended, and the first use of `use()` in the SPA.

### Phase 10 — close out

Re-run both counts, confirm nothing new arrived, write the overlay, and decide what the deferred seven
look like once the shopping list redesign has landed.

## Done when

- Every one of the 35 effects and 9 other sites is resolved, or carries a recorded and reasoned
  exception in its inventory. A site resolved by work outside this project counts, and says so in its
  inventory entry.
- Each changed file carries a characterisation test written **before** the change, and each test was
  confirmed to fail against a deliberately broken version of the fix.
- The three remaining defects are fixed and the overlay says what a reader sees differently.
- `npm run lint` and the Vitest suite pass, and no `react-hooks/exhaustive-deps` suppression was added
  without a reason written on it.
- Both counts are re-run and the inventories' figures still describe the tree.
- Promotion is approved, the overlay is folded into the live frontend documentation, and this folder
  is deleted.

## Out of scope

- **The shopping list's seven effects.** Two ~150-line effect state machines with `lastProcessedRef`
  bookkeeping to stop themselves re-firing, plus the dialogue content that feeds them — by a wide
  margin the worst in the tree. That logic is moving into the reducer under its own redesign;
  rewriting it here would be doing the work twice and would fight the redesign. Phase 10 re-reads them
  once that lands.
- **The 21 findings owned by [effect-state-sync](../effect-state-sync/contents.md)**, including the
  two it decided to leave alone.
- **Turning the React Compiler on.** This work is a prerequisite for asking that question, not an
  attempt to answer it.
- **The 43 `react-hooks/exhaustive-deps` warnings** the SPA carries. They overlap this work without
  matching it — many sit on `useMemo` and `useCallback` — and a narrow dependency list in this tree is
  usually deliberate, so completing one is a behaviour change wearing a lint fix's clothes. Fix only
  those in files this project is already rewriting.
- **Per-route document metadata.** React 19 renders `<title>` and friends from a component, and the
  SPA sets neither today. That is a feature nobody has asked for, not an idiom failure, and it is out
  of scope here.
- **The ~20 component files that destructure a Zustand *action* through `getState()`.** Actions are
  stable and reading them that way deliberately avoids a subscription; only reading a *value* that way
  is the Tier 6 finding.
- **Effects in test files** — `pageTransition.test.jsx` and `tests/editJobHarness.jsx` — which exist
  to observe renders, the one thing an effect is uniquely able to do.
