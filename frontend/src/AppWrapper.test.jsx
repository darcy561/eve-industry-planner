import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useTheme } from "@mui/material/styles";

/**
 * The theme has to sit above the router.
 *
 * The root route's guard does asynchronous work, so the router renders a pending screen
 * before the root route's component exists — and `App` is that component. A theme
 * provided inside it comes too late, and the whole UI arrives in light mode for as long
 * as the session takes to rebuild.
 *
 * This mounts the wrapper and asks the pending screen what theme it can see, which is
 * the one thing that tells a theme above the router from a theme inside it.
 */
vi.mock("./Components/routePending", () => ({
  RoutePending: function ThemeProbe() {
    return <div>pending sees: {useTheme().palette.mode}</div>;
  },
}));

vi.mock("./App", async () => {
  const { Outlet } = await import("@tanstack/react-router");
  return { default: () => <Outlet /> };
});

// Never resolves, so the root guard stays pending and its screen is what renders.
vi.mock("./Functions/Auth/resumeStoredSession.js", () => ({
  resumeStoredSession: () => new Promise(() => {}),
}));

vi.mock("./Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("./tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        isLoggedIn: false,
        accountID: null,
        actions: {
          getRequiresFirstLoginFlow: () => false,
          getIsLoggedIn: () => false,
        },
      },
      jobData: {
        activeGroupID: null,
        jobArray: [],
        groupArray: [],
        actions: {
          setActiveGroupID: () => {},
          clearActiveGroupID: () => {},
          findJobInJobArray: () => undefined,
          getGroupObject: () => null,
          jobsFromIdsOrObjects: async () => [],
        },
      },
    }),
  );
});

vi.mock("@sentry/react", () => ({ setUser: () => {} }));
vi.mock("./analytics/googleAnalytics", () => ({
  enableGa4WebVitals: () => {},
}));

window.matchMedia = (query) => ({
  matches: query.includes("dark"),
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// A route that rebuilds a session, so the root guard has something to wait on.
window.history.pushState({}, "", "/jobplanner");

const { AppWrapper } = await import("./AppWrapper.jsx");

describe("the theme a reader gets before any route has rendered", () => {
  it("is the app's own, not the library default", async () => {
    render(<AppWrapper />);

    await waitFor(() =>
      expect(screen.getByText(/pending sees:/)).toHaveTextContent(
        "pending sees: dark",
      ),
    );
  });
});
