import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { activeGroupID: null } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      jobData: {
        activeGroupID: store.activeGroupID,
        actions: {
          setActiveGroupID: (groupID) => {
            store.activeGroupID = groupID;
          },
          clearActiveGroupID: () => {
            store.activeGroupID = null;
          },
        },
      },
    }),
  );
});

const { activeGroupForRoute, applyActiveGroupForRoute } =
  await import("./activeGroupForRoute.js");

beforeEach(() => {
  store.activeGroupID = null;
});

describe("which group a route is working in", () => {
  it("is the group the group page names", () => {
    expect(
      activeGroupForRoute({
        routeId: "/group/$groupID",
        params: { groupID: "group-1" },
      }),
    ).toBe("group-1");
  });

  it("is the group a job was opened inside", () => {
    expect(
      activeGroupForRoute({
        routeId: "/editjob/$jobID",
        params: { jobID: "job-1" },
        search: { activeGroup: "group-1" },
      }),
    ).toBe("group-1");
  });

  it("is none for a job opened on its own", () => {
    expect(
      activeGroupForRoute({
        routeId: "/editjob/$jobID",
        params: { jobID: "job-1" },
        search: {},
      }),
    ).toBeNull();
  });

  it.each(["/jobplanner", "/dashboard", "/"])("is none on %s", (routeId) => {
    expect(activeGroupForRoute({ routeId })).toBeNull();
  });
});

describe("putting the store in step", () => {
  it("takes the group from the route being entered", () => {
    applyActiveGroupForRoute({
      routeId: "/group/$groupID",
      params: { groupID: "group-1" },
    });

    expect(store.activeGroupID).toBe("group-1");
  });

  // The defect this closes: leaving a group by the side menu left it set, and a job
  // added on the planner was filed into the group the reader had walked away from.
  it("lets go of the group when the reader leaves it", () => {
    store.activeGroupID = "group-1";

    applyActiveGroupForRoute({ routeId: "/jobplanner" });

    expect(store.activeGroupID).toBeNull();
  });

  it("follows a reader from one group to another", () => {
    store.activeGroupID = "group-1";

    applyActiveGroupForRoute({
      routeId: "/group/$groupID",
      params: { groupID: "group-2" },
    });

    expect(store.activeGroupID).toBe("group-2");
  });

  it("keeps the group when a job inside it is opened", () => {
    store.activeGroupID = "group-1";

    applyActiveGroupForRoute({
      routeId: "/editjob/$jobID",
      params: { jobID: "job-1" },
      search: { activeGroup: "group-1" },
    });

    expect(store.activeGroupID).toBe("group-1");
  });
});
