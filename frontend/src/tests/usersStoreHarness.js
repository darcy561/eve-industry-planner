import { vi } from "vitest";
import { activePlannerActions } from "../Zustand/activePlanner/actions.js";
import { stateDefault as activePlannerDefault } from "../Zustand/activePlanner/core.js";
// Each slice's `core.js` rather than its index: an index also exports the
// actions, and importing those reaches `usersStore` itself, which builds the
// real store as a side effect of the harness being loaded.
import { stateDefault as applicationSettingsDefault } from "../Zustand/applicationSettings/core.js";
import { stateDefault as plannerSettingsDefault } from "../Zustand/plannerSettings/core.js";
import { stateDefault as worldDataDefault } from "../Zustand/worldDataSlice/core.js";

/**
 * The `usersStore` as a test sees it: say what you need, inherit the rest.
 *
 * Slice state comes from the real `stateDefault()` wherever importing it is
 * safe. It is not safe for `account`, `jobData` and `documentLock`, whose
 * modules reach the API client, the snackbar events and the lock transport at
 * import time — those three are written out below, and are the only shapes here
 * that can drift from the store.
 */

/**
 * Where `accountID` comes from when a test does not care what it is.
 *
 * Tests that assert on an ID should pass their own rather than matching this,
 * so the assertion says what it means.
 */
export const TEST_ACCOUNT_ID = "acc-1";

/**
 * The locale every formatting path reads.
 *
 * Number and date formatting call `getCurrentLocale`, and a slice missing it
 * throws mid-render — which surfaces as a component rendering its fallback
 * rather than as an obviously missing stub, so it is a default rather than
 * something a test opts into.
 */
export const TEST_LOCALE = "en-GB";

/**
 * Marks a state as already built, so {@link usersStoreMock} can tell one from
 * the overrides to build one from. Inferring it from the shape instead would
 * misread `{ activePlanner: … }` — a legitimate override — as a whole state and
 * silently return it without any of the other slices.
 */
const BUILT = Symbol("usersStoreState");

/**
 * Slice defaults, one function per store key.
 *
 * Split per slice so a caller can take one without the others, and so a slice
 * that grows a newly required field is edited in a single place.
 */
const sliceDefaults = {
  account: () => ({
    accountID: TEST_ACCOUNT_ID,
    isLoggedIn: false,
    characters: [],
    corporations: [],
    linkedJobs: [],
    linkedOrders: [],
    linkedTrans: [],
    actions: {
      getIsLoggedIn: () => false,
      getRequiresFirstLoginFlow: () => false,
      findCharacterByHash: () => null,
      getCorporation: () => null,
    },
  }),

  applicationSettings: () => ({
    ...applicationSettingsDefault(),
    actions: {
      getCurrentLocale: () => TEST_LOCALE,
    },
  }),

  plannerSettings: () => ({
    ...plannerSettingsDefault(),
    actions: {},
  }),

  jobData: () => ({
    jobArray: [],
    groupArray: [],
    multiSelect: [],
    activeJobID: null,
    activeGroupID: null,
    userWatchlist: { groups: [], items: [] },
    actions: {
      findJobInJobArray: () => null,
      getGroupObject: () => null,
      getActiveGroupObject: () => null,
      getCurrentParentJobs: () => [],
      updateActiveJob: vi.fn(),
      updateOrAddJobsToJobArray: vi.fn(),
      addGroupToGroupArray: vi.fn(),
      updateModifiedGroups: vi.fn(),
      removeFromMultiSelect: vi.fn(),
    },
  }),

  worldData: () => ({
    ...worldDataDefault(),
    actions: {
      findMarketData: () => null,
    },
  }),

  documentLock: () => ({
    scopes: {},
    actions: {
      patchDocumentLockForScope: vi.fn(),
      resetDocumentLockForScope: vi.fn(),
      resetAllDocumentLocks: vi.fn(),
    },
  }),

  headerDocumentLockUI: () => ({
    registrations: [],
    actions: {
      registerHeaderDocumentLockUI: vi.fn(),
      patchHeaderDocumentLockUI: vi.fn(),
      clearHeaderDocumentLockUI: vi.fn(),
    },
  }),

  realtimeSync: () => ({
    cursors: {},
    actions: {
      getCursorMs: () => 0,
      setCursorMs: vi.fn(),
      setCursorMsBatch: vi.fn(),
      reset: vi.fn(),
    },
  }),
};

