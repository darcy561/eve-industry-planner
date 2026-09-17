import { beforeEach, describe, expect, it, vi } from "vitest";
import { activePlannerStoreState } from "../../tests/utils.js";

const CORP_OWNER = "corporation:98000001";

const storeState = activePlannerStoreState({ owner: CORP_OWNER });
const replaceJobArray = vi.fn();
const replaceGroupArray = vi.fn();
storeState.jobData.actions.replaceJobArray = replaceJobArray;
storeState.jobData.actions.replaceGroupArray = replaceGroupArray;
storeState.account.actions.addLinkedEsiData = vi.fn();

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

/** What the fake transport does while a request is in flight. */
let whileInFlight = () => {};
/** Holds a named request open until the test lets it answer. */
let holdRequest = () => Promise.resolve();

vi.mock("../Endpoints/Private/applyPrivateHeaders.js", () => ({
  requestWithPrivateHeaders: async (_url, _options, meta) => {
    whileInFlight();
    await holdRequest(meta?.requestName);
    return {
      ok: true,
      status: 200,
      text: async () => "[]",
      json: async () => [],
    };
  },
  privateBatchRetryConfig: {},
}));

const { loadPlannerDocuments } = await import("./loadPlannerDocuments.js");

beforeEach(() => {
  whileInFlight = () => {};
  holdRequest = () => Promise.resolve();
  storeState.activePlanner.owner = CORP_OWNER;
  storeState.jobData.owner = null;
  storeState.jobData.jobArray = [];
  replaceJobArray.mockClear();
  replaceGroupArray.mockClear();
});

describe("loading a planner's documents", () => {
  // The store holds one planner at a time, so a switch that moved every scoped
  // read still leaves the jobs and groups of the planner it came from on screen.
  it("replaces both the jobs and the groups", async () => {
    await expect(loadPlannerDocuments(CORP_OWNER)).resolves.toBe(true);

    expect(replaceJobArray).toHaveBeenCalled();
    expect(replaceGroupArray).toHaveBeenCalled();
  });

  it("loads the planner the app is in when told no other", async () => {
    await expect(loadPlannerDocuments()).resolves.toBe(true);
  });

  // Two switches in quick succession leave the first load in flight, and its
  // answer describes a planner the reader has already left.
  it("discards an answer for a planner the app has left", async () => {
    whileInFlight = () => {
      storeState.activePlanner.owner = "corporation:98000002";
    };

    await expect(loadPlannerDocuments(CORP_OWNER)).resolves.toBe(false);

    expect(replaceJobArray).not.toHaveBeenCalled();
    expect(replaceGroupArray).not.toHaveBeenCalled();
  });

  // Switching away and back arrives at the same planner, so the owner is no help
  // in telling the two loads apart: the first is stale even though it names the
  // planner the reader is now in.
  it("discards an answer another load has already replaced", async () => {
    let releaseFirst;
    whileInFlight = () => {
      whileInFlight = () => {};
      releaseFirst = loadPlannerDocuments(CORP_OWNER);
    };

    const first = loadPlannerDocuments(CORP_OWNER);

    await expect(first).resolves.toBe(false);
    await expect(releaseFirst).resolves.toBe(true);
    expect(replaceJobArray).toHaveBeenCalledTimes(1);
  });

  // The two requests answer at their own speeds, so a load overtaken between them
  // would otherwise leave its groups beside another load's jobs.
  it("writes neither half of a load it was overtaken during", async () => {
    let answerJobs;
    holdRequest = (requestName) =>
      requestName === "getPlannerJobDocuments"
        ? new Promise((resolve) => {
            answerJobs = resolve;
          })
        : Promise.resolve();

    const overtaken = loadPlannerDocuments(CORP_OWNER);
    await vi.waitFor(() => expect(answerJobs).toBeTypeOf("function"));
    holdRequest = () => Promise.resolve();
    const overtaking = loadPlannerDocuments(CORP_OWNER);
    answerJobs();

    await expect(overtaken).resolves.toBe(false);
    await expect(overtaking).resolves.toBe(true);
    expect(replaceJobArray).toHaveBeenCalledTimes(1);
    expect(replaceGroupArray).toHaveBeenCalledTimes(1);
  });

  // A job inside a group is not in the planner's answer, so it is kept across a
  // load — but it belongs to the planner it was opened in.
  it("drops a group's jobs when the planner they belong to is left", async () => {
    storeState.jobData.owner = "account:acct-1";
    storeState.jobData.jobArray = [
      { jobID: "grouped", displayOnPlanner: false },
    ];

    await loadPlannerDocuments(CORP_OWNER);

    expect(replaceJobArray).toHaveBeenCalledWith([], {
      fromServer: true,
      owner: CORP_OWNER,
    });
  });

  it("keeps a group's jobs when the same planner is loaded again", async () => {
    storeState.jobData.owner = CORP_OWNER;
    storeState.jobData.jobArray = [
      { jobID: "grouped", displayOnPlanner: false },
    ];

    await loadPlannerDocuments(CORP_OWNER);

    expect(replaceJobArray).toHaveBeenCalledWith(
      [expect.objectContaining({ jobID: "grouped" })],
      { fromServer: true, owner: CORP_OWNER },
    );
  });

  it("loads nothing when nobody is signed in", async () => {
    storeState.account.accountID = "";
    storeState.activePlanner.owner = null;

    await expect(loadPlannerDocuments()).resolves.toBe(false);

    expect(replaceJobArray).not.toHaveBeenCalled();
    storeState.account.accountID = "acct-1";
  });
});
