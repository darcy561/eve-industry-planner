import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "../../../tests/routerHarness";

const { loggedIn } = vi.hoisted(() => ({ loggedIn: { current: true } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: { isLoggedIn: loggedIn.current },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  );
});

vi.mock("../../../Hooks/React Query/tranquilityServerStatus.js", () => ({
  useTranquilityServerStatusQuery: () => ({
    data: { online: true, playerCount: 20000 },
  }),
}));

vi.mock("./plannerSwitcher.jsx", () => ({ PlannerSwitcher: () => null }));

const { SideMenu } = await import("./sidemenu.jsx");
const { SIGNOUT_INTENT } =
  await import("../../../Functions/Auth/signoutIntent.js");

const DESTINATIONS = [
  ["Dashboard", "/dashboard"],
  ["Asset Library", "/asset-library"],
  ["Blueprint Library", "/blueprint-library"],
  ["Archived Jobs", "/archived-jobs"],
  ["Job Planner", "/jobplanner"],
  ["Reprocessing Calculator", "/reprocessing"],
  ["Item Tree", "/itemtrees"],
  ["Accounts", "/accounts"],
  ["Settings", "/settings"],
];

const setOpen = vi.fn();

function showMenu() {
  return renderWithRouter(<SideMenu open setOpen={setOpen} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  loggedIn.current = true;
});

describe("the side menu", () => {
  it.each(DESTINATIONS)("points %s at %s", async (label, path) => {
    await showMenu();

    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      path,
    );
  });

  it("sends a signed-out reader home rather than to the dashboard", async () => {
    loggedIn.current = false;

    await showMenu();

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });

  // Which entries a reader sees is the routes' own answer, so this is the audience
  // declarations read back rather than a list the menu keeps of its own.
  it.each(["Asset Library", "Blueprint Library", "Archived Jobs", "Settings"])(
    "keeps %s from a signed-out reader",
    async (label) => {
      loggedIn.current = false;

      await showMenu();

      expect(screen.queryByRole("link", { name: label })).toBeNull();
    },
  );

  it.each(["Job Planner", "Reprocessing Calculator", "Item Tree"])(
    "offers %s to a signed-out reader",
    async (label) => {
      loggedIn.current = false;

      await showMenu();

      expect(screen.getByRole("link", { name: label })).toBeVisible();
    },
  );

  it("closes the drawer behind a reader who follows a link", async () => {
    await showMenu();

    await userEvent.click(screen.getByRole("link", { name: "Job Planner" }));

    expect(setOpen).toHaveBeenCalledWith(false);
  });

  // Ctrl-clicking opens the destination elsewhere, so the reader is still
  // standing in front of the menu they clicked.
  it("leaves the drawer open behind a link opened in another tab", async () => {
    const user = userEvent.setup();
    await showMenu();

    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("link", { name: "Job Planner" }));
    await user.keyboard("{/Control}");

    expect(setOpen).not.toHaveBeenCalled();
  });

  // Signing out happens in the route's `beforeLoad`, and the router preloads on
  // intent, so a link here would end the session on hover.
  it("keeps Sign Out off the preloading link path", async () => {
    await showMenu();

    expect(screen.queryByRole("link", { name: "Sign Out" })).toBeNull();
    expect(screen.getByText("Sign Out")).toBeVisible();
  });

  // The route refuses to tear anything down without this, so a menu that stopped
  // sending it would leave a Sign Out button that does nothing.
  it("marks the navigation as one the app made", async () => {
    const { router } = await showMenu();
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);

    await userEvent.click(screen.getByText("Sign Out"));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/signout", state: SIGNOUT_INTENT }),
    );
  });
});
