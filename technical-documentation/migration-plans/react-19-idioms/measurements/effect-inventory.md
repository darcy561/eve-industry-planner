# The effects, as counted

One of two inventories. The other rows of the idioms table are counted in
[idiom-inventory.md](./idiom-inventory.md), which also records what was swept and found clean.

Raw reading behind the plan's figures. Every `useEffect` in `frontend/src` at the time of counting,
read at its call site and given a verdict.

Regenerate the list from `frontend/`:

```bash
grep -rn "useEffect(" src --include='*.jsx' --include='*.js' | sed 's|src/||' | sort
```

The dependency-array warnings quoted below come from the same tree:

```bash
npx eslint src -f json | jq -r '.[] | .filePath as $f | .messages[]
  | select(.ruleId=="react-hooks/exhaustive-deps") | "\($f):\(.line) \(.message)"'
```

## Totals

| | Count |
|---|---|
| Test files — out of scope | 3 |
| Kept — synchronising with something outside React | 50 |
| Tier 1 — derive during render | 10 |
| Tier 2 — write at the write site | 10 |
| Tier 3 — React Query | 9 |
| Tier 4 — routing | 3 |
| Tier 5 — analytics from the handler | 3 |
| Deferred to the shopping list redesign | 7 |
| **Total** | **95** |

`react-hooks/exhaustive-deps` reports **43** warnings across the SPA. They overlap this work without
matching it: some sit on `useMemo` and `useCallback` rather than effects, and several deliberate
narrow lists are load-bearing. Fix only the ones inside a file this project is rewriting anyway.

---

## Tier 1 — derive during render (10)

A copy of something the component was already given, brought into step by an effect. The effect runs
after the browser has painted, so the first frame carries the previous value. `useHasChanged` in
`frontend/src/Hooks/` is the shared shape for these; two of the ten want no state at all.

| # | Call site | What it does now | What it should be |
|---|-----------|------------------|-------------------|
| 1.1 | `Components/Groups/Breakdown/itemFrame.jsx:30` | Sums five totals across the group's matched jobs into `breakdownStats`, behind `isLoading`/`isError` state, with `[]` deps and a `getState()` read | A computation while rendering. There is no async here at all, so there is nothing for the loading flag to describe. **Carries defect D1 — moved to Phase 2** |
| 1.2 | `Components/Groups/Scheduler/CharacterSelection.jsx:57` | Calls `onSelectionChange(selectedCharacterRows)` whenever the memoised rows change | Call it from `handleCharacterToggle` and the select-all/none handlers. The parent is being told about an event, so send it when the event happens. The file already uses `useHasChanged` twelve lines above, from the closed project's work |
| 1.3 | `Components/Groups/groupFrame.jsx:50` | Parses `search.pageView` and dispatches `setPageView` when it differs from the reducer's copy | The route search is the source of truth for which tab is open; read it where the tab is read rather than keeping a second copy in the reducer and correcting it a frame later. Carries an `exhaustive-deps` suppression that goes with it |
| 1.4 | `Hooks/DocumentLock/useDocumentLockHeld.js:26` | Dispatches `SYNC_FROM_STORE` whenever the store's `lockHeld` changes — the effect's entire body | `useHasChanged(lockHeld)`, or drop the reducer copy and read the store value. Note the comment in `useLockWsListener.js` that depends on `heldRef` lagging by a tick: whatever replaces this must keep that ordering or the comment stops being true |
| 1.5 | `Hooks/DocumentLock/useLockAcquireRelease.js:41` | Assigns `keyRef.current` from `enabled`/`collection`/`docID` | Assign it where it is read, or during render. An effect whose whole body is one ref write is a frame of staleness for nothing |
| 1.6 | `Hooks/Planner/useAdvanceWhenFollowingAppDefault.js:12` | Keeps `prevAppRef`, compares the application default against it, and dispatches an advance when the committed value was following the old default | `useHasChanged` is this, written out by hand. The dispatch stays; only the prev-ref bookkeeping goes |
| 1.7 | `Styled Components/Dialogue/useSyncedDialogueEventState.js:42` | Calls `syncSnapshot(messageData)` whenever `messageData` changes | `useHasChanged(messageData)`, or sync at the moment the dialogue opens. Ask what reads the snapshot first — a copy only read while something is open wants seeding on open, not keeping in step the rest of the time |
| 1.8 | `Components/Dialogues/Price Entry/itemRow.jsx:93` | Re-syncs unconfirmed entries to the market default when the market/order listing key changes, behind two refs | A value that follows another. The closed project resolved the sibling finding at `:136` exactly this way, and recorded that the entry is seeded and then edited so it cannot simply be derived — that finding applies here unchanged |
| 1.9 | `Styled Components/JobTreeFlow/JobDependencyTreeFlow.jsx:83` | Clears `hoveredId` and `chosenJobId` when `interactionResetKey` changes, guarded by a prev-ref | A poke, not a value. The closed project settled the same mechanism for the focus request in this file's neighbours: pass what changed, or let the subtree mount afresh under a `key` |
| 1.10 | `Components/Dialogues/Blueprint Archive/dialogueFrame.jsx:42` | Resets `analyticsLoggedRef` when the dialogue closes | Goes away entirely if the body is mounted only while open, which is the rule the dialogue shell already carries. Do it with 1.11 below, since both refs serve the same latch |

