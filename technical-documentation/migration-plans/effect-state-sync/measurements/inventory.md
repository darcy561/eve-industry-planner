# The findings, as counted

Raw output behind the plan's figures. Regenerate from `frontend/` with:

```bash
npx eslint . -f json | jq -r '.[].messages[] | select(.ruleId=="react-hooks/set-state-in-effect")'
```

Counted after the three resolved findings landed. Every remaining file is listed, with whether it had
a test at the time of counting.

## Remaining — none

Every finding is resolved. `npx eslint . -f json` reports none of this rule left in the SPA.

## Verdicts (Phase 2)

Each finding read at its call site. Two of the first-pass buckets moved on reading: `priceHistory.jsx`
turned out to be a value being synchronised rather than a signal, and `itemRow.jsx:154` the reverse.

**Twelve of eighteen were correct where they stand.** The six that are not cluster around two
mechanisms, not eighteen independent problems.

Both groups are resolved. Each finding is listed with what replaced it under Resolved, below.

### The one that was a defect — resolved

`CharacterSelection.jsx:45` re-selected **every** character whenever `allCharacters` changed identity
and the current selection was empty. The panel has a button for deselecting everyone, so empty is a
state the reader can choose, and the guard could not tell that from "not seeded yet".

Resolved by keying the default on whether there *are* characters rather than whether any are
selected, so it applies once when they arrive and not again. Nine tests, two of which failed against
the old guard.

### A lookalike that should be left alone

`itemRow.jsx:136` reads almost identically — `remainingQty > 0 && unconfirmedEntries.length === 0`
seeds an entry — but it is not the same defect, and should not be "fixed" by symmetry.

Every writer of `unconfirmedEntries` was traced: the only ways it empties are confirming an entry,
which filters it out, and the Confirm All trigger. There is no control that leaves a reader wanting
it empty. So empty genuinely does mean "needs a row", and re-seeding is the behaviour rather than the
bug. What it still needs a different shape for is the seeding itself — the entry it creates is then
edited, so it cannot simply be derived while rendering.

## Resolved — 21 findings, all of them

Three predate this project, from clearing the lint backlog; the fourth is the defect above. The rest
are the group name panel, the edit job page's floating step buttons, the tutorial card, the price
history chart, the parent job dialogue, the header lock's viewer flash, the job dependency tree, the watchlist's prices, the focus signal and the price entry rows. Kept because they are the worked examples for the commonest shape.

