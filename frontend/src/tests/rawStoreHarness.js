import { create } from "zustand";

/**
 * Holds the store a test built, for a hoisted `vi.mock` factory to close over
 * and answer `usersStore` from.
 */
export const storeHolder = { current: null };

/**
 * The module shape `vi.mock` returns for `usersStore`.
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
 * Builds the store the mock will answer from, before any fixture that reads it
 * is built.
 *
 * @param {(set: Function, get: Function) => object} initialiser
 * @returns {import("zustand").StoreApi<object>}
 */
export function standUpStore(initialiser) {
  storeHolder.current = create(initialiser);
  return storeHolder.current;
}
