import { accountOwnerHandle, stateDefault } from "./core.js";

export const activePlannerActions = (set, get) => ({
  /**
   * The planner every scoped read and write is for, the account's own until one
   * is named.
   *
   * @returns {string|null} an owner handle, null when nobody is signed in
   */
  getActivePlannerOwner: () => {
    const named = get().activePlanner.owner;
    if (named) return named;
    return accountOwnerHandle(get().account.accountID) || null;
  },

  /** @param {string|null} ownerHandle */
  setActivePlannerOwner: (ownerHandle) => {
    const owner = ownerHandle || null;
    if (get().activePlanner.owner === owner) return;
    set(
      (state) => ({
        activePlanner: {
          ...state.activePlanner,
          owner,
        },
      }),
      false,
      "activePlanner/setActivePlannerOwner",
    );
  },

  /** Drops the named planner, for a sign-out. */
  resetActivePlannerStore: () => {
    set(
      (state) => ({
        activePlanner: {
          ...stateDefault(),
          actions: state.activePlanner.actions,
        },
      }),
      false,
      "resetActivePlannerStore",
    );
  },
});
