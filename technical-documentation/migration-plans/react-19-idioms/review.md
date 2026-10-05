# React 19 idioms — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project sweeps the SPA against the idioms table in
[`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) § React 19 idioms: every
`useEffect` given a verdict, plus four smaller shapes. **It is at Phase 1 and nothing else.** The plan
says so, the overlay says "Nothing has changed yet", and the code agrees: all three defects are still in
the tree exactly as described, and every Tier 1 to Tier 5 site that the inventory names is still an
effect.

The inventories are honest about having drifted, and their own reconciliation reproduces exactly today
(93 effects outside tests = 89 inventoried, less 2 gone, plus 6 never counted). What they do not yet
say is that one Tier 9 site has gone, that `use()` is already in the tree, and that three more
render-body store reads have the Tier 6 shape.

Two things need attention before anything else. Phase 2's three defects are user-visible and unowned
by any other project, so they are the next slice. And the seven shopping-list effects are deferred to
a redesign that no project in `migration-plans/` is scoped to do, so Phase 10 cannot close as written.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1, folder and docs | Done | Folder, `contents.md`, plan, both inventories, overlay scaffold, section row | `../contents.md:38`; this folder | confirmed |
| Phase 2, D1 group breakdown | Open | Unfixed | `frontend/src/Components/Groups/Breakdown/itemFrame.jsx:34-76`: `getState()` read, effect with `[]` deps writing `breakdownStats` | confirmed |
| Phase 2, D2 clipboard probe | Open | Unfixed | `frontend/src/Components/Reprocessing/advancedMineralOutput.jsx:42-52`: `navigator.clipboard.writeText("test")` on mount | confirmed |
| Phase 2, D3 leaked interval | Open | Unfixed | `frontend/src/Components/Groups/New Group/newGroupPage.jsx:104-118`: `clearInterval` returned from a `Promise` executor | confirmed |
| Phase 3, Tier 1 (9 + `itemFrame`) | Open | All ten sites present | e.g. `Hooks/DocumentLock/useDocumentLockHeld.js:26`, `Components/Groups/Scheduler/CharacterSelection.jsx:57`, `Components/Dialogues/Price Entry/itemRow.jsx:92` | confirmed |
| Phase 4, Tier 2 (10) | Open, 10 sites | 9 present; 2.9 gone | `Hooks/EveEsi/useLocationNames.js` has no `useEffect`; the other nine still do | partly |
| Phase 5, Tier 3 (9) | Open | All nine present, plus one uncounted effect of the same shape | `Hooks/App/useStaticDataBuildVersion.js:7` … `Edit Job Hooks/useEditJobInitialState.js:19`; uncounted: `Planning/Standard Layout/Materials And Sourcing/materialsAndSourcingPanel.jsx:106` | partly |
| Phase 6, Tier 4 (3) | Open | All three present | `Blueprint Library/BlueprintLibrary.jsx:29`, `newGroupPage.jsx:26`, `Auth/Hooks/useAfterLoginStepNavigation.js:17` | confirmed |
| Phase 7, Tier 5 (3) | Open | All three present | `Dialogues/Blueprint Archive/dialogueFrame.jsx:48`, `Dialogues/Job Tree/JobDependencyTreeDialogue.jsx:175`, `Groups/groupFrame.jsx:114` | confirmed |
| Phase 8, Tier 6 (6.5, 6.6) | Open, 2 sites | Both present; three more reads of the same shape are uncounted | `Selling/LayoutSelector.jsx:11-13`, `Linked Transaction Panel/addCustomTransaction.jsx:25-27`; uncounted below | partly |
| Phase 8, Tier 9 (9.1, 9.2) | Open, 2 sites | 9.2 present; 9.1 gone | `Settings/Standard Layout/Custom Structures/CustomStructuresForm.jsx:19,45,55` and `structureForm.jsx:73,212`; `Components/Accounts/AdditionalAccounts.jsx` holds no pending state | overstated |
| Phase 9, Tier 8 (2 contexts) | Open; "the first use of `use()` in the SPA" | Both contexts still on the 18 spelling; `use()` is already in the tree | `Styled Components/JobTreeFlow/JobDependencyNode.jsx:25`, `JobDependencyTreeFlow.jsx:226,297`, `Context/PlannerDnDProvider.jsx:57,148,187`; `Context/ThemeContext.jsx:12,222,255` | partly |
| Phase 9, Tier 10 (1) | Open | Present | `Styled Components/autocomplete/virtualisedListbox.jsx:39`; no `useImperativeHandle` in `frontend/src` | confirmed |
| Phase 10, re-count | Open, "real reading in it" | The recorded gap reproduces exactly | 96 `useEffect(` in `frontend/src`, 3 in tests, 93 outside | confirmed |
| Tier 7, timer for a transition | 0 sites | None | No 800ms timer; the only `800` beside a transition is `<Fade timeout={800}>` at `Job Planner/Planner Components/massBuildInfo.jsx:105` | confirmed |
| D4 and D5 resolved elsewhere | Resolved | Resolved | `marketCostsPanel.jsx:32,89,95` and `addMaterialCosts.jsx:46,48` use `useMarketPricesQuery` and `readMarketPriceForType`, no `getState()` | confirmed |
| Swept and clean | No `forwardRef`, class component, `PropTypes`, `defaultProps`, `document.title`, `<form onSubmit>` | None found | grep over `frontend/src` returns nothing for any of them | confirmed |
| Deferred, shopping list (7) | Waits on "its own redesign" | Seven effects present; no project owns the redesign | `Dialogues/Shopping List/Hooks/useShoppingListCharacterAssets.js:45,51`, `useShoppingListCorporationAssets.js:42,88,260`, `ShoppingListDialogueContent.jsx:53,65`; `../reprocessing-rebuild/plan.md:1095`, `../contents.md:29` | overstated |
| Three Tier 2/3 sites die with reprocessing Stage G | Stage G "not scheduled" | Stage G has not landed; all three files exist | `Reprocessing/Hooks/useAutoRecalculation.js:55`, `advancedMineralOutput.jsx:42`, `reprocessingStructurePanel.jsx:35` (file modified in the working tree, effect unchanged) | confirmed |
| 43 `exhaustive-deps` warnings | 43 | Not re-run (a whole-tree lint) | none | unverifiable |
| React 19.3.0 in the SPA | 19.3.0 | 19.3.0 | `frontend/package.json:30-31`, `package-lock.json:7394,7403`; the uncommitted `package.json` change adds `yalps` only | confirmed |

### Discrepancies

- **Tier 2 is nine sites, not ten.** The inventory's own § What has been re-verified already says 2.9
  was carried out by other work; the tier total and the plan's Phase 4 heading still say 10.
- **Tier 9 is one site, not two.** 9.1's `isProcessing` no longer exists. `AdditionalAccounts.jsx` was
  cut to 80 lines and reads `isLinking` from `Components/Accounts/useLinkCharacter.js:66`, which is a
  module-level flag read through `useSyncExternalStore` so that every caller of the hook shares one
  in-flight sign-in. That is not the `useTransition` the verdict asked for; see § Decisions needed.
- **`use()` is not new to the tree.** `Context/ThemeContext.jsx` reads with `use(ThemeContext)` and
  provides with `<ThemeContext value={value}>`. Phase 9 still has two contexts to convert, but it is
  following a shape that exists, not introducing one, and the idiom inventory's "the only reason
  `use()` appears nowhere in the SPA" is wrong.
- **Three render-body reads have the Tier 6 shape and are not counted.** Each takes
  `getActiveGroupObject` through `getState()` and calls it while rendering, with no subscription to
  `jobData.groupArray` or `activeGroupID`:
  `Groups/Accordion/Classic View/ClassicGroupJobCardFrame.jsx:85`,
  `Groups/Side Menu/Buttons/buttonFunctions.jsx:67`, and `Groups/Group Name/groupNameFrame.jsx:31`.
  `Zustand/jobsSlice/groupManagement.js:169` shows the action does a `find` over `groupArray`, so what
  comes back is a value. Whether any of them is visibly stale depends on what else re-renders them;
  that reading has not been done.
- **The six uncounted effects are five keeps and one finding.** Read here, since the inventory names
  them without a verdict:

  | Site | What it does | Verdict |
  |---|---|---|
  | `Components/Edit Job/editJob.jsx:94` | `endEditSession()` on unmount | Kept, unmount-only cleanup |
  | `Edit Job Components/Building/StandardLayout/Tab Panel/industryRunList.jsx:102` | Clears the leaving-row timers on unmount | Kept, timer cleanup |
  | `Styled Components/Item/marketActions.jsx:50` | Clears the close timer on unmount | Kept, timer cleanup |
  | `Components/Edit Job/Edit Job Hooks/useJobDeletedRemotely.js:17` | `window` listener for `JOBS_DELETED_REMOTELY_EVENT` | Kept, event subscription |
  | `Components/Accounts/useLinkCharacter.js:74` | Detaches the popup listener on unmount | Kept, unmount-only cleanup |
  | `Planning/Standard Layout/Materials And Sourcing/materialsAndSourcingPanel.jsx:106` | Calls `buildSpeculativeChildJobs()` on mount behind `costingRef`, with `isCosting` and an `attempt` counter as its retry | Tier 3 shape: an async call hand-run on mount with its own loading flag and already-running ref |

- **The transition idioms are in seven places, not six.** `Components/Auth/LoginUI/LoginUI.jsx:90`
  has a `useTransition` the idiom inventory does not list, and
  `Styled Components/Dialogue/useDialogueTrigger.js:17` has a `startTransition` that
  the view-transitions project added.
- **`useHasChanged` is used in thirteen files, not five.** This helps Phase 3; it is only a stale
  figure.
- **No project owns the shopping-list redesign.** See § Decisions needed.

## What each remaining step changes

None of these steps touches a stored document, an HTTP or websocket message, or anything the server
reads. **Wire: none for every phase**; Phase 6 changes how one route reads its own search params, which
is additive. There is no `prepareRelease` step anywhere in this project.

### Phase 2 — the three defects

**Today.** D1, in `Groups/Breakdown/itemFrame.jsx`:

```jsx
const groupObject = useUsersStore.getState().jobData.actions.getActiveGroupObject();

useEffect(() => {
  // sums five totals over groupObject.getJobIDsForOutputJob(outputJob)
  setBreakdownStats({ ... });
}, []);
```

D2, in `Reprocessing/advancedMineralOutput.jsx`:

```jsx
useEffect(() => {
  const checkClipboard = async () => {
    try {
      await navigator.clipboard.writeText("test");
      setClipboardAccessible(true);
    } catch { setClipboardAccessible(false); }
  };
  checkClipboard();
}, []);
```

D3, in `Groups/New Group/newGroupPage.jsx`:

```js
function checkJobsPresent() {
  return new Promise((res) => {
    const intervalID = setInterval(() => { /* resolve when every job is in jobArray */ }, 1000);
    return () => clearInterval(intervalID);
  });
}
await Promise.race([checkJobsPresent(), timeout()]);
```

**After.** The plan gives the direction, not the code. D1 computes during render from a subscribed
value, with `isLoading`, `isError` and `error` removed because nothing is asynchronous:

```jsx
const groupObject = useUsersStore((state) =>
  state.jobData.groupArray.find((group) => group.groupID === state.jobData.activeGroupID),
);
const breakdownStats = useMemo(() => totalsFor(groupObject, outputJob), [groupObject, outputJob]);
```

The selector above is an illustration; the plan does not say which store value to subscribe to.
`breakdownframe.jsx:17-19` takes the same read and changes with it. D2 stops writing: the copy control
attempts `writeTextToClipboard` (already imported at line 31) and reports its own failure, or asks the
Permissions API; the plan leaves the choice open. D3 clears the interval on both arms of the race, in
place.

**Work.**
1. Characterisation test for the breakdown that changes a group's job costs after mount and expects the
   totals to move. Confirm it fails today.
2. Rewrite `itemFrame.jsx` and `breakdownframe.jsx` onto a subscription and a render-time computation.
3. Test that mounting the advanced reprocessing panel leaves the clipboard untouched, then replace the
   probe.
4. Test with fake timers that no interval survives the timeout path of `newGroupPage.jsx`, then hoist
   the interval id so both arms clear it.
5. Fill [overlay.md](./overlay.md) § The defects and § What a reader sees differently.

### Phase 3 — Tier 1, derive during render

**Today.** `Hooks/DocumentLock/useDocumentLockHeld.js:26` is the pattern: an effect whose whole body
dispatches `SYNC_FROM_STORE` when a store value changes, so the first frame after the change carries
the old value.

**After.** The live rule in `frontend/technical-rules.md` § A value that follows another:

```js
if (useHasChanged(lockHeld)) dispatch({ type: "SYNC_FROM_STORE", lockHeld });
```

**Work.** Nine sites, one characterisation test each, in the order of
[measurements/effect-inventory.md](./measurements/effect-inventory.md) § Tier 1. 1.4 must keep the
ordering that `useLockWsListener.js` relies on; 1.3 and 5.3 land together because both are about where
`pageView` lives.

### Phase 4 — Tier 2, write at the write site

**Today.** `Components/SideMenu/leftMenuDrawer.jsx:27` persists `expandedDrawer` to `localStorage` in
an effect after the state changes. `Edit Job/Hooks/useJobMatchesAndWorldData.js:50` calls a mutating
method on the job being rendered.

**After.** The persist moves into the toggle handler beside the `useState` initialiser that already
reads it. The three Edit Job sites (2.4, 2.5, 2.6) say what changed and let the reducer rebuild; the
plan defers their shape to [planning-stage-panels](../planning-stage-panels/contents.md).

**Work.** Nine sites. The two storage mirrors first. 2.7 and 2.8
(`Assets/assetLibraryView.jsx:115`, `Dialogues/Assets/dialogueContent.jsx:75`) are still the same
effect in two files and resolve together. 2.10 waits on the Stage G decision below.

### Phase 5 — Tier 3, React Query

**Today.** `Hooks/App/useStaticDataBuildVersion.js:7`: a hand-run async call on mount with a
`cancelled` flag and a `setSdeVersion`.

**After.**

```js
export function useStaticDataBuildVersion() {
  return useQuery({ queryKey: ["staticDataBuildVersion"], queryFn: getStaticDataBuildVersion }).data;
}
```

The query key is illustrative; the plan does not name one.

**Work.** Six sites that are safe to take now (3.1, 3.3, 3.5, 3.6, 3.7, then 3.8), 3.9 last after
reading [job-document-drafts](../job-document-drafts/contents.md), and 3.2 and 3.4 held with 2.10.
Add `materialsAndSourcingPanel.jsx:106` to the tier or record why it stays.

### Phase 6 — Tier 4, routing

**Today.** `Blueprint Library/BlueprintLibrary.jsx:29` renders, sees empty search params, and
redirects with `replace`. `newGroupPage.jsx:26` does a whole group creation, a save, a poll and a
navigation from one mount effect.

**After.** `validateSearch` on the route supplies the defaults before the page renders; the new-group
work becomes the route's loader and an action. The plan does not give the loader's shape.

**Work.** 4.1, then 4.3 as a recorded verdict against `frontend/auth/spa.md` § Signing in, then 4.2,
which is most of the phase and replaces the Phase 2 patch for D3.

### Phase 7 — Tier 5, analytics from the handler

**Today.** `trackAppEvent` fired from an effect behind a ref latch at three sites.
**After.** The handler that caused the transition fires it. **Work.** Three small edits, each made
while the file is open for Phase 3 (5.1 with 1.10, 5.3 with 1.3) or Phase 5.

### Phase 8 — Tiers 6 and 9

**Today.**

```jsx
const mainCharacterHash = useUsersStore.getState().account.actions.getMainCharacterHash();
```

and, in `CustomStructuresForm.jsx`, `const [isLoading, setIsLoading] = useState(false)` with
`setIsLoading` passed into `StructureForm`.

**After.**

```jsx
const mainCharacterHash = useUsersStore((state) => state.account.mainCharacterHash ?? "");
const [isPending, startSaving] = useTransition();
```

`StructureForm` then takes a callback to run inside the transition, or owns the transition itself; the
plan says only that the drilled setter goes.

**Work.** 6.5, 6.6 and 9.2. Record 9.1 as resolved outside the project once the decision below is
made, and settle the three uncounted group reads.

### Phase 9 — Tiers 8 and 10

**Today.** `useContext(JobTreeInteractionContext)` with `<JobTreeInteractionContext.Provider>`; and in
`virtualisedListbox.jsx:39` a `useLayoutEffect` that assigns `virtualizerControlRef.current`.

**After.** The shape `Context/ThemeContext.jsx` already has:

```jsx
const { onSelectNode, onOpenNode } = use(JobTreeInteractionContext);
<JobTreeInteractionContext value={interaction}>…</JobTreeInteractionContext>
useImperativeHandle(virtualizerControlRef, () => ({ scrollToIndex }), [virtualizer, itemCount]);
```

**Work.** Three self-contained edits with no behaviour change intended.

### Phase 10 — close out

**Today.** Inventory totals describe the sweep as taken (92), not the tree (96 including tests).
**After.** Both inventories restate the tree. **Work.** Strike 2.9 and 9.1 from their tier totals; add
the six uncounted effects with the verdicts in § Discrepancies; correct the `use()` and
`useHasChanged` statements; settle the three group reads; re-run the `exhaustive-deps` count; decide
the shopping list's seven.

## Decisions needed

### Who owns the shopping list's seven effects

**Question.** The plan defers seven effects to "the shopping list redesign"; which project is that?

**Why it is James's call.** No folder under `migration-plans/` is scoped to redesign the Shopping
List. `../reprocessing-rebuild/plan.md:1095` says in terms that no project redesigns it, and
`../contents.md:29` records that no project is scoped for it. Phase 10 is written to re-read the seven
"once that lands", so an implementer cannot reach the project's Done-when alone.

**Options.**
1. Open a shopping-list project and leave the seven deferred to it. Keeps this project small; the
   worst effects in the tree stay until that project is scheduled.
2. Bring them into this project as a final tier. Closes the sweep completely; it is the largest single
   piece of work here and would be redone if a redesign follows.
3. Close this project with the seven recorded as a reasoned exception that names no successor. Fast;
   leaves the finding with no owner.

**Recommendation.** Option 1, opened as a Phase 1 folder now so the deferral points at something, with
the two findings in [effect-inventory.md](./measurements/effect-inventory.md) § Deferred carried into
it. This project then closes without waiting for it.

**Blocked until decided.** Phase 10's close, and promotion.

### Whether the scope grows with what the re-count finds

**Question.** Is the project fixed at the 44 sites in the plan, or does it take on what has been found
since: one uncounted Tier 3 effect and three uncounted Tier 6 reads?

**Why it is James's call.** The plan's Done-when counts "the 35 effects and 9 other sites". Adding four
changes what done means, and the frontend rules say a sweep happens only when asked for.

**Options.** Take all four into their tiers (the sweep stays complete, about a day more with tests);
take the Tier 6 reads only, since they share files and a fix with D1; or record all four as found and
leave them to file-touch migration.

**Recommendation.** Take all four. The three group reads sit beside D1's fix and use the same
subscription, and `materialsAndSourcingPanel.jsx:106` is new code written to the old shape, which is
what the sweep exists to stop.

**Blocked until decided.** The counts in Phases 5, 8 and 10.

### Whether a shared module flag counts as resolving 9.1

**Question.** 9.1's verdict was `useTransition`; the code now holds the pending state in a module-level
flag read through `useSyncExternalStore`. Is that resolved or a new finding?

**Why it is James's call.** The idioms table prefers `useTransition` over hand-rolled pending state,
and this is hand-rolled. It is also deliberate: every character row and the roster button call
`useLinkCharacter`, and one shared flag is what stops two EVE sign-in popups opening at once, which a
per-component transition cannot do.

**Options.** Record it as resolved with the reason written in the inventory; or move the flag into the
account store slice so it is ordinary store state; or leave it listed as a Tier 9 site.

**Recommendation.** Record it as resolved, as a reasoned exception. The requirement is one in-flight
sign-in across components, and `useTransition` does not express that.

**Blocked until decided.** Only the Tier 9 count.

### Whether the reprocessing sites wait for Stage G

**Question.** Do 2.10, 3.2 and 3.4 wait for
[reprocessing-rebuild](../reprocessing-rebuild/plan.md) § Stage G to delete their files?

**Why it is James's call.** The plan calls that rebuild "not scheduled", but the working tree shows it
moving: stages C, D and E are marked Landed and `Functions/Reprocessing/engine/`, `selection/` and
`valuation/` are new and uncommitted. Stage G is not marked landed and all three files exist. Only
James knows how soon G follows.

**Options.** Wait (no thrown-away work; the three stay open until G lands); or convert now (closes the
tiers sooner; discarded when the page is rebuilt).

**Recommendation.** Wait for all three conversions, and fix D2 now as the plan already decides. D2 is
a few lines and stops the clipboard being overwritten today.

**Blocked until decided.** Nothing in Phases 2 to 4 except 2.10; two of nine sites in Phase 5.

## Dependencies and order

- **Waits on.** [planning-stage-panels](../planning-stage-panels/contents.md) for what the Edit Job
  reducer may be handed (2.4, 2.5, 2.6); [job-document-drafts](../job-document-drafts/contents.md) for
  what an open job is held as (3.9); [reprocessing-rebuild](../reprocessing-rebuild/plan.md) § Stage G
  for three sites; a shopping-list owner for seven.
- **Waits on this.** Nothing is blocked by it. The view-transitions project
  points here for the `FirstLoginPage.jsx` observer timer, which the inventory keeps as a finding to
  fix when that file is next opened; no phase owns it.
- **Stands on.** [effect-state-sync](../effect-state-sync/contents.md), closed and promoted, whose
  verdicts and `useHasChanged` this project uses.
- **Recommended next slice.** Phase 2, in the order D3, D2, D1. D3 and D2 are a few lines each with
  one test apiece; D1 takes `itemFrame.jsx` and `breakdownframe.jsx` together and, if the scope
  decision goes that way, the three group reads beside them. Phase 3 follows directly and needs no
  decision.
