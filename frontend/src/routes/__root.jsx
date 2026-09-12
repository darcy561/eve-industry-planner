import { createRootRoute, redirect } from "@tanstack/react-router";
import App from "../App";
import useUsersStore from "../Zustand/usersStore";
import { queryClient } from "../queryClient.js";
import { resumeStoredSession } from "../Functions/Auth/resumeStoredSession.js";
import { applyActiveGroupForRoute } from "../Functions/Groups/activeGroupForRoute.js";

/**
 * The one guard. Every route states its audience and this acts on it, so there is a
 * single place that decides whether a reader may be here and what has to happen first.
 *
 * The resume is awaited rather than left running: the login builds the ESI data the
 * planner draws from, and a page rendered against a half-built store shows figures that
 * are wrong rather than late.
 */
export const Route = createRootRoute({
  beforeLoad: async ({ location, matches, params, search, preload }) => {
    const state = useUsersStore.getState();

    if (
      state.account.actions.getRequiresFirstLoginFlow() &&
      location.pathname !== "/first-login"
    ) {
      throw redirect({ to: "/first-login" });
    }

    // Not on a preload: hovering a link is not arriving at it, and the group a reader
    // is working in must not change under them because they passed over something.
    if (!preload) {
      applyActiveGroupForRoute({
        routeId: matches?.at(-1)?.routeId,
        params,
        search,
      });
    }

    const { audience, resumeSession } = routeBeingEntered(matches);
    if (audience === "transient") return;

    let resumed = "no-session";
    if (!state.account.isLoggedIn && resumeSession) {
      resumed = await resumeStoredSession({ queryClient });
    }

    // A reader who had a session and lost it is asked to sign in again whatever the
    // route's audience: dropping them onto a signed-out public page hides the loss,
    // and the page they are looking at is not the one they thought they had.
    if (
      (resumed === "failed" || audience === "private") &&
      !useUsersStore.getState().account.isLoggedIn
    ) {
      throw redirect({ to: "/auth", search: { state: location.href } });
    }
  },
  component: App,
});

/** What the leaf of the matched chain says about itself; private when it says nothing. */
function routeBeingEntered(matches) {
  const leaf = matches?.at(-1)?.staticData ?? {};
  return {
    audience: leaf.audience ?? "private",
    resumeSession: leaf.resumeSession !== false,
  };
}
