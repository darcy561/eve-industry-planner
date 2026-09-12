import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The whole way in: a reader with a session the browser still holds opens a deep link
 * to a job inside a group, and everything that has to happen before that page can draw
 * happens on the way.
 *
 * Only the edges are stood in for — the network the login talks to, and the browser
 * storage that says a session can be rebuilt. The guard, the resume, the login's own
 * step reporting and both route loaders are the real ones.
 */
const { app } = vi.hoisted(() => ({
  app: {
    isLoggedIn: false,
    storedSession: true,
    reauthDue: false,
    activeGroupID: null,
    jobArray: [],
    groupArray: [],
    fetched: [],
    loginsRun: 0,
  },
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
      activeGroupID: app.activeGroupID,
      jobArray: app.jobArray,
      groupArray: app.groupArray,
      actions: {
        setActiveGroupID: (groupID) => {
          app.activeGroupID = groupID;
        },
        clearActiveGroupID: () => {
          app.activeGroupID = null;
        },
        findJobInJobArray: (jobID) =>
          app.jobArray.find((job) => job.jobID === jobID),
        getGroupObject: (groupID) =>
          app.groupArray.find((group) => group.groupID === groupID) ?? null,
        jobsFromIdsOrObjects: async (ids) => {
          app.fetched.push([...ids]);
          if (!app.isLoggedIn) return [];
          for (const jobID of ids) {
            if (!app.jobArray.some((job) => job.jobID === jobID)) {
              app.jobArray.push({ jobID });
            }
          }
          return app.jobArray;
        },
      },
    },
  });
  const users = (selector) => selector(state());
  users.getState = state;
  return { default: users };
});

vi.mock("../Functions/Auth/tabSessionStorage.js", () => ({
  hasResumablePlannerSession: () => app.storedSession,
  getTabPlannerRefreshToken: () => "tab-refresh",
  isPlannerReauthDeadlinePassed: () => app.reauthDue,
  clearTabPlannerSession: () => {},
}));

// Stands in for the network: signs the reader in, then reports the same four steps the
// bootstrap calls do — the ones the guard waits on before a page is allowed to draw.
vi.mock("../Functions/Auth/appLoginFlow.js", async () => {
  const { emitLoginStepComplete, LOGIN_STEPS } =
    await import("../Events/loginEvents.js");
  return {
    runAppLogin: async () => {
      app.loginsRun += 1;
      app.isLoggedIn = true;
      for (const step of Object.values(LOGIN_STEPS)) {
        emitLoginStepComplete(step);
      }
    },
  };
});

const { default: Group } = await import("../Classes/group.js");
const { loginProgress } = await import("../Functions/Auth/loginProgress.js");
const { enterRoute } = await import("../tests/routerHarness.jsx");

beforeEach(() => {
  app.isLoggedIn = false;
  app.storedSession = true;
  app.reauthDue = false;
  app.activeGroupID = null;
  app.jobArray = [];
  app.groupArray = [
    new Group({ groupID: "group-1", includedJobIDs: ["job-1", "job-2"] }),
  ];
  app.fetched = [];
  app.loginsRun = 0;
  localStorage.setItem("Auth", "stored-esi-refresh");
});

describe("opening a deep link to a job in a group, signed out", () => {
  it("arrives on that job with everything it needs", async () => {
    const { pathname, routeId, isNotFound } = await enterRoute(
      "/editjob/job-1?activeGroup=group-1",
    );

    expect(app.loginsRun).toBe(1);
    expect(app.isLoggedIn).toBe(true);

    // The job, then the group's other jobs — neither is loaded by signing in.
    expect(app.fetched).toEqual([["job-1"], ["job-1", "job-2"]]);
    expect(app.activeGroupID).toBe("group-1");

    expect(routeId).toBe("/editjob/$jobID");
    expect(pathname).toBe("/editjob/job-1");
    expect(isNotFound).toBe(false);
  });

  // The guard waits on the login's steps, not on being authenticated: the planner's
  // own data is still arriving when `runAppLogin` returns.
  it("does not reach the loaders until the login has finished", async () => {
    await enterRoute("/editjob/job-1?activeGroup=group-1");

    const { completedSteps } = loginProgress();
    expect(completedSteps.size).toBe(4);
  });

  // The search survives because nothing navigated: the resume happened where the
  // reader already was.
  it("keeps the search the link carried", async () => {
    const { search } = await enterRoute(
      "/editjob/job-1?activeGroup=group-1&pageView=outputs",
    );

    expect(search).toMatchObject({
      activeGroup: "group-1",
      pageView: "outputs",
    });
  });

  it("signs the reader in once, not once per route entered", async () => {
    await enterRoute("/editjob/job-1?activeGroup=group-1");

    expect(app.loginsRun).toBe(1);
  });
});

describe("the same link with nothing to rebuild", () => {
  beforeEach(() => {
    app.storedSession = false;
    localStorage.removeItem("Auth");
  });

  // The route is public, so a reader with no session is not sent to sign in — but the
  // job cannot be fetched for them, and saying so beats an empty page.
  it("leaves the reader signed out and reports the job as not found", async () => {
    const { isNotFound } = await enterRoute(
      "/editjob/job-1?activeGroup=group-1",
    );

    expect(app.loginsRun).toBe(0);
    expect(isNotFound).toBe(true);
  });

  // Work built without an account never leaves the browser, so there is nothing to
  // rebuild and nothing to fetch — the planner is theirs to use as it is.
  it("opens a job they built in this visit without signing them in", async () => {
    app.jobArray = [{ jobID: "local-job" }];

    const { pathname, isNotFound } = await enterRoute("/editjob/local-job");

    expect(app.loginsRun).toBe(0);
    expect(app.isLoggedIn).toBe(false);
    expect(isNotFound).toBe(false);
    expect(pathname).toBe("/editjob/local-job");
  });

  it("does not hold a public page up waiting for a login", async () => {
    const { pathname } = await enterRoute("/jobplanner");

    expect(app.loginsRun).toBe(0);
    expect(pathname).toBe("/jobplanner");
  });
});
