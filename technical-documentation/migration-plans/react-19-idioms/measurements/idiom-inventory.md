# The rest of the idioms table, as swept

The effects are counted separately in [effect-inventory.md](./effect-inventory.md). This file covers
every other row of [`../../frontend/technical-rules.md`](../../../frontend/technical-rules.md)
§ React 19 idioms, plus the adjacent modern-React surface, and records what was found clean as well as
what was not — so the sweep does not have to be repeated to find that out.

## Totals

| Shape | Sites | Tier |
|-------|-------|------|
| Store read during render with no subscription | 4 | 6 |
| A timer standing in for a transition | 0 | 7 |
| Context on the React 18 spelling | 2 contexts, 2 files | 8 |
| Hand-rolled pending state | 2 | 9 |
| Imperative handle from `useLayoutEffect` | 1 | 10 |
| **Total to change** | **9** | |

Five of the fourteen counted have been resolved by work outside this project — both of Tier 7, two of
Tier 6, and one of Tier 9. § What has been re-verified says which, and what that does to the defects.

---

## Tier 6 — store reads that take no subscription (4)

A component calls a Zustand action **in its render body** through `useUsersStore.getState()` and uses
what comes back. `getState()` reads the store once and subscribes to nothing, so the component does
not redraw when that value changes. It renders whatever was there the first time and then goes quiet.

This is not the same as destructuring an *action* through `getState()`, which around twenty component
files do and which is correct — actions are stable, and reading them that way deliberately avoids a
subscription. The distinction is whether what comes back is a function to call later or a value to
render now.

**The shape that is right is already in the tree.**
`Components/Dashboard/Components/ItemWatch/ItemRow.jsx` destructures `findMarketData` through
`getState()` **and** subscribes with `useUsersStore((state) => state.worldData.marketData)` on the
line above, so it redraws when prices land and then calls the action fresh. The four below do the first
half without the second.

| # | Call site | What it reads | Why it matters |
|---|-----------|---------------|----------------|
| 6.3 | `Components/Groups/Breakdown/itemFrame.jsx:35` | `getActiveGroupObject()` | The read behind **defect D1**. The effect's empty dependency array is the second half of the same bug — neither the read nor the effect notices the group changing |
| 6.4 | `Components/Groups/Breakdown/breakdownframe.jsx:18` | `getActiveGroupObject()` | Same read, the parent of 6.3. Take the two together |
| 6.5 | `Components/Edit Job/Edit Job Components/Selling/LayoutSelector.jsx:13` | `getMainCharacterHash()` | Changes rarely, so unlikely to be seen. Same shape, low risk — correct it while in the file |
| 6.6 | `Components/Edit Job/.../Linked Transaction Panel/addCustomTransaction.jsx:27` | `getMainCharacterHash()` | As above |

6.1 and 6.2 were the market-price reads in `marketCostsPanel.jsx` and `addMaterialCosts.jsx`, and they
were **defect D4**. Both are resolved — see § What has been re-verified.

## Tier 7 — a timer standing in for a transition (0)

Both sites are gone. They were the 800ms `setTimeout` before linking and unlinking an ESI industry
job, in `linkedJobs.jsx` and `availableJobs.jsx`, and they were **defect D5**. See § What has been
re-verified.

The lesson the tier was written around still holds and is worth carrying to the next one of these: a
hand-run timer beside a transition is the transition's own callback written out longhand, which the
closed [effect-state-sync](../../effect-state-sync/contents.md) project also concluded about the
tutorial card.

## Tier 8 — context on the React 18 spelling (2 contexts)

| # | Context | Sites |
|---|---------|-------|
| 8.1 | `JobTreeInteractionContext` | `useContext` at `Styled Components/JobTreeFlow/JobDependencyNode.jsx:25`; `<…Provider>` at `Styled Components/JobTreeFlow/JobDependencyTreeFlow.jsx:226` and `:297` |
| 8.2 | `PLANNER_DRAG_DATA_CONTEXT` | `useContext` at `Context/PlannerDnDProvider.jsx:57`; `<…Provider>` at `:148` and `:187` |

`use()` to read, `<Context>` as the provider. These two are the only reason `use()` appears nowhere in
the SPA, so this tier is also what puts the idiom in the tree for the first time.

## Tier 9 — hand-rolled pending state (2)

| # | Call site | What it does | Note |
|---|-----------|--------------|------|
| 9.1 | `Components/Accounts/AdditionalAccounts.jsx:70` | `isProcessing` guards an async account-import popup flow, set true on entry and false on both exits | `useTransition` |
| 9.2 | `Components/Settings/Standard Layout/Custom Structures/CustomStructuresForm.jsx:19` | `isLoading` prop-drilled into `structureForm.jsx` as `setIsLoading` | `useTransition`, and the drilled setter goes with it |

9.3 was the same pending state in a first-login file that looked like 9.2 written twice. It was, and it
has since been consolidated — see § What has been re-verified.

The tree already uses these idioms in six places — `useActionState` in the crash report and archive
dialogues, `useOptimistic` in the layout settings frame, `useTransition` in the planner switcher, the
archived jobs list and the lock header control — so the shape is established and these two are
simply older.

## Tier 10 — an imperative handle from `useLayoutEffect` (1)