## Tier 2 — write at the write site (10)

Effects that correct, persist or copy state immediately after something else wrote it. The write and
the correction belong together.

| # | Call site | What it does now | What it should be |
|---|-----------|------------------|-------------------|
| 2.1 | `Components/SideMenu/leftMenuDrawer.jsx:27` | Writes `expandedDrawer` to `localStorage` after it changes | Persist in the toggle handler. The initial read already happens in the `useState` initialiser beneath it, so the two halves would sit together |
| 2.2 | `Context/ThemeContext.jsx:124` | Writes `mode` to `themeStorage` after it changes | The same, in whatever sets the mode. The `matchMedia` listener above it stays — that one is a genuine outside subscription |
| 2.3 | `Hooks/Planner/useStripRedundantJobMarketHubOverrides.js:28` | Reads the job's local pricing, drops any side matching the account default, and calls `updateActiveJobLayout` | Normalise on the way in. The reducer rebuilds the job from what it is handed, so a redundant override should never be stored rather than being swept up afterwards |
| 2.4 | `Components/Edit Job/Hooks/useJobMatchesAndWorldData.js:38` | `activeJob.updateLinkedJobData(allIndustryJobs)` on every change of either | Mutating the job the current render is reading. Say what changed and let the reducer rebuild, the way the Edit Job rule requires |
| 2.5 | `Components/Edit Job/Hooks/useRefreshLinkedESIData.js:27` | Reads three query caches, applies order and industry-job data onto `activeJob`, diffs with `JSON.stringify` to decide whether anything moved, then dispatches | The same, plus the `JSON.stringify` comparison is the tell: it exists because the mutation already happened and the effect has to work out whether it mattered |
| 2.6 | `Components/Edit Job/Hooks/useMarketOrdersAndWorldData.js:87` | Matches ESI orders to the job and writes the latest data onto it; carries a suppression explaining that `activeJob` is written, not read | Same family as 2.4 and 2.5. The suppression's reasoning is sound for the code as written, which is the argument for changing the code |
| 2.7 | `Components/Assets/assetLibraryView.jsx:116` | Derives office location ids from the asset collection and writes them to the account store | Derive where they are read. **Duplicated source of truth** — identical to 2.8 |
| 2.8 | `Components/Dialogues/Assets/dialogueContent.jsx:81` | Byte-identical to 2.7 | Resolve both together; one of them should not exist |
| 2.9 | `Hooks/EveEsi/useLocationNames.js:73` | Copies resolved names out of the query result into the Zustand store | The query layer should hand back one canonical shape that consumers read; the `names` memo directly below already merges the store and the query result, so the store write is a cache-warming side effect looking for a home |
| 2.10 | `Components/Reprocessing/Hooks/useAutoRecalculation.js:55` | Recalculates reprocessing when any of six settings change, behind an `isInitialMount` ref and four guard conditions | The `isInitialMount` ref is the tell. Recalculate from the handlers that change those settings |

