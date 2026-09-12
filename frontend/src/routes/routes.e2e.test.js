import { beforeEach, describe, expect, it, vi } from "vitest";

const { app } = vi.hoisted(() => ({
  app: {
    isLoggedIn: false,
    requiresFirstLogin: false,
    activeGroupID: null,
    jobArray: [],
    groupArray: [],
    fetched: [],
    resumes: "no-session",
  },
}));

vi.mock("../Zustand/usersStore", () => {
  const state = () => ({
    account: {
      isLoggedIn: app.isLoggedIn,
      actions: {
        getRequiresFirstLoginFlow: () => app.requiresFirstLogin,
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

vi.mock("../Functions/Auth/resumeStoredSession.js", () => ({
  resumeStoredSession: async () => {
    if (app.resumes !== "rebuilt") return app.resumes;
    app.isLoggedIn = true;
    return "rebuilt";
  },
}));

const { default: Group } = await import("../Classes/group.js");
const { emitLoginStepComplete, LOGIN_STEPS } =
  await import("../Events/loginEvents.js");
const { loginProgress } = await import("../Functions/Auth/loginProgress.js");
const { enterRoute, testRouter } = await import("../tests/routerHarness.jsx");

beforeEach(() => {
  app.isLoggedIn = false;
  app.requiresFirstLogin = false;
  app.activeGroupID = null;
  app.jobArray = [];
  app.groupArray = [];
  app.fetched = [];
  app.resumes = "no-session";
});

describe("walking into a page signed out", () => {
  it.each(["/jobplanner", "/reprocessing", "/itemtrees", "/"])(
    "lets a reader onto %s",
    async (url) => {
      const { pathname } = await enterRoute(url);

      expect(pathname).toBe(url);
    },
  );

  it.each(["/settings", "/dashboard", "/accounts", "/archived-jobs"])(
    "sends them from %s to sign in",
    async (url) => {
      const { pathname } = await enterRoute(url);

      expect(pathname).toBe("/auth");
    },
  );

  // The whole location, so signing in returns them to what they asked for.
  it("carries the page they were headed to, search and all", async () => {
    const { search } = await enterRoute("/settings?tab=notifications");

    expect(search.state).toBe("/settings?tab=notifications");
  });
});

describe("walking in with a session to rebuild", () => {
  beforeEach(() => {
    app.resumes = "rebuilt";
  });

  it("rebuilds it before a public page is reached", async () => {
    const { pathname } = await enterRoute("/jobplanner");

    expect(pathname).toBe("/jobplanner");
    expect(app.isLoggedIn).toBe(true);
  });

  it("leaves a reader who is already signed in alone", async () => {
    app.isLoggedIn = true;
    app.resumes = "no-session";

    const { pathname } = await enterRoute("/jobplanner");

    expect(pathname).toBe("/jobplanner");
  });

  it("does not rebuild on the way to signing in", async () => {
    const { pathname } = await enterRoute("/auth");

    expect(pathname).toBe("/auth");
    expect(app.isLoggedIn).toBe(false);
  });

  it("rebuilds it and lets them onto a private page", async () => {
    const { pathname } = await enterRoute("/settings");

    expect(pathname).toBe("/settings");
  });

  // The marketing page reads signed out; the session rebuilds on the first real page.
  it("does not rebuild on the landing page", async () => {
    const { pathname } = await enterRoute("/");

    expect(pathname).toBe("/");
    expect(app.isLoggedIn).toBe(false);
  });
});

describe("a session that fails to rebuild", () => {
  beforeEach(() => {
    app.resumes = "failed";
  });

  // Rendering the signed-out planner would hide the loss: the reader still believes
  // they have a session, and their jobs are simply missing from the page.
  it.each(["/jobplanner", "/reprocessing", "/itemtrees"])(
    "sends them from %s to sign in",
    async (url) => {
      const { pathname } = await enterRoute(url);

      expect(pathname).toBe("/auth");
    },
  );

  it("carries the page they were on, so they come back to it", async () => {
    const { search } = await enterRoute("/jobplanner?tab=groups");

    expect(search.state).toBe("/jobplanner?tab=groups");
  });

  it("sends them to sign in from a private page too", async () => {
    const { pathname } = await enterRoute("/settings");

    expect(pathname).toBe("/auth");
  });

  // Nothing to lose and nothing to explain: a reader who never had a session is the
  // signed-out reader the public pages are built for.
  it("leaves a reader with no session at all on a public page", async () => {
    app.resumes = "no-session";

    const { pathname } = await enterRoute("/jobplanner");

    expect(pathname).toBe("/jobplanner");
  });
});

describe("opening a job", () => {
  beforeEach(() => {
    app.isLoggedIn = true;
  });

  // The case the whole stage exists for: the login loads the jobs on the planner, and
  // a job inside a group is not one of them.
  it("fetches a job the login never loaded, then shows it", async () => {
    const { pathname, isNotFound } = await enterRoute(
      "/editjob/job-in-a-group",
    );

    expect(app.fetched).toContainEqual(["job-in-a-group"]);
    expect(pathname).toBe("/editjob/job-in-a-group");
    expect(isNotFound).toBe(false);
  });

  it("says so when the job does not exist", async () => {
    app.isLoggedIn = false;

    const { isNotFound } = await enterRoute("/editjob/gone");

    expect(isNotFound).toBe(true);
  });

  it("loads the group's jobs when the link names one", async () => {
    app.groupArray = [
      new Group({
        groupID: "group-1",
        includedJobIDs: ["job-1", "job-2"],
      }),
    ];

    await enterRoute("/editjob/job-1?activeGroup=group-1");

    expect(app.fetched).toContainEqual(["job-1", "job-2"]);
    expect(app.activeGroupID).toBe("group-1");
  });
});

describe("a reader using the planner without an account", () => {
  // Jobs built while signed out live in the store and are never sent to the API, so
  // nothing has to be fetched for them — the loader must not refuse one.
  it("opens a job they built in this session", async () => {
    app.jobArray = [{ jobID: "local-job" }];

    const { pathname, isNotFound } = await enterRoute("/editjob/local-job");

    expect(isNotFound).toBe(false);
    expect(pathname).toBe("/editjob/local-job");
    expect(app.fetched).toEqual([["local-job"]]);
  });

  it("opens a group they built in this session", async () => {
    app.jobArray = [{ jobID: "local-job" }];
    app.groupArray = [
      new Group({ groupID: "local-group", includedJobIDs: ["local-job"] }),
    ];

    const { pathname, isNotFound } = await enterRoute("/group/local-group");

    expect(isNotFound).toBe(false);
    expect(pathname).toBe("/group/local-group");
  });

  it.each(["/jobplanner", "/reprocessing", "/itemtrees", "/group/new"])(
    "is not asked to sign in for %s",
    async (url) => {
      const { pathname } = await enterRoute(url);

      expect(pathname).toBe(url);
    },
  );
});

describe("the group a reader is working in", () => {
  beforeEach(() => {
    app.isLoggedIn = true;
    app.groupArray = [
      new Group({ groupID: "group-1", includedJobIDs: ["job-1"] }),
    ];
  });

  it("is taken from the group page's own URL", async () => {
    await enterRoute("/group/group-1");

    expect(app.activeGroupID).toBe("group-1");
    expect(app.fetched).toContainEqual(["job-1"]);
  });

  // Leaving a group by the side menu used to leave it set, and a job added on the
  // planner was filed into the group the reader had walked away from.
  it("is let go of when they leave for the planner", async () => {
    app.activeGroupID = "group-1";

    await enterRoute("/jobplanner");

    expect(app.activeGroupID).toBeNull();
  });

  it("says so when the group does not exist", async () => {
    const { isNotFound } = await enterRoute("/group/gone");

    expect(isNotFound).toBe(true);
  });

  // An archived member has no job document until it is restored, so asking for one is
  // a fetch that can only fail.
  it("leaves archived members out of what it loads", async () => {
    app.groupArray = [
      new Group({
        groupID: "group-2",
        includedJobIDs: ["job-1", "job-archived"],
        archivedJobIDs: ["job-archived"],
      }),
    ];

    await enterRoute("/group/group-2");

    expect(app.fetched).toContainEqual(["job-1"]);
  });

  // Hovering a link is not arriving at it: the group must not change under a reader
  // who passed over something.
  it("is left alone by a preload", async () => {
    app.activeGroupID = "group-1";
    const router = testRouter("/group/group-1");
    await router.load();

    await router.preloadRoute({ to: "/jobplanner" });

    expect(app.activeGroupID).toBe("group-1");
  });
});

describe("arriving at the sign-in page", () => {
  // The page reads progress on its first render, so a reset left to an effect would
  // paint the last login's finished steps for a frame.
  it("clears what the last login reached", async () => {
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);

    await enterRoute("/auth");

    expect(loginProgress().completedSteps.size).toBe(0);
  });

  it("leaves it alone for a reader it sends straight back out", async () => {
    app.isLoggedIn = true;
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);

    await enterRoute("/auth");

    expect(loginProgress().completedSteps.size).toBe(1);
  });
});

describe("coming back from EVE", () => {
  beforeEach(() => {
    app.isLoggedIn = true;
    app.jobArray = [{ jobID: "job-1" }];
  });

  it("puts the reader back where they were", async () => {
    const { pathname, search } = await enterRoute(
      `/auth?state=${encodeURIComponent("/editjob/job-1?activeGroup=group-1")}`,
    );

    expect(pathname).toBe("/editjob/job-1");
    expect(search).toMatchObject({ activeGroup: "group-1" });
  });

  // EVE echoes whatever it was given, so the value is checked rather than trusted. A
  // damaged one is not worth more than landing on the default.
  it.each(["main", "//evil.example", "/nonsense", "/auth"])(
    "sends them to the dashboard when the callback carries %s",
    async (state) => {
      const { pathname } = await enterRoute(
        `/auth?state=${encodeURIComponent(state)}`,
      );

      expect(pathname).toBe("/dashboard");
    },
  );
});

describe("an account that has not finished first login", () => {
  beforeEach(() => {
    app.isLoggedIn = true;
    app.requiresFirstLogin = true;
  });

  it("is taken there from wherever it asked for", async () => {
    const { pathname } = await enterRoute("/jobplanner");

    expect(pathname).toBe("/first-login");
  });

  it("is left there once it has arrived", async () => {
    const { pathname } = await enterRoute("/first-login");

    expect(pathname).toBe("/first-login");
  });
});
