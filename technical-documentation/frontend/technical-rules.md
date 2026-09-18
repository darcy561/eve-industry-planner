# Technical rules (frontend)

Applies to the SPA / frontend tree. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins**; otherwise the master applies.

## What already applies (from the master)

From root **Engineering practices — shared** (not Go-only):

- **One SoT** for shared facts — gather/build in the SPA from the owning SoT; no parallel hard-coded lists (public env knobs, product strings, theme tokens, etc.).
- **Modern platform idioms** — current React / JavaScript practices as used in-repo; prefer newer patterns over legacy ones when both work; explain options + pros/cons when choosing.
- Reusable helpers/modules; no legacy wrappers after a refactor; no one-file-per-folder sprawl.
- Dependencies kept current as we touch an area; check freshness/deprecation before new packages.
- Testing as we build; no secrets in client bundles or logs; API/wire compat flagged in planning.

## React 19 idioms

The SPA runs **React 19**. It was built across 18 and 19, so both generations of idiom are still
present. New and edited code uses the React 19 way; React 18 patterns are migrated **as files are
touched** rather than in a separate sweep, so the tree converges without a large untested change.

When editing a component, prefer the 19 idiom over its 18 equivalent, and modernise the surrounding
patterns in the file you are already working in. Do not open a project-wide migration unless asked
for one.

| Prefer | Over |
|--------|------|
| `ref` as an ordinary prop, and ref cleanup functions | `forwardRef` wrappers |
| `use()` for reading a promise or context in render | a `useEffect` that sets state from a promise |
| `useActionState` / `useOptimistic` / `<form action>` | hand-rolled pending, error and rollback state |
| `useDeferredValue` and `useTransition` for expensive updates | debounce timers guarding a render |
| Document metadata rendered directly in a component | side-effect writes to `document.title` and friends |
| Context read with `use()`, and `<Context>` as the provider | `useContext()` and `<Context.Provider>` |
| The compiler-friendly shape: derive during render | `useEffect` that only mirrors props into state |

**`useEffect` is the pattern most worth questioning.** Most of its uses in this tree predate the
alternatives: an effect that only derives a value from props or state should compute during render,
and one that only fetches should belong to React Query, which the SPA already uses everywhere.
Effects are for synchronising with something outside React — a subscription, a websocket, an
observer, a timer.

**Do not rewrite working code for its own sake.** The rule applies to code being written or edited
for another reason. A 19 idiom that would change behaviour, or that no test covers, is worth
flagging before taking it.

## Class members: getters and methods

A class in `frontend/src/Classes` exposes a **getter** when the member reads the object's
fields or totals its rows — `job.buildCost`, `material.quantityRemaining`, `job.childJobIDs`.
It exposes a **method** when the member takes an input, changes the object, or calculates a
figure from more than a sum — `job.materialRequirement(typeID)`, `job.importPurchaseToMaterial(...)`,
`job.buildCostPerItem()`.

A getter is the get: name it for the value, not for fetching it. `parentJobIDs`, not
`getParentJobIds`.

Derived values are getters rather than stored fields, so a figure cannot fall behind what it is
derived from. They are absent from a spread of an instance, so an object built with
`{ ...job }` carries the fields and none of the derived values — pass instances, or rebuild
with the class.

## Tests sit beside what they test

A `*.test.js(x)` lives in the same folder as the module it covers, the way `_test.go` does in
[`services/`](../../services/). `Functions/Auth/plannerAuthCookies.js` is tested by
`Functions/Auth/plannerAuthCookies.test.js` next to it, not from a separate tests tree.

Anything reusable across tests — fixtures, harnesses, store seeding, the Vitest setup file — lives in
[`frontend/src/tests/`](../../frontend/src/tests/). That folder is the SPA's counterpart to the
repo-root [`testing/`](../../testing/) module: **look there before writing a helper inside a test
file, and put a new reusable one there**. Helpers copied into each file that needs them are the
failure this prevents.

## Dialogues

Every dialogue is built from the shared shell,
[`ContentDialogue`](../../frontend/src/Styled Components/Dialogue/ContentDialogue.jsx) — title, error
boundary, loading and error states, actions row and the app-shell surface — rather than from raw MUI
`Dialog` parts. Two hooks drive it, and they are the only difference between one dialogue and
another: `useDialogueTrigger` when the component that owns the dialogue decides when it opens, and
`useDialogueEventState` / `useSyncedDialogueEventState` when an app event does. `DialogueCloseAction`
gives the close button, and `useDialogueCloseReset` clears what the reader typed on the way out.

