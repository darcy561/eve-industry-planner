import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { testQueryClient } from "./queryClients.js";
import { usersStoreState } from "./usersStoreHarness.js";
import { SIGN_IN_STATE_ENDPOINT } from "../Functions/Auth/signInState.js";

/**
 * A store state for code that resolves the planner a request works in.
 *
 * Signed in whenever an account is named, because the reads this is written for
 * are enabled on `account.isLoggedIn`: a signed-out state leaves them never
 * asking for anything, which reads as the code being wrong rather than the
 * setup being incomplete.
 *
 * The planner actions are the real ones, so a test exercises the actual fallback
 * to the account's own planner instead of a second copy of that rule.
 *
 * @param {{accountID?: string, owner?: string|null}} [overrides]
 * @returns {object} a state object for a `usersStore` mock
 */
export function activePlannerStoreState({
  accountID = "acct-1",
  owner = null,
} = {}) {
  return usersStoreState({
    account: { accountID, isLoggedIn: Boolean(accountID) },
    activePlanner: { owner },
  });
}

/**
 * An unsigned but structurally real ESI access JWT.
 *
 * The SPA reads `exp` and the identity claims out of tokens it is handed and never verifies a
 * signature — that is the server's job — so a token built here exercises the same paths a real one
 * does.
 *
 * @param {object} [claims]
 * @param {number} [claims.exp] - Unix seconds; defaults to an hour out.
 * @param {string} [claims.owner] - Character hash.
 * @param {string} [claims.name]
 * @param {number} [claims.characterID]
 * @returns {string}
 */
export function esiAccessToken(claims = {}) {
  const {
    exp = Math.floor(Date.now() / 1000) + 3600,
    owner = "owner-hash",
    name = "Test Pilot",
    characterID = 94800326,
  } = claims;
  const part = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, "");
  return `${part({ alg: "RS256" })}.${part({
    sub: `CHARACTER:EVE:${characterID}`,
    owner,
    name,
    exp,
  })}.signature`;
}

/**
 * Wraps an element in a React Query provider.
 *
 * A component that calls `useQueryClient` throws without one, and that is a
 * setup failure rather than anything the test is about. Retries are off so a
 * failing query fails the test immediately instead of timing it out.
 *
 * @param {React.ReactNode} ui
 * @returns {React.ReactElement}
 */
export function withQueryClient(ui) {
  return createElement(QueryClientProvider, { client: testQueryClient() }, ui);
}

/**
 * Answers the sign-in state mint.
 *
 * Every path that sends a reader to EVE SSO asks for one first, so a test about
 * something else on that path has to answer it or the redirect never happens.
 *
 * @param {unknown} url - The URL a fetch mock was called with.
 * @returns {boolean}
 */
export function isSignInStateRequest(url) {
  return String(url).includes(SIGN_IN_STATE_ENDPOINT);
}

/**
 * @param {string} [state]
 * @returns {Response}
 */
export function signInStateResponse(state = "test-sign-in-state") {
  return new Response(JSON.stringify({ state }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
