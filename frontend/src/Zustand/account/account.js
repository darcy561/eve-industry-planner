/**
 * Account slice: server session, linked ESI ID sets, and client `isLoggedIn`
 * (cleared by `resetAccountStore`). The full Mongo user row is not stored here — pass
 * `user_document` from the login response into `runPostLoginAccountSync` when needed.
 * Citadel-name sharing preference lives on Mongo `users` (`shareCitadelNames`); other application prefs on `applicationSettings`.
 *
 * Session field names align with the Go `Account` / API contract for the logged-in account.
 *
 * @fileoverview Account session, linked ESI, `characters`, and `corporations` for Zustand.
 * Session and linked refresh-token actions live in `plannerSessionActions.js`.
 */

import { accountStateDefault } from "./stateDefault.js";
import { characterActions } from "./characterActions.js";
import { corporationsActions } from "./corporationsActions.js";
import { alliancesActions } from "./alliancesActions.js";
import { plannerSessionActions } from "./plannerSessionActions.js";
import { clearTabPlannerSession } from "../../Functions/Auth/tabSessionStorage.js";
import { asNumberIDSet } from "../../Functions/Helper/ids";

export const accountActions = (set, get) => ({
  /**
   * @returns {string|null} Mongo account id from the login response.
   */
  getAccountID: () => get().account.accountID ?? null,

  /**
   * @returns {boolean} Client session is active (same flag as `account.isLoggedIn`).
   */
  getIsLoggedIn: () => Boolean(get().account.isLoggedIn),

  /**
   * EVE character hash for the login / main character. Empty string when logged out or unset.
   * @returns {string}
   */
  getMainCharacterHash: () => get().account.mainCharacterHash ?? "",

  /**
   * True when this logged-in account must complete the first-login guided flow.
   * Combines session-level first-login flag with persisted completion state.
   * @returns {boolean}
   */
  getRequiresFirstLoginFlow: () => {
    const state = get();
    return (
      Boolean(state.account.isLoggedIn) &&
      (Boolean(state.account.isFirstTimeLogin) ||
        !state.account.hasCompletedFirstLoginFlow)
    );
  },

  ...plannerSessionActions(set, get),

  resetAccountStore: () => {
    clearTabPlannerSession();
    get().websocketSync?.actions?.reset?.();
    set(
      (state) => ({
        account: {
          ...accountStateDefault(),
          actions: state.account.actions,
        },
      }),
      false,
      "account/resetAccountStore",
    );
  },

  /**
   * Client logged-in flag (true after successful login; cleared by sign-out / resetAccountStore).
   */
  setLoggedIn: (value) => {
    set(
      (state) => ({
        account: {
          ...state.account,
          isLoggedIn: Boolean(value),
        },
      }),
      false,
      "account/setLoggedIn",
    );
  },

  /**
   * Add/remove linked ESI order/job/transaction IDs (websocket sync, job lifecycle).
   */
  addLinkedEsiData: (esiData) => {
    if (!esiData) return;

    set(
      (state) => {
        const acc = { ...state.account };

        if (esiData.ordersToAdd) {
          acc.linkedOrders = new Set([
            ...acc.linkedOrders,
            ...esiData.ordersToAdd,
          ]);
        }
        if (esiData.jobsToAdd) {
          acc.linkedJobs = new Set([...acc.linkedJobs, ...esiData.jobsToAdd]);
        }
        if (esiData.transactionsToAdd) {
          acc.linkedTrans = new Set([
            ...acc.linkedTrans,
            ...asNumberIDSet(esiData.transactionsToAdd),
          ]);
        }

        if (esiData.ordersToRemove) {
          const removeSet = asNumberIDSet(esiData.ordersToRemove);
          acc.linkedOrders = new Set(
            [...acc.linkedOrders].filter((id) => !removeSet.has(id)),
          );
        }
        if (esiData.jobsToRemove) {
          const removeSet = asNumberIDSet(esiData.jobsToRemove);
          acc.linkedJobs = new Set(
            [...acc.linkedJobs].filter((id) => !removeSet.has(id)),
          );
        }
        if (esiData.transactionsToRemove) {
          const removeSet = asNumberIDSet(esiData.transactionsToRemove);
          acc.linkedTrans = new Set(
            [...acc.linkedTrans].filter((id) => !removeSet.has(id)),
          );
        }

        return { account: acc };
      },
      false,
      "account/addLinkedEsiData",
    );
  },

  /**
   * Serializable linked ESI IDs and user flags for `PUT /api/v1/user/main` (merged with refresh-token payload from token actions as needed).
   */
  linkedEsiToDocument: () => {
    const a = get().account;
    const cloudAccounts = !!get().applicationSettings.userCloudAccounts;
    return {
      linkedOrders: [...(a.linkedOrders || [])],
      linkedJobs: [...(a.linkedJobs || [])],
      linkedTrans: [...(a.linkedTrans || [])],
      userCloudAccounts: cloudAccounts,
      hasCompletedFirstLoginFlow: Boolean(a.hasCompletedFirstLoginFlow),
      shareCitadelNames: Boolean(a.shareCitadelNames),
    };
  },

  /**
   * Mirrors Mongo `users.shareCitadelNames`; persisted via {@link linkedEsiToDocument} PUT.
   */
  toggleShareCitadelNames: () => {
    set(
      (state) => ({
        account: {
          ...state.account,
          shareCitadelNames: !state.account.shareCitadelNames,
        },
      }),
      false,
      "account/toggleShareCitadelNames",
    );
  },

  /**
   * Mirrors Mongo `users.hasCompletedFirstLoginFlow`; persisted via {@link linkedEsiToDocument} PUT.
   *
   * @param {boolean} value
   */
  setHasCompletedFirstLoginFlow: (value) => {
    set(
      (state) => ({
        account: {
          ...state.account,
          hasCompletedFirstLoginFlow: Boolean(value),
        },
      }),
      false,
      "account/setHasCompletedFirstLoginFlow",
    );
  },

  ...characterActions(set, get),
  ...corporationsActions(set, get),
  ...alliancesActions(set, get),
});
