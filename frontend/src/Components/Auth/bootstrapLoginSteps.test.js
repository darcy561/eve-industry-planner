import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { LOGIN_STEPS, emitLoginStepComplete } =
  await import("../../Events/loginEvents.js");
const { loginProgress, startLogin, whenLoginComplete } =
  await import("../../Functions/Auth/loginProgress.js");
const { bootstrapJobDocumentsLoginStep } =
  await import("./bootstrapJobDocumentsLoginStep.js");
const { bootstrapJobGroupsLoginStep } =
  await import("./bootstrapJobGroupsLoginStep.js");
const { bootstrapWatchlistLoginStep } =
  await import("./bootstrapWatchlistLoginStep.js");

/** The three steps that fetch, each with the step it reports and the call it makes. */
const STEPS = [
  {
    name: "job documents",
    run: bootstrapJobDocumentsLoginStep,
    step: LOGIN_STEPS.JOB_PLANNER,
    fetch: () => calls.jobDocuments,
  },
  {
    name: "job groups",
    run: bootstrapJobGroupsLoginStep,
    step: LOGIN_STEPS.GROUP_DATA,
    fetch: () => calls.jobGroups,
  },
  {
    name: "watchlist",
    run: bootstrapWatchlistLoginStep,
    step: LOGIN_STEPS.WATCHLIST_DATA,
    fetch: () => calls.watchlist,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const { fetch } of STEPS) {
    fetch().mockResolvedValue(undefined);
  }
  // The steps report into module-level progress state, so each test starts a
  // login of its own rather than reading the previous test's steps.
  startLogin();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(STEPS)("the $name bootstrap step", ({ run, step, fetch }) => {
  it("reports its step once its fetch resolves", async () => {
    await run();

    expect(fetch()).toHaveBeenCalledTimes(1);
    expect(loginProgress().completedSteps.has(step)).toBe(true);
  });

  // The step swallows the failure so the other steps still run, which means the
  // caller cannot tell from the return value that anything went wrong.
  it("returns without throwing when its fetch fails", async () => {
    fetch().mockRejectedValue(new Error("api down"));

    await expect(run()).resolves.toBeUndefined();
  });

  it("does not report its step when its fetch fails", async () => {
    fetch().mockRejectedValue(new Error("api down"));

    await run();

    expect(loginProgress().completedSteps.has(step)).toBe(false);
    expect(loginProgress().error).not.toBeNull();
  });
});

// The root route guard awaits `whenLoginComplete()` before it lets a
// job-bearing page render. Completion is every step landing, and a step that
// fails reports an error instead of completing — so a single failed fetch
// leaves that promise pending for the life of the login.
describe("a login whose steps do not all land", () => {
  /** Whether `whenLoginComplete()` has resolved by the time the queue drains. */
  async function completionSettled() {
    let settled = false;
    whenLoginComplete().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    return settled;
  }

  /** The three fetching steps, plus the character step the post-login sync owns. */
  async function runEveryStep() {
    await Promise.all([
      bootstrapJobDocumentsLoginStep(),
      bootstrapJobGroupsLoginStep(),
      bootstrapWatchlistLoginStep(),
    ]);
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);
  }

  it("completes when every step lands", async () => {
    await runEveryStep();

    await expect(whenLoginComplete()).resolves.toBeUndefined();
  });

  it("never completes while one step has failed", async () => {
    calls.jobGroups.mockRejectedValue(new Error("api down"));

    await runEveryStep();

    expect(await completionSettled()).toBe(false);
  });

  // Starting again is the recovery: it arms a fresh completion, so a retry after
  // a failure is not held by the failed attempt.
  it("completes once a later login lands every step", async () => {
    calls.jobGroups.mockRejectedValue(new Error("api down"));
    await runEveryStep();

    startLogin();
    calls.jobGroups.mockResolvedValue(undefined);
    await runEveryStep();

    await expect(whenLoginComplete()).resolves.toBeUndefined();
  });
});
