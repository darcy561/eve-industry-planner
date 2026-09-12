import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../tests/routerHarness";

const { account } = vi.hoisted(() => ({ account: { isLoggedIn: true } }));

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ account: { isLoggedIn: account.isLoggedIn } }),
  );
});

const { RouteNotFound } = await import("./routeNotFound.jsx");

beforeEach(() => {
  account.isLoggedIn = true;
});

describe("a URL naming something that is not there", () => {
  it("says so rather than leaving a reader guessing", async () => {
    await renderWithRouter(<RouteNotFound />);

    expect(screen.getByText("We could not find that")).toBeVisible();
  });

  // A reader who followed a stale link needs somewhere to go; the alternative is a
  // page with nothing on it.
  it("offers the way back as a real link", async () => {
    await renderWithRouter(<RouteNotFound />);

    expect(
      screen.getByRole("link", { name: "Back to the job planner" }),
    ).toHaveAttribute("href", "/jobplanner");
  });

  it("tells a signed-in reader the link or the thing may be gone", async () => {
    await renderWithRouter(<RouteNotFound />);

    expect(screen.getByText(/may have been deleted/)).toBeVisible();
  });

  // Their work was never sent anywhere, so a reload is the usual reason they are here.
  // Telling them something was deleted would be untrue.
  it("tells a signed-out reader their work was not kept", async () => {
    account.isLoggedIn = false;

    await renderWithRouter(<RouteNotFound />);

    expect(screen.getByText(/kept only while you are here/)).toBeVisible();
    expect(screen.queryByText(/may have been deleted/)).toBeNull();
  });
});
