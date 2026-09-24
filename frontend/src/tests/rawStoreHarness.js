import { create } from "zustand";

/**
 * A stand-in for `usersStore` that a test builds itself, rather than the
 * component-facing mock in `usersStoreHarness.js`.
 *
 * The two answer different needs. `usersStoreMock` gives a component a store
 * with the SPA's own slices already in it; this one hands the test the whole
 * store, including `setState`, which the functions under `Functions/` reach for
 * directly.
 *
 * The store lives behind a holder because `vi.mock` is hoisted above the test
 * file: the mock factory runs before any store could be built, so it can only
 * close over something that is filled in later.
 */
export const storeHolder = { current: null };

/**
 * The module shape `vi.mock` returns for `usersStore`.
 *
 * @example
 * vi.mock("../../Zustand/usersStore", async () => {
 *   const { rawStoreMock } = await import("../../tests/rawStoreHarness.js");
 *   return rawStoreMock();
 * });
 */
export function rawStoreMock() {
  return {
    default: {
      getState: () => storeHolder.current.getState(),
      setState: (...args) => storeHolder.current.setState(...args),
    },
  };
}

/**
 * Builds the store the mock will answer from, and returns it.
 *
 * Call it before building any fixture that reads the store — a `Job` reads the
 * account off it as it is constructed, so one made first has nothing to read.
 *
 * @param {(set: Function, get: Function) => object} initialiser
 * @returns {import("zustand").StoreApi<object>}
 */
export function standUpStore(initialiser) {
  storeHolder.current = create(initialiser);
  return storeHolder.current;
}