| Finding | What replaced the effect |
|---------|--------------------------|
| `Styled Components/Textfield/tax.jsx:44` | The copy is brought into step while rendering, guarded on the value it was last shown for |
| `Hooks/useJobStatuses.js:29` | The same, guarded on the account id; the stored map is now read once |
| `Components/Reprocessing/reprocessingSettingsPanel.jsx:50` | The same, guarded on the exempt count, with the initial state seeded from that count |
| `Components/Groups/Scheduler/CharacterSelection.jsx:45` | Keyed on whether there are characters at all, which is what separates "not seeded" from "the reader chose none" |
| `Components/Groups/Group Name/groupNameFrame.jsx:28` | No state: `allowEditGroupName && canEdit` where it is read, plus `useHasChanged(canEdit)` to shut the editor for good on losing the lock |
| `Components/Groups/Group Name/groupNameFrame.jsx:34` | No state to synchronise: the field is seeded when the editor opens |
| `Components/Edit Job/editJob.jsx:117` | `useIsScrolledOutOfView`, which owns the observer and the answer; whether to show the floating button is derived where it is read. Both floating buttons and the hook were later deleted by planning-stage-panels Stage Q |
| `Components/Edit Job/editJob.jsx:138` | As above, with a second copy of the hook for the other button |
| `Components/Tutorials/tutorialTemplate.jsx:43` | `Fade` with `unmountOnExit` and `onExited`, so the transition owns both the mounting and the moment the fade ends — no mount flag, and no second copy of the one-second duration |
| `Components/Dashboard/Dashboard.jsx:27` | `useHasChanged` on whether help is wanted, so the row is taken back when that changes rather than whenever the card lets go of it |
| `Styled Components/LineGraph/priceHistory.jsx:68` | `useHasChanged` on the series identity **and** the window size, with the opening window computed as the initial state rather than corrected after the first render |
| `Components/DocumentLock/DocumentLockHeaderControl.jsx:169` | The flash state now holds the scope it was raised for rather than a bare `true`, so it cannot be read as another document's, and whether to show it is derived where it is read. All three places that switched it off while rendering are gone; the timer that ends the flash remains |
| `Styled Components/JobTreeFlow/JobDependencyTreeFlow.jsx:83` | Derived at use, as the verdict said: a chosen job that is no longer drawn is no choice |
| `Components/Dialogues/Job Tree/JobDependencyTreeDialogue.jsx:177` | A ref, as the verdict said. It earns its place on one path: closing leaves the opening's id in the dialogue's state, and a caller may name the id it opens with, so the same id can arrive twice — the effect re-runs and the latch is what stops a second view being recorded |
| `Components/Dialogues/Job Tree/JobDependencyTreeDialogue.jsx:184` | No counter: the dialogue passes the request it already has, keyed on the opening it came from |
| `Components/Groups/JobTree/groupJobTreeFlow.jsx:55` | No counter and no `at`: the job to focus arrives in the route search, and every path that sets it crosses back from the job page, so the tree mounts afresh for each request |
| `Styled Components/JobTreeFlow/JobDependencyTreeFlow.jsx:84` | The request is a value the tree acts on when it changes, rather than a key packed with two other things and unpacked twice |
| `Components/Dialogues/Price Entry/itemRow.jsx:136` | Brought into step while rendering, keyed on what is left to price. The entry is still seeded and then edited — that part could not be derived away — but it follows the figure rather than the identity of the confirmed list |
| `Components/Dialogues/Price Entry/itemRow.jsx:154` | Gone with its counter: Confirm All writes a new entries array, as the clipboard-import path beside it already did, so the rows see the change in the data |
| `Components/Dashboard/Components/ItemWatch/itemWatchContainer.jsx:152` | React Query, as the verdict said, behind a shared `useMarketPricesQuery` — the loading flag, the cancelled-fetch guard and the effect all go with it |
| `Components/Edit Job/parentJobDialogue.jsx:62` (now `parentJobOptions.jsx`) | `useMemo`, as the verdict said — the list is derived from the planner's jobs and what the reader has already chosen, and nothing else writes it. The dialogue is also mounted only while it is open — the effect had skipped the work while shut by returning early without writing, which a memo cannot do without emptying the list during the closing fade, and the work has no business running while nobody is looking at it |

### Where the group name panel departed from its verdict

Phase 2 said `groupNameFrame.jsx:34` wanted a render-phase adjustment guarded on the group's **id**.
Implementing it that way was tried and rejected, with the tests to show why: guarding on the id means
a rename arriving from another session — the same group, a new name — never reaches the copy, so the
editor opens on a name nobody is looking at any more. Two of the eleven tests fail against that shape.

Seeding the field when the editor opens has neither problem. The copy is only ever read while the
editor is open, so there is nothing to keep in step the rest of the time, and what the reader is
typing is theirs until they save or revert.

Each carries a characterisation test written before the change, and each test was confirmed to fail
against a deliberately broken version of the fix.

## What the count does not say

- **Difficulty is not spread evenly.** Twelve are corrections in their own file. The other six are
  two mechanisms — a signal sent by bumping a counter, used in three places, and the price-entry
  rows that are seeded rather than derived — plus one fetch that belongs in React Query.
- **No test anywhere.** Every remaining file starts from zero, so each fix carries the cost of a
  characterisation test before it. The three resolved findings took roughly as long as an entire
  earlier group of twenty-one for that reason.
- **The count is a lint count, not a defect count.** Only one finding turned out to misbehave, and
  its symptom is not what the rule is about: see the `CharacterSelection.jsx` note above. Two of the
  three already resolved changed only which frame a correct value appeared on.