**Read `planning-stage-panels/` before touching 2.4, 2.5 and 2.6.** That project owns what the Edit
Job reducer may be handed and why the job is mutated in place, and these three sit on its boundary.

## Tier 3 — React Query (9)

Async work hand-run on mount, each with its own loading flag, cancellation boolean or
already-processed ref. React Query is how data arrives everywhere else in this tree.

| # | Call site | What it does now | What it should be |
|---|-----------|------------------|-------------------|
| 3.1 | `Hooks/App/useStaticDataBuildVersion.js:7` | `getStaticDataBuildVersion()` → `setSdeVersion`, with a `cancelled` flag | The textbook case: a query, and the whole hook becomes two lines |
| 3.2 | `Components/Reprocessing/advancedMineralOutput.jsx:45` | Probes clipboard write access on mount | A query, once the probe stops being destructive. **Carries defect D2** — the probe itself is fixed in Phase 2 |
| 3.3 | `Components/Dialogues/Import Fit/importFittingDialogue.jsx:49` | Checks clipboard permission, reads the fit, sets three pieces of state, shows a snackbar on failure, guarded by a `dismissed` flag | A query keyed on the dialogue's opening. The `dismissed` flag is cancellation React Query already owns |
| 3.4 | `Components/Reprocessing/reprocessingStructurePanel.jsx:29` | Reads cached character skills out of `queryClient` in an effect and pushes them into page state | Read them with the query hook and derive. Carries an `exhaustive-deps` warning naming four missing dependencies |
| 3.5 | `Components/Dashboard/.../AddItemDialogue/importNewJob.jsx:25` | Imports the watchlist item being edited on mount, with `[]` deps and four missing dependencies reported by lint | A query or a mutation on open. The smallest of the dialogue conversions and a good first one |
| 3.6 | `Components/Dialogues/Price Entry/PriceEntryDialogueContent.jsx:82` | Builds the price entry list asynchronously, bracketing it with `setIsLoading` calls | A query keyed on the requested job ids; the loading text comes from its state |
| 3.7 | `Components/Edit Job/.../Hooks/useChildJobDrawerData.js:19` | Builds or reuses a child job preview, with a comment explaining that writing an equal array back would loop because the effect re-runs on every render of everything above it | The comment is the argument. A query keyed on the material and the drawer being open has no such loop |
| 3.8 | `Components/Groups/groupFrame.jsx:97` | Loads a group: checks it still exists, resolves its member jobs, fetches missing ESI data, recalculates install costs, writes to the store, or navigates away on failure. Carries a `cancelled` flag, hint text and a blanket suppression | The group's data belongs to the route. Large; take it after the smaller conversions have settled the shape |
| 3.9 | `Components/Edit Job/Edit Job Hooks/useEditJobInitialState.js:21` | The same for the Edit Job page: resolves linked jobs, prefetches account totals, fetches missing ESI data, clears orphaned structures, recalculates install costs, seeds the layout, builds two `Job` instances and dispatches | The largest in the project. Take it last within the tier, and read `job-document-drafts/` first — that project is reshaping what an open job is held as |

## Tier 4 — routing (3)

| # | Call site | What it does now | What it should be |
|---|-----------|------------------|-------------------|
| 4.1 | `Components/Blueprint Library/BlueprintLibrary.jsx:30` | Renders, notices the search params are empty, then redirects with `replace` to the defaults | TanStack Router's `validateSearch` supplies defaults without rendering a wrong page first |
| 4.2 | `Components/Groups/New Group/newGroupPage.jsx:18` | On mount: builds a group from the ids in the search param, rewrites every affected parent and child job, tracks an event, adds the group to the store, flushes a pending save, saves through the API, polls at 1s for the jobs to appear, races that against a 10s timeout, then navigates | A route loader and an action. **Carries defect D3** — the interval leak is patched in Phase 2, the rewrite happens here |
| 4.3 | `Components/Auth/Hooks/useAfterLoginStepNavigation.js:17` | Watches the completed-steps set, and on the last one emits login-complete and navigates, latched by a ref | Arguably correct as an effect, since it is reacting to a set filled by several independent callers. Read it against [frontend/auth/spa.md](../../../frontend/auth/spa.md) § Signing in, which says where a reader lands, and record the verdict here rather than changing it on assumption |