**The shell renders nothing until it is open**, so a dialogue's body — and everything it derives —
costs nothing while nobody is looking at it. Put the work in the body, as a child of the shell. Work
done in a component that stays mounted around the shell still runs while the dialogue is shut, which
is the trap: a list filtered from every job on the planner belongs in the body, not in the frame
holding the open flag. An event-driven dialogue whose frame carries such work returns `null` until
its own state says open, as the assets, shopping list and price entry dialogues do.

The cost of that rule is the closing transition: a dialogue disappears at once rather than fading.
Opening still animates.

## The app-shell surface has an owner

A screen on the app-shell design composes `AppShellPanel`, `SectionPanel`, `SelectableCard`,
`ActionCard`, `EntityRow` or `InsetSurface` rather than reaching for the sx underneath them —
`appShellSetupSectionPaperSx`, `appShellNestedCardSx`, `appShellInsetSurfaceSx` under
[`Context/appShell`](../../frontend/src/Context/appShell). Each of those three sx values has a
component built on it; a screen naming the sx directly has the surface without the component that
owns it, which is how a header or a card comes to be redrawn beside one that already exists rather
than composed from it. The audit is one command:

```
grep -rEn "appShell(SetupSectionPaper|NestedCard|InsetSurface)Sx" --include=*.jsx frontend/src/Components/
```

A page frame is the one legitimate exception: `AppShellPanel` wraps its children in a title header, an
error boundary and loading states, which a frame holding a stepper and its navigation has no use for
— a frame takes the sx on a plain outlined `Paper` instead.

Not every `Context/appShell` import is a candidate: the module also holds form-control and picker
props — `getAppShellPickerSlotProps` and the like — which have no component above them and are meant
to be imported directly.

Component reference → [`components/contents.md`](./components/contents.md).

## Changing the job being edited

A component on the Edit Job page never writes into `state.activeJob`. It says what changed and the
reducer rebuilds the job — `updateActiveJobLayout` for the reader's choices about the job's own
screens, `toggleActiveJobReadyForSale`, `addCustomTransaction`, and the marking actions beside them.
Writing to the prop reaches the store either way, because the reducer rebuilds from what it is given,
which is exactly why it is easy to do by accident: the change lands on the object the current render
is still reading, and it only becomes visible because the call site remembered to dispatch after it.

These actions are covered end to end rather than in isolation, through
[`frontend/src/tests/editJobHarness.jsx`](../../frontend/src/tests/editJobHarness.jsx): it mounts a
piece of the page over the real reducer with nothing mocked, so a test presses what a reader presses
and then reads the job that came out. `editJobMutators.*.test.jsx` beside the page are those tests,
one file per stage, with their data in
[`frontend/src/tests/editJobFixtures.js`](../../frontend/src/tests/editJobFixtures.js). A new way of
changing the job gets one.

## Writing to a store slice

`set` is given a **partial**, not the next state. Zustand merges it with
`Object.assign({}, state, nextState)` for every call that does not pass `replace`, and nothing in the
SPA does — neither the slice actions in [`frontend/src/Zustand`](../../frontend/src/Zustand) nor a
handler reaching for `setState` directly. So an updater names the slices it changes
and nothing else — a leading `...state` spreads the store into an object the store is about to be
spread under anyway.

```js
set((state) => ({
  applicationSettings: { ...state.applicationSettings, userCloudAccounts: true },
}), false, "setCloudAccountsEnabled");
```

The merge is **one key deep and no further**, which is what makes the inner `...state.applicationSettings`
required: whatever the updater returns for a slice replaces that slice whole. Dropping it loses every
field the updater did not name, including the slice's own `actions`.

That is also why a **reset restates the actions**. An updater that rebuilds a slice from its defaults
— `...stateDefault()`, or a literal — is not spreading the current slice, so nothing carries `actions`
across and the reset has to put them back by hand:

```js
plannerSettings: { ...stateDefault(), actions: state.plannerSettings.actions }
```

What decides it is whether the current slice is spread at all, not the order things appear in. A
reset that spreads the slice and then the defaults over it — `{ ...state.jobData, ...stateDefault() }`
— already carries `actions` from the first spread, so it restates nothing. The one other place the
line stays is above a caller-supplied patch — `{ ...state.slice, ...partial, actions: ... }` — where
it stops an arbitrary incoming object replacing the slice's actions.

An updater that returns `state` itself is how a no-change path says so: the store compares with
`Object.is` and skips the subscriber notification entirely. Returning a rebuilt equal object instead
wakes every subscriber.

## A value that follows another

