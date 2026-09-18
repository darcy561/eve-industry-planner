/**
 * The account slice's own starting shape, with nothing else in it.
 *
 * A leaf module for the reason `jobsSlice/stateDefault.js` is one: `account.js`
 * reaches the session client and the tab storage at import time, so the test
 * harness could not read the shape from it and kept a copy that drifted ten
 * fields behind.
 */

import Character from "../../Classes/character.js";

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
   * True while `runPostLoginAccountSync` hydrates cloud `linked_characters` — websocket reconcile
   * must not mint duplicate ESI access or strip alts from an empty effective roster mid-flight.
   */
  linkedBootstrapHydrationPending: false,
  /** Loaded `Corporation` instances for the account (see `corporationsActions`). */
  corporations: [],
  /** Loaded `Alliance` instances, one per alliance those corporations are in. */
  alliances: [],
});