/**
 * Merges an override onto a slice default, one level into `actions`.
 *
 * A plain spread would replace the whole `actions` object, so a test naming a
 * single action would silently drop the rest of the slice's stubs — the exact
 * breakage this module exists to stop. Everything outside `actions` is replaced
 * as given, because those are values rather than a namespace.
 */
function mergeSlice(base, override) {
  if (!override) return base;
  return {
    ...base,
    ...override,
    actions: { ...base.actions, ...override.actions },
  };
}

/**
 * A `usersStore` state.
 *
 * Every slice is present, so a component reaching for one the test did not think
 * about finds it rather than throwing. Pass overrides per slice:
 *
 * ```js
 * usersStoreState({
 *   account: { accountID: "acc-2", isLoggedIn: true },
 *   jobData: { jobArray: [job] },
 * });
 * ```
 *
 * `activePlanner` carries the **real** slice actions, resolved against the
 * finished state, so a test exercises the actual rule for which planner a read
 * belongs to — including the fallback to the account's own planner — instead of
 * a stub that agrees with it by hand.
 *
 * @param {Object} [overrides] - Per-slice overrides, merged one level into `actions`.
 * @returns {Object} A state object for a `usersStore` mock.
 */
export function usersStoreState(overrides = {}) {
  const { activePlanner: activePlannerOverride, ...sliceOverrides } = overrides;

  const state = {};
  for (const [key, build] of Object.entries(sliceDefaults)) {
    state[key] = mergeSlice(build(), sliceOverrides[key]);
  }

  // Unknown keys are kept rather than dropped: a test for a slice this module
  // does not model yet should not have to edit this file to run.
  for (const [key, value] of Object.entries(sliceOverrides)) {
    if (!(key in sliceDefaults)) state[key] = value;
  }

  state.activePlanner = { ...activePlannerDefault(), ...activePlannerOverride };
  // Built last, and against `state` itself: these actions read the planner and
  // the account off the state they are attached to, so they have to see the
  // overrides rather than the defaults.
  state.activePlanner.actions = activePlannerActions(
    () => {},
    () => state,
  );

  Object.defineProperty(state, BUILT, { value: true });
  return state;
}

/**
 * The module body for `vi.mock("…/Zustand/usersStore")`.
 *
 * Serves both ways the store is read, because the two are not interchangeable
 * and a test usually cannot tell which one the code under test uses:
 * a component calls the default export as a hook with a selector, while a
 * function outside React calls `getState()` on it.
 *
 * `vi.mock` is hoisted above imports, so the factory imports this itself:
 *
 * ```js
 * vi.mock("../../Zustand/usersStore", async () => {
 *   const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
 *   return usersStoreMock({ account: { isLoggedIn: true } });
 * });
 * ```
 *
 * Pass a function — `usersStoreMock(() => usersStoreState({…}))` — when the
 * state names anything declared in the test file, or when the test changes it
 * between assertions. Hoisting puts the factory above those declarations, so
 * reading them while building the state throws `Cannot access '…' before
 * initialization`; a reader runs once the store is used, by which point they
 * exist.
 *
 * **Setting a field on an object you passed in does not reach a state built
 * eagerly.** Slices are merged into fresh objects, so `usersStoreMock({ account })`
 * followed by `account.characters = […]` in a `beforeEach` leaves the store
 * holding the copy taken when it was built — every test then sees whatever the
 * first one set. Keeping the same object identity does not help; the reader form
 * is what makes a later write visible.
 *
 * @param {Object|Function} [state] - A state from {@link usersStoreState}, the
 *   overrides to build one from, or a function returning the current state for a
 *   test that changes it between assertions.
 * @returns {{default: Function}} The mocked module.
 */
export function usersStoreMock(state = {}) {
  const read =
    typeof state === "function"
      ? state
      : (() => {
          const built = state[BUILT] ? state : usersStoreState(state);
          return () => built;
        })();

  return {
    default: Object.assign(
      (selector) =>
        typeof selector === "function" ? selector(read()) : read(),
      { getState: () => read() },
    ),
  };
}