A component that holds its own copy of something it was handed — a prop, a store value, a route
param — brings that copy into step **while rendering**, not in an effect. An effect runs after the
browser has painted, so the first frame carries the previous value and the correct one arrives a
frame later; computing during render means the first painted frame is already right.

`useHasChanged` in `frontend/src/Hooks/` is the shared shape for this: it answers whether a value
moved since the render before, compared with `Object.is`, and the caller writes its own update so
what is being set stays visible at the call site —

```js
const [shown, setShown] = useState(() => format(rate));
if (useHasChanged(rate)) {
  setShown(format(rate));
}
```

Its answer is only true for the render it fires on; that render is replaced by the one the update
causes, so it cannot be read afterwards, only acted on in the moment. Pass it something stable — a
value rebuilt every render (an array from `map`, an object literal) reads as changed every time, so
compare what actually identifies it: a length, an id, a boolean.

Not every case fits it. A value that is only ever read while something else is open — an editor's
seeded field, a panel's initial state — wants seeding at the moment that something opens, not keeping
in step the rest of the time; ask what reads the copy before reaching for `useHasChanged`.

## A poke is not a value

State that exists only to tell something else "look again" — a counter bumped so a view below re-runs
a fit, a flag raised and cleared to mark a signal as handled — carries no value of its own, and a
consumer that unpacks meaning back out of it (an id packed into a key, a boolean read as "just
happened") is decoding a message that should have been sent directly.

Pass what changed, not that something changed. A request to focus a job is the job, plus whatever
tells two requests for the same job apart from each other; a caller with no way to tell two requests
apart does not need to — mounting fresh for each request is enough on its own. The receiving side acts
on the request changing, the same shape `useHasChanged` gives a synchronised copy, rather than on a
counter it has to remember to reset.

## Watching whether an element is on screen

A control that needs to know whether it has scrolled out of view — to draw a floating stand-in, say —
uses `useIsScrolledOutOfView` in `frontend/src/Hooks/GeneralHooks/`, rather than a state flag kept by
hand with an `IntersectionObserver` in an effect. It returns `[isOutOfView, ref]`: attach the ref to
the element being watched, and the hook attaches and disconnects the observer as that element mounts
and unmounts, re-observing on its own if the ref moves to a different element.

Callers that watch more than one control call it once per control — it carries no shared state
between calls, so two controls each get their own answer.

## Lint and format

The SPA is linted by **ESLint** ([`frontend/eslint.config.mjs`](../../frontend/eslint.config.mjs),
flat config) and formatted by **Prettier** ([`frontend/.prettierrc.json`](../../frontend/.prettierrc.json)).
`npm run lint` and `npm run format:check` run both, and the `frontend` job in
[`.github/workflows/test.yml`](../../.github/workflows/test.yml) runs them beside the Vitest suite.
Fix what they report in the area you are editing. Where a rule is genuinely wrong for the code in
front of you — a chart asserted by selector because its marks carry no name, a clock the rule cannot
see the dependency for — disable it at the narrowest scope that covers the case and write the reason
on the disable. What is not wanted is a disable that exists to avoid the work.

The rule set is **`@eslint/js` recommended plus `eslint-plugin-react-hooks`**, with
`jsx-a11y` on the SPA and the Vitest and Testing Library plugins on `*.test.*`. React-specific
coverage comes from `react-hooks`, which carries the React Compiler's rules —
`set-state-in-effect`, `immutability`, `purity`, `refs` — that flag exactly the React 18 patterns
the section above asks you to migrate. The rules are a bar to write to, not a build step: the
compiler itself is **not** enabled, so nothing here is memoised for you.

There is no `eslint-plugin-react`: its `recommended` set is almost entirely `react/prop-types`, and
this SPA types through JSDoc.

`react-hooks/exhaustive-deps` is a **warning, and is never autofixed**. A narrow dependency list in
this tree is usually deliberate — a memo that must not recompute when an unrelated reducer dispatch
returns a new state object, a callback TanStack requires to stay referentially stable. Completing
such an array is a behaviour or performance change wearing a lint fix's clothes. Read the effect and
its tests, then either fix it properly or leave a `// eslint-disable-next-line` **carrying the
reason**.

A leading underscore (`_get`, `_ev`) marks a binding kept for arity or destructuring position;
`no-unused-vars` ignores those and will not ignore anything else.

## Frontend-specific bar (TBD)

Design-system / visual / SPA-only conventions (component libraries, routing, styling) will be written
here when we have them. Until then, follow the shared master — do not invent a second undocumented
global frontend standard.
