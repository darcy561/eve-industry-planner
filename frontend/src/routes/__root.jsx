import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import App from "../App";
import useUsersStore from "../Zustand/usersStore";

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const state = useUsersStore.getState();
    const requiresFirstLogin =
      state.account.actions.getRequiresFirstLoginFlow();

    if (requiresFirstLogin && location.pathname !== "/first-login") {
      throw redirect({ to: "/first-login" });
    }
  },
  component: App,
});
