import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

const { app } = vi.hoisted(() => ({
  app: { isLoggedIn: true, jobArray: [], groupArray: [] },
}));

vi.mock("../App", async () => {
  const { Outlet } = await import("@tanstack/react-router");
  return { default: () => <Outlet /> };
});

vi.mock("../Components/Edit Job/editJob", () => ({
  default: () => <p>Edit job page</p>,
}));

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

  it("is the route's own page once its loader is satisfied", async () => {
    app.jobArray = [{ jobID: "job-1" }];

    const { router } = await renderRoute("/editjob/job-1");

    expect(screen.queryByText("We could not find that")).toBeNull();
    expect(await screen.findByText("Edit job page")).toBeVisible();
    expect(router.state.location.pathname).toBe("/editjob/job-1");
  });
});
