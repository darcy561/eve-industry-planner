import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls } = vi.hoisted(() => ({
  calls: {
    jobDocuments: vi.fn(),
    jobGroups: vi.fn(),
    watchlist: vi.fn(),
  },
}));

vi.mock("../../Functions/Endpoints/Private/jobDocuments.js", () => ({
  fetchPlannerJobDocumentsFromApi: (...args) => calls.jobDocuments(...args),
}));
vi.mock("../../Functions/Endpoints/Private/groups", () => ({
  fetchJobGroupsFromApi: (...args) => calls.jobGroups(...args),
}));
vi.mock("../../Functions/Endpoints/Private/watchlistDeprecated.js", () => ({
  fetchWatchlistDeprecatedFromApi: (...args) => calls.watchlist(...args),
}));

const { LOGIN_STEPS } = await import("../../Events/loginEvents.js");
const { loginProgress, startLogin, whenLoginComplete } =
  await import("./loginProgress.js");
const { canRetryLoginStep, retryLoginStep } =
  await import("./retryLoginStep.js");

beforeEach(() => {
  vi.clearAllMocks();
  calls.jobDocuments.mockResolvedValue(undefined);
  calls.jobGroups.mockResolvedValue(undefined);
  calls.watchlist.mockResolvedValue(undefined);
  startLogin();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("which steps can be re-run", () => {
  it.each([
    LOGIN_STEPS.JOB_PLANNER,
    LOGIN_STEPS.GROUP_DATA,
    LOGIN_STEPS.WATCHLIST_DATA,
  ])("%s can", (step) => {
    expect(canRetryLoginStep(step)).toBe(true);
  });

  // Its work is driven by the login response's own `user_document` and
  // `linked_characters`, which nothing outside that response holds.
  it("character data cannot", () => {
    expect(canRetryLoginStep(LOGIN_STEPS.CHARACTER_DATA)).toBe(false);
  });

  it.each([undefined, null, "", "somethingElse", "toString"])(
    "%s cannot",
    (step) => {
      expect(canRetryLoginStep(step)).toBe(false);
    },
  );
});

describe("re-running a failed step", () => {
  it("calls only that step's fetch", async () => {
    await retryLoginStep(LOGIN_STEPS.GROUP_DATA);

    expect(calls.jobGroups).toHaveBeenCalledTimes(1);
    expect(calls.jobDocuments).not.toHaveBeenCalled();
    expect(calls.watchlist).not.toHaveBeenCalled();
  });

  it("reports the step once the retry succeeds", async () => {
    calls.jobGroups.mockRejectedValueOnce(new Error("api down"));
    await retryLoginStep(LOGIN_STEPS.GROUP_DATA);
    expect(loginProgress().completedSteps.has(LOGIN_STEPS.GROUP_DATA)).toBe(
      false,
    );

    await retryLoginStep(LOGIN_STEPS.GROUP_DATA);

    expect(loginProgress().completedSteps.has(LOGIN_STEPS.GROUP_DATA)).toBe(
      true,
    );
  });

  // The point of the whole mechanism: a route guard awaiting the login is
  // released by the retry, without the page reloading.
  it("releases a guard waiting on the login", async () => {
    calls.jobGroups.mockRejectedValueOnce(new Error("api down"));
    await Promise.all([
      retryLoginStep(LOGIN_STEPS.JOB_PLANNER),
      retryLoginStep(LOGIN_STEPS.GROUP_DATA),
      retryLoginStep(LOGIN_STEPS.WATCHLIST_DATA),
    ]);

    let released = false;
    whenLoginComplete().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);

    await retryLoginStep(LOGIN_STEPS.GROUP_DATA);
    // The character step is the post-login sync's, not a bootstrap step's.
    const { emitLoginStepComplete } =
      await import("../../Events/loginEvents.js");
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);

    await expect(whenLoginComplete()).resolves.toBeUndefined();
  });

  it("resolves rather than throwing when the retry fails too", async () => {
    calls.jobGroups.mockRejectedValue(new Error("still down"));

    await expect(
      retryLoginStep(LOGIN_STEPS.GROUP_DATA),
    ).resolves.toBeUndefined();
    expect(loginProgress().error).not.toBeNull();
  });

  it("does nothing for a step it cannot re-run", async () => {
    await retryLoginStep(LOGIN_STEPS.CHARACTER_DATA);

    expect(calls.jobDocuments).not.toHaveBeenCalled();
    expect(calls.jobGroups).not.toHaveBeenCalled();
    expect(calls.watchlist).not.toHaveBeenCalled();
  });
});