## Tier 5 — analytics from the handler (3)

`trackAppEvent` fired from an effect behind a ref latch. Each could be fired by the handler that
caused the transition. Cheapest tier, least valuable — do them while already in the file.

| # | Call site | Note |
|---|-----------|------|
| 5.1 | `Components/Dialogues/Blueprint Archive/dialogueFrame.jsx:48` | Pairs with 1.10; the latch and its reset go together |
| 5.2 | `Components/Dialogues/Job Tree/JobDependencyTreeDialogue.jsx:175` | The closed project examined the latch at `:177` in this file and found it earns its place on one path — the same id can arrive twice. Check whether that reasoning covers this one before removing it |
| 5.3 | `Components/Groups/groupFrame.jsx:177` | Fires a per-tab event when `state.pageView` changes. Goes with 1.3, which is about where `pageView` lives |

## Deferred — the shopping list (7)

Two effect state machines of roughly 150 lines each, plus the dialogue content that feeds them. Both
carry a `lastProcessedRef` whose only job is to stop the effect re-running on state it just caused,
and both are written as a sequence of early returns that set and clear a loading flag between them.

- `Components/Dialogues/Shopping List/Hooks/useShoppingListCharacterAssets.js:45`
- `Components/Dialogues/Shopping List/Hooks/useShoppingListCharacterAssets.js:51`
- `Components/Dialogues/Shopping List/Hooks/useShoppingListCorporationAssets.js:42`
- `Components/Dialogues/Shopping List/Hooks/useShoppingListCorporationAssets.js:116`
- `Components/Dialogues/Shopping List/Hooks/useShoppingListCorporationAssets.js:288`
- `Components/Dialogues/Shopping List/ShoppingListDialogueContent.jsx:52`
- `Components/Dialogues/Shopping List/ShoppingListDialogueContent.jsx:64`

They are the worst effects in the tree and they are deliberately not in scope: the shopping list's
logic is moving into the reducer under its own redesign. Phase 8 re-reads them once that lands.

Two things found while reading them, worth carrying into that redesign: `useShoppingListCorporationAssets.js:42`
resolves office names inside a nested async function inside a ref-keyed guard, and both files call
`state.shoppingList.clearAssetQuantities()` — mutating an object held in reducer state — in several
branches.

## Kept — 50

These synchronise with something outside React, which is what effects are for. Listed so the count is
reproducible and so a later reader does not re-litigate them.

**Event subscriptions and listeners (14).** `snackbar.jsx:43`, `massBuildInfo.jsx:25`,
`useDialogueEventState.js:21`, `groupFrame.jsx:80`, `useWarnBeforeUnload.js:7`,
`ThemeContext.jsx:111` (`matchMedia`), `useLockWsListener.js:27`, `useLockScopeSync.js:153`,
`useLockExtendLoop.js:75`, `useLockSyncHeartbeat.js:21`, `useAccountWebSocket.js:38`,
`useEditJobLeaveConfirm.js:305`, `useEditJobLeaveConfirm.js:357`,
`useRegisterHeaderDocumentLockUI.js:40`.

**Timers and polling (17).** `useAppConfig.jsx:60`, `useAppConfig.jsx:72`, `MaintenanceMode.jsx:13`,
`useFetchStaticDataFiles.js:7`, `useESIRateLimiting.js:89`, `DocumentLockHeaderControl.jsx:140`,
`DocumentLockHeaderControl.jsx:146`, `DocumentLockHeaderControl.jsx:169`,
`useLockExtendNudgeSnackbar.js:24`, `useLockExtendNudgeSnackbar.js:30`, `useLockExtendLoop.js:66`,
`useLockSyncHeartbeat.js:53`, `useLockSyncHeartbeat.js:61`, `useLockAcquireRelease.js:137`,
`useLockScopeSync.js:136`, `groupJobTreeFlow.jsx:51`, `pageTransition.jsx:41`.

