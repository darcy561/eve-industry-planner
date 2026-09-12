import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

const { app } = vi.hoisted(() => ({
  app: { isLoggedIn: true, jobArray: [], groupArray: [] },
}));

// The root route renders the whole application shell; what is under test here is which
// screen the router puts in front of a reader, so the shell is an Outlet.
vi.mock("../App", async () => {
  const { Outlet } = await import("@tanstack/react-router");
  return { default: () => <Outlet /> };
});

vi.mock("../Zustand/usersStore", () => {
  const state = () => ({
    account: {
      isLoggedIn: app.isLoggedIn,
      actions: {
        getRequiresFirstLoginFlow: () => false,
        getIsLoggedIn: () => app.isLoggedIn,
      },
    },
    jobData: {
      activeGroupID: null,
      jobArray: app.jobArray,
      groupArray: app.groupArray,
      actions: {
        setActiveGroupID: () => {},
        clearActiveGroupID: () => {},
        findJobInJobArray: (jobID) =>
          app.jobArray.find((job) => job.jobID === jobID),
        getGroupObject: () => null,
        jobsFromIdsOrObjects: async () => app.jobArray,
      },
    },
  });
  const users = (selector) => selector(state());
  users.getState = state;
  return { default: users };
});

vi.mock("../Functions/Auth/resumeStoredSession.js", () => ({
  resumeStoredSession: async () => "no-session",
}));

const { renderRoute } = await import("../tests/routerHarness.jsx");

beforeEach(() => {
  app.isLoggedIn = true;
  app.jobArray = [];
  app.groupArray = [];
});

describe("the screen the router puts in front of a reader", () => {
  // Wired by `defaultNotFoundComponent`; nothing else would say whether the router
  // reaches for it, or whether a rename quietly left it unreferenced.
  it("is the not-found page when a loader cannot find what the URL names", async () => {
    await renderRoute("/editjob/gone");

    expect(screen.getByText("We could not find that")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to the job planner" }),
    ).toHaveAttribute("href", "/jobplanner");
  });

  it("is the not-found page for a group that does not exist", async () => {
    await renderRoute("/group/gone");

    expect(screen.getByText("We could not find that")).toBeVisible();
  });

  // A route's page is a lazy chunk that jsdom does not resolve, so this is as far as a
  // rendering test reaches: the router settled on the route and is waiting for its
  // component, rather than refusing the URL.
  // A reader with no account never sent their work anywhere, so a reload is why they
  // are here — not a deleted job.
  it("is the not-found page worded for a reader without an account", async () => {
    app.isLoggedIn = false;

    await renderRoute("/editjob/gone");

    expect(screen.getByText(/kept only while you are here/)).toBeVisible();
    expect(screen.queryByText(/may have been deleted/)).toBeNull();
  });

  it("is worded for a deleted job when a reader is signed in", async () => {
    await renderRoute("/editjob/gone");

    expect(screen.getByText(/may have been deleted/)).toBeVisible();
  });

  it("is the route's own pending screen once its loader is satisfied", async () => {
    app.jobArray = [{ jobID: "job-1" }];

    const { router } = await renderRoute("/editjob/job-1");

    expect(screen.queryByText("We could not find that")).toBeNull();
    expect(screen.getByRole("status")).toBeVisible();
    expect(router.state.location.pathname).toBe("/editjob/job-1");
  });
});
