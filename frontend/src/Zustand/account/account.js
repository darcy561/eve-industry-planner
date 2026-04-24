/**
 * Account slice: server session (JWT), linked ESI ID sets, and client `isLoggedIn`
 * (cleared by `resetAccountStore`). The full Mongo user row is not stored here — pass
 * `user_document` from the login response into `runPostLoginAccountSync` when needed.
 * Application prefs live on `applicationSettings`.
 *
 * Session field names align with the Go `Account` / API contract for the logged-in account.
 *
 * @fileoverview Account session, linked ESI, `characters`, and `corporations` for Zustand.
 * JWT / SSO session and linked refresh-token actions live in `tokenActions.js`.
 */

import Character from "../../Classes/character.js";
import { characterActions } from "./characterActions.js";
import { corporationsActions } from "./corporationsActions.js";
import { tokenActions } from "./tokenActions.js";

export const accountStateDefault = () => ({
  accountID: null,
  /** True after successful login flow (SSO + session); cleared on account reset / sign-out. */
  isLoggedIn: false,
  /** EVE `CharacterHash` of the character used for SSO login (main planner character). */
  mainCharacterHash: null,
  accessToken: null,
  accessTokenEXP: 0,
  sessionID: null,
  refreshToken: null,
  refreshTokenEXP: null,
  /** From login response: Mongo first-login (new account) flag. */
  isFirstTimeLogin: false,
  /** ESI IDs for real-time linking (from login `user_document` linked* arrays when present). */
  linkedOrders: new Set(),
  linkedJobs: new Set(),
  linkedTrans: new Set(),
  /**
   * ESI refresh tokens for linked characters (`CharacterHash` + `rToken`), distinct from
   * session `refreshToken` / `refreshTokenEXP` for the app JWT.
   */
  linkedCharacterRefreshTokens: [],
  /** Logged-in EVE characters (`Character` instances); main character is flagged with `isMainCharacter`. */
  characters: [Character.placeholder()],
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

  ...tokenActions(set, get),

  resetAccountStore: () => {
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
      "account/resetAccountStore"
    );
  },

  /**
   * Client logged-in flag (true after successful JWT login; cleared by sign-out / resetAccountStore).
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
      "account/setLoggedIn"
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
            ...Array.from(esiData.transactionsToAdd, normalizeLinkedID).filter(
              (id) => typeof id === "number" && Number.isFinite(id)
            ),
          ]);
        }

        if (esiData.ordersToRemove) {
          const removeSet =
            esiData.ordersToRemove instanceof Set
              ? esiData.ordersToRemove
              : new Set(esiData.ordersToRemove);
          acc.linkedOrders = new Set(
            [...acc.linkedOrders].filter((id) => !removeSet.has(id))
          );
        }
        if (esiData.jobsToRemove) {
          const removeSet =
            esiData.jobsToRemove instanceof Set
              ? esiData.jobsToRemove
              : new Set(esiData.jobsToRemove);
          acc.linkedJobs = new Set(
            [...acc.linkedJobs].filter((id) => !removeSet.has(id))
          );
        }
        if (esiData.transactionsToRemove) {
          const removeSet =
            esiData.transactionsToRemove instanceof Set
              ? new Set(
                  Array.from(
                    esiData.transactionsToRemove,
                    normalizeLinkedID
                  ).filter(
                    (id) => typeof id === "number" && Number.isFinite(id)
                  )
                )
              : new Set(
                  (esiData.transactionsToRemove || [])
                    .map(normalizeLinkedID)
                    .filter(
                      (id) => typeof id === "number" && Number.isFinite(id)
                    )
                );
          acc.linkedTrans = new Set(
            [...acc.linkedTrans].filter((id) => !removeSet.has(id))
          );
        }

        acc.actions = state.account.actions;

        return { ...state, account: acc };
      },
      false,
      "account/addLinkedEsiData"
    );
  },

  /**
   * Serializable linked ESI IDs for `PUT /api/v1/user/main` (with `users.actions.toDocument()` for refresh tokens).
   */
  linkedEsiToDocument: () => {
    const a = get().account;
    return {
      linkedOrders: [...(a.linkedOrders || [])],
      linkedJobs: [...(a.linkedJobs || [])],
      linkedTrans: [...(a.linkedTrans || [])],
    };
  },

  ...characterActions(set, get),
  ...corporationsActions(set, get),
});

function normalizeLinkedID(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
  }

  return null;
}
