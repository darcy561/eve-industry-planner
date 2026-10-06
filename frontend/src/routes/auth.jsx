import { createFileRoute, redirect } from "@tanstack/react-router";
import useUsersStore from "../Zustand/usersStore";
import { getRedirectPathAfterAuth } from "../utils/routeUtils";
import { startLogin } from "../Functions/Auth/loginProgress.js";
import AuthMainUser from "../Components/Auth/MainUserAuth";

export const Route = createFileRoute("/auth")({
  staticData: { audience: "transient" },
  beforeLoad: ({ search }) => {
    const state = useUsersStore.getState();
    const isLoggedIn = state.account.isLoggedIn;

    // If user is already logged in, redirect them away from auth page
    if (isLoggedIn) {
      throw redirect({
        to: getRedirectPathAfterAuth(search.state, "/dashboard"),
      });
    }

    // Before the page renders, so it never paints the last login's finished steps.
    startLogin();
  },
  component: AuthMainUser,
});