**Observers and layout measurement (2).** `FirstLoginPage.jsx:62` (`ResizeObserver`),
`FirstLoginPage.jsx:47` (two-frame gate before an animation may run).

**Imperative third-party APIs (2).** `FitViewToGraphEffect.jsx:10` and `FitViewToJobEffect.jsx:15`,
both driving React Flow's `fitView`.

**Connection and presence lifecycle (7).** `useAccountWebSocket.js:23`,
`useMaintenanceWebsocketPark.js:14`, `useAppConfig.jsx:52`, `useLockAcquireRelease.js:150`,
`useLockAcquireRelease.js:223`, `useLockViewerPresence.js:25`, `useAuthUrlLogin.js:16`.

**Unmount-only cleanup (3).** `AdditionalAccounts.jsx:84`, `Popover/iconButtons.jsx:69`,
`useESIRateLimiting.js:100`.

**Telling an outside system something changed (5).** `AppWrapper.jsx:28` (Sentry `setUser`),
`AppWrapper.jsx:38` (GA4 web vitals), `useLockLeaseContention.js:20` (server resync on a change of
lease pressure), `useLockVacancySnackbar.js:33` and `useLockPassiveViewerSnackbar.js:26` (snackbars on
a lock-state transition).

The last three keep a prev-ref and compare against it, which reads like Tier 1. They are not: what
they do on the change is reach outside React — a server call, a snackbar — rather than write a copy
of a value. The prev-ref could still become `useHasChanged` if one of these files is opened for
another reason, but none of them is worth opening for that alone.

## Out of scope — test files (3)

`Components/pageTransition.test.jsx:33`, `tests/editJobHarness.jsx:39`, `tests/editJobHarness.jsx:47`.
These exist to observe renders and to seed a harness once, which is the one thing an effect is
uniquely able to do.

## The defects found here

D4 and D5 are in [idiom-inventory.md](./idiom-inventory.md); the plan lists all five together.

Found by reading, not by the lint rules, and each a bug on its own merits.

**D1 — the group breakdown never updates.** `Components/Groups/Breakdown/itemFrame.jsx:30` computes
five totals under `[]` deps, from a `getState()` read that takes no subscription (finding 6.3 in
[idiom-inventory.md](./idiom-inventory.md) — the two halves are one bug). Nothing recomputes
them when the group's jobs change. A reader watching the breakdown while costs move is looking at the
figures the panel had when it mounted. Fixed by 1.1.

**D2 — the reprocessing panel destroys the reader's clipboard.**
`Components/Reprocessing/advancedMineralOutput.jsx:45` finds out whether it may write to the clipboard
by writing `test` to it, on every mount. Anything the reader had copied is gone. The probe should ask
the Permissions API, or the copy control should simply attempt the write and report its own failure —
there is already a `writeTextToClipboard` helper imported at the top of the file.

**D3 — a leaked interval on the new-group path.**
`Components/Groups/New Group/newGroupPage.jsx:18` polls at 1s inside `checkJobsPresent`, and returns a
cleanup function from the `Promise` executor, where nothing calls it. `Promise.race` against a 10s
timeout means the losing poll keeps running after the page has navigated away.

## What the count does not say

- **Fifty of ninety-five is a healthy result.** The question this sweep was opened to answer is not
  "how bad is it" but "which ones are load-bearing", and most of them are. The document lock alone
  accounts for 21 kept effects, and every one of them is attached to a websocket, a timer, a listener
  or a lease.
- **The tiers are not equally sized in effort.** Tier 1 is nine small diffs. Tier 3 contains two page
  load paths, either of which is a day's work with its tests.
- **No test anywhere on the changed files.** Same finding as the closed project, and the same
  consequence: a characterisation test before each change, confirmed to fail against a deliberately
  broken version of the fix.
- **The lint rules did not find most of this.** `set-state-in-effect` is clean — the closed project
  cleared it — and `exhaustive-deps` sits mostly on memos. Thirty-five sites needed reading to find.