`Styled Components/autocomplete/virtualisedListbox.jsx:39` writes a `scrollToIndex` object onto a ref
handed in as a prop, inside the SPA's only `useLayoutEffect`, and clears it on cleanup.

`useImperativeHandle` is exactly this and says so at the call site. Worth noting the component already
takes `ref` as an ordinary prop, which is the React 19 shape — only the publishing is old.

This is the one finding the effect inventory could not have contained: it counted `useEffect` only.

---

## Swept and clean

Recorded so this does not get swept again. Each was checked across `frontend/src` at the same time as
the effect count.

| Idioms table row | Finding |
|------------------|---------|
| `ref` as an ordinary prop, over `forwardRef` | **No `forwardRef` anywhere.** `virtualisedListbox.jsx` already takes `ref` as a prop |
| `use()` for a promise or context | Only the two contexts in Tier 8; no promise is read in render, and none should be — data comes from React Query |
| `useActionState` / `useOptimistic` / `<form action>` | **No `<form>` with `onSubmit` in the SPA at all.** The three in Tier 9 are button flows, not forms |
| `useDeferredValue` / `useTransition` over debounce timers | **No debounce timer guards a render.** Every timer site read was a lock lease, an animation, a popup grace period, or Tier 7 — which has since gone. The count is re-derived by Phase 10 rather than restated here |
| Document metadata rendered in a component | **No `document.title` write anywhere.** Titles come from `index.html`; per-route metadata is an opportunity, not a failure |
| Derive during render | Covered by the effect inventory's Tier 1, and by Tier 6 above |

Adjacent surface, also clean:

- **No class components, `PropTypes`, `defaultProps`, `createRef`, `useImperativeHandle` misuse,
  string refs, or `ReactDOM.render`.** One `import ReactDOM from "react-dom/client"` in `index.jsx`,
  which is correct.
- **No `fetch` or `axios` under `Components/`, `Hooks/`, `Styled Components/` or `routes/`.** React
  Query is the only data path.
- **No raw MUI `Dialog` parts outside `tests/muiStyleProps.test.jsx`.** All 29 dialogues are built on
  `ContentDialogue`, as the frontend rules require.
- **Error boundaries are `react-error-boundary`**, not hand-written classes — `ErrorBoundary.jsx` and
  `ContentErrorBoundary.jsx`.
- **Tests are colocated.** 345 `*.test.js(x)` sit beside the module they cover; `src/tests/` holds
  only shared harnesses and fixtures.
- **Dependencies are current**: React and React DOM 19.2.8, MUI 9.4, TanStack Query 5.102, TanStack
  Router 1.170, Zustand 5.0, Vite 8.2, `eslint-plugin-react-hooks` 7.1. React 19.3.0 has since been
  published and the SPA is one minor behind; the bump is not this project's, and nothing counted here
  depends on it.

## The two defects found here, and where they went

**D4 — a price panel that did not follow the price.** `marketCostsPanel.jsx` and
`addMaterialCosts.jsx` read market data during render through `getState()`, which subscribes to
nothing, so a panel rendered before the fetch landed kept the figure it first saw. **Resolved.** Both
panels now call `useMarketPricesQuery(wants)` and read each figure with `readMarketPriceForType`, which
is the contract in
[market-price-delivery/overlay.md](../../market-price-delivery/overlay.md) — the query notifies, the
read is synchronous. No `getState()` remains in either file.

**D5 — a mutation that outlived the component.** `linkedJobs.jsx` and `availableJobs.jsx` delayed
linking or unlinking a job by 800ms for an animation and never cleared the timer, so navigating away
inside that window still mutated `state.activeJob` and dispatched. **Resolved.** Both files moved to
`Edit Job Components/Building/StandardLayout/Tab Panel/` and were rewritten onto `IndustryRunList`,
whose `onSelect` runs the reducer action directly. No `setTimeout` remains in either file, and there is
no 800ms animation delay anywhere in `frontend/src`.

## What has been re-verified

Every site in this file was re-read against the tree; the four resolved ones are recorded in their own
tiers above, with the detail in the section on the defects. The re-reading was prompted by finding
Tier 7's two call sites gone, and its lesson is worth stating for whoever picks this up: **an inventory
entry is a reading of a file at a moment, and this tree moves.** Confirm a site still exists before
planning a phase around it.

What the four resolutions have in common is that none of them came from this project — the market
panels were fixed by the market-price work, and the two Tier 9 files by whoever consolidated
`CustomStructuresForm`. That is the tree converging on the idioms as files are touched, which is what
the frontend rules ask for and what this project exists to finish rather than to own alone.

Also worth carrying: 9.3's suspicion was correct. The first-login and settings panels **were** one
panel written twice, and they are now one component,
`Components/Settings/Standard Layout/Custom Structures/CustomStructuresForm.jsx`, rendered by both
`Components/Settings/settingsPage.jsx` and
`Components/First Login/planner-setup/FirstLoginPlannerSetupStep.jsx`. The duplicated source of truth
was the finding, exactly as the tier said, and the pending state survives in the one remaining copy as
9.2.

Two kept effects have also gone, and are recorded in
[effect-inventory.md](./effect-inventory.md) § What has been re-verified rather than here.
