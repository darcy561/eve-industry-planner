/**
 * Account slice: server session, linked ESI ID sets, and client `isLoggedIn`
 * (cleared by `resetAccountStore`). The full Mongo user row is not stored here — pass
 * `user_document` from the login response into `runPostLoginAccountSync` when needed.
 * Citadel-name sharing preference lives on Mongo `users` (`shareCitadelNames`); other application prefs on `applicationSettings`.
 *
 * Session field names align with the Go `Account` / API contract for the logged-in account.
 *
 * @fileoverview Account session, linked ESI, `characters`, and `corporations` for Zustand.
 * Session and linked refresh-token actions live in `tokenActions.js`.
 */

import Character from "../../Classes/character.js";
import { characterActions } from "./characterActions.js";
import { corporationsActions } from "./corporationsActions.js";
import { tokenActions } from "./tokenActions.js";
import { clearTabPlannerSession } from "../../Functions/Auth/tabSessionStorage.js";
import { asNumberIDSet } from "../../Functions/Helper/ids";

export const accountStateDefault = () => ({
  accountID: null,
  /** True after successful login flow (SSO + session); cleared on account reset / sign-out. */
  isLoggedIn: false,
  /** EVE `CharacterHash` of the character used for SSO login (main planner character). */
  mainCharacterHash: null,
  sessionID: null,
  /** Ms since epoch when POST /auth/sessions or /rotate last confirmed the planner session; throttles redundant rotates before private API calls. */
  lastPlannerSessionValidatedAt: null,
  /**
   * False during login until `applyClientSessionAfterAppTokens` finishes — blocks staggered ESI refresh
   * from racing session cookie application on the browser.
   */
  plannerPrivateAuthReady: true,
  /** Per-tab planner refresh token (mirrors sessionStorage; see tabSessionStorage.js). */
  refreshToken: null,
  refreshTokenEXP: null,
  /** From login response: Mongo first-login (new account) flag. */
  isFirstTimeLogin: false,
  /** Persisted on Mongo `users`: first-login guided flow completed (`user_document.hasCompletedFirstLoginFlow`). */
  hasCompletedFirstLoginFlow: false,
  /** Persisted on Mongo `users` (`user_document.shareCitadelNames`). */
  shareCitadelNames: true,
  /** ESI IDs for real-time linking (from login `user_document` linked* arrays when present). */
  linkedOrders: new Set(),
  linkedJobs: new Set(),
  linkedTrans: new Set(),
  /** Logged-in EVE characters (`Character` instances); main character is flagged with `isMainCharacter`. */
  characters: [Character.placeholder()],
  /**
   * Cloud login/bootstrap `linked_characters` hashes (deduped); reconcile uses these instead of GET
   * `/oauth-credentials` when the users doc omits refresh rows (cleared on logout / next login).
   */
  linkedCharacterHashesFromBootstrapSession: null,
  /**
   * True while `runPostLoginAccountSync` hydrates cloud `linked_characters` — realtime reconcile
   * must not mint duplicate ESI access or strip alts from an empty effective roster mid-flight.
   */
  linkedBootstrapHydrationPending: false,
  /** Loaded `Corporation` instances for the account (see `corporationsActions`). */
  corporations: [],
});

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
        !Boolean(state.account.hasCompletedFirstLoginFlow))
    );
  },

  ...tokenActions(set, get),

  resetAccountStore: () => {
    clearTabPlannerSession();
    get().realtimeSync?.actions?.reset?.();
    set(
      (state) => ({
        ...state,
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
        ...state,
        account: {
          ...state.account,
          isLoggedIn: Boolean(value),
          actions: state.account.actions,
        },
      }),
      false,
      "account/setLoggedIn",
    );
  },

  /**
   * Add/remove linked ESI order/job/transaction IDs (realtime sync, job lifecycle).
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

        acc.actions = state.account.actions;

        return { ...state, account: acc };
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
        ...state,
        account: {
          ...state.account,
          shareCitadelNames: !state.account.shareCitadelNames,
          actions: state.account.actions,
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
        ...state,
        account: {
          ...state.account,
          hasCompletedFirstLoginFlow: Boolean(value),
          actions: state.account.actions,
        },
      }),
      false,
      "account/setHasCompletedFirstLoginFlow",
    );
  },

  ...characterActions(set, get),
  ...corporationsActions(set, get),
});
