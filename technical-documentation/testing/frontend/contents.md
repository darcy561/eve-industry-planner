# Frontend tests

## Owns (SoT)

How the SPA under [`frontend/`](../../../frontend/) is tested, plus qualitative test depth in the topic files here.

## Does not own

- SPA behaviour → [frontend/contents.md](../../frontend/contents.md)
- Cross-cutting layers map → [../overview.md](../overview.md)
- Services / Deployment Tool depth → [../services/contents.md](../services/contents.md), [../deployment-tool/contents.md](../deployment-tool/contents.md)

## Depth labels

Same as other testing modules: **Tested** / **Thin** / **Little / none** (not coverage-%). See [services/contents.md](../services/contents.md) § Depth labels.

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Unit (Vitest) | From `frontend/`: `npm test` | Watch mode (Vitest) |
| Unit once | `npm test -- --run` | CI-style single pass |
| Coverage | `npm run coverage` | `vitest run --coverage` |
| CI | [`.github/workflows/test.yml`](../../../.github/workflows/test.yml) job `frontend` | Selected when `frontend/**` changes — [overview](../overview.md) § CI test suite |

`*.test.js(x)` sit beside the module they test under `frontend/src/`; reusable fixtures and helpers
live in `frontend/src/tests/`. Reach for an existing one before writing a mock: the users store is
mocked through `usersStoreHarness.js`, a static data file through `cachedDataMock.js` or seeded
through `seedItems.js` ([static-data.md](./static-data.md)), a location name through
`seedLocationNames.js`, the snackbar events through `snackbarHarness.js`, and a React Query client
comes from `queryClients.js`.

### Why a shared mock rather than one per file

Vitest throws on an export a `vi.mock` factory leaves out, so a mock naming only the functions its
subject calls today fails on setup the day that subject reaches for one more — with an error about
the mock rather than about the code. The modules this bites hardest are the ones that grow:
`getCachedData` gained four exports in two days, and three sessions each lost an afternoon reading
the resulting failure as a catastrophic regression.

So a mock standing in for a module — `snackbarHarness.js` and `cachedDataMock.js` — covers **every**
export of it, and carries a test comparing its export list against the real module rather than
against a copied list. (`usersStoreHarness.js` and `queryClients.js` build a state and a client
rather than replacing a module's exports, so there is no list for them to fall behind.) That guard
matches names only: a stub with the right name and a drifted return shape passes it and fails its
caller silently, which is worth an assertion of its own where a caller destructures the result.

`usersStoreHarness.js` has a second trap worth knowing before use. `usersStoreMock` takes either a
state or a reader function, and the reader form is the one that composes with change: slices are
merged into fresh objects, so a field set on an object passed to the eager form lands on a copy the
store no longer reads. Pass a function whenever the state names anything declared in the test file
(`vi.mock` is hoisted above those declarations) or changes between assertions.

`queryClients.js` offers three, because the differences are real. A `retry` set on an individual
query outlives a client default, so `retry: false` cannot switch those off — those tests collapse
`retryDelay` and keep the attempts.

What a helper here imports lands in every file that imports the helper, so an import with a
side effect at module scope is paid by all of them. Adding the real event system to the snackbar
mock — whose module scope constructs an `EventEmitter` — took `src/Hooks` from nine seconds to never
finishing, and four importing files were enough.

`usersStoreHarness.js` does import the store's own slice defaults, which is the shape to copy when a
mock would otherwise restate a real one. What makes those safe is not that they import nothing —
two of them import plenty — but that what they reach is constants and classes, which cost nothing to
evaluate. Check what a module does at import time before reaching for it, rather than avoiding the
import or taking it on trust.

Where a slice module is genuinely too heavy to import — `account` and `jobData` reach an API client,
and build the store itself as a side effect, which drags in everything the rest of it touches —
its `stateDefault()` lives in a **leaf module beside the slice**
([`jobsSlice/stateDefault.js`](../../../frontend/src/Zustand/jobsSlice/stateDefault.js),
[`account/stateDefault.js`](../../../frontend/src/Zustand/account/stateDefault.js)), which the slice
and the harness both import. Move the shape rather than copying it: the two that were written out by
hand here drifted thirteen fields behind the store before anything noticed, and a component asking
the harness for one of them got `undefined` where the real store gives a value.
[`documentLockSlice.js`](../../../frontend/src/Zustand/documentLockSlice.js) is the one still written
out, because it has no `stateDefault()` to import — its single field is inlined where the store is
built.

### Testing the store itself

The harness is for components. A test **about the store** — what an action does to a slice, what the
merge leaves alone, what a reset carries over — imports the real
[`usersStore.js`](../../../frontend/src/Zustand/usersStore.js) and drives its actions, because the
mock replaces exactly the machinery under test. Those tests sit beside the slice, hold the store
through a local `actions()` reader, and reset in `beforeEach`; mock the module a slice reaches for —
a debounced save scheduler, an API client — rather than the slice.

Vitest gives each file its own module registry, so the store singleton is fresh per file and shared
within one. That is safe and worth keeping: a test that depends on another's leftovers passes under
`--sequence.shuffle` only by luck.

What such a test is for is the behaviour that is invisible when it breaks: a pending-write queue
that starts replacing instead of merging loses an edit with nothing saying so. None of that shows up
in a component test, and none of it fails loudly. Write the assertion, then break the source and
watch it fail — a store test that has never been seen to fail is pinning nothing.

What a store write has to get right, and what a reset owes its slice →
[frontend/technical-rules.md](../../frontend/technical-rules.md) § Writing to a store slice,
enforced by `store-partials/no-whole-state-spread`.

## Task map

| I need to… | Read |
|------------|------|
| SPA auth test depth — credentials, credential health, planner session, login | [auth.md](./auth.md) |
| Routing test depth — the guard, route loaders, and the screens a reader sees | [navigation.md](./navigation.md) |
| Asset and blueprint collection test depth — builders, index hooks, scheduler, collection status, library rendering | [esi-collections.md](./esi-collections.md) |
| Accounts page test depth — the roster, a character's row and action menu, ESI status, corporations, shared planners | [accounts.md](./accounts.md) |
| Shared app-shell component test depth — rows, menus, the labelled-field shells | [components.md](./components.md) |
| Static data test depth — the file owners, and how to mock or seed one | [static-data.md](./static-data.md) |
| _(add rows as topic files land — e.g. document-lock, planner)_ | |
