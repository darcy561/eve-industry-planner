import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const savePlannerExtrasCategories = vi.fn(async () => {});

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: { isLoggedIn: true },
    plannerSettings: { actions: { savePlannerExtrasCategories } },
  });
});

const { scheduleDebouncedPlannerSettingsSave } =
  await import("./plannerSettingsPersistSchedule.js");

beforeEach(() => {
  vi.useFakeTimers();
  savePlannerExtrasCategories.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("scheduling a planner settings save", () => {
  it("writes once for a burst of edits to one planner", async () => {
    scheduleDebouncedPlannerSettingsSave("account:acc-1");
    scheduleDebouncedPlannerSettingsSave("account:acc-1");

    expect(savePlannerExtrasCategories).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();

    expect(savePlannerExtrasCategories).toHaveBeenCalledExactlyOnceWith(
      "account:acc-1",
    );
  });

  // A member who edits one planner and switches before the debounce fires still
  // has the first write: the pending planners are remembered, not the last one.
  it("writes every planner edited within the window", async () => {
    scheduleDebouncedPlannerSettingsSave("account:acc-1");
    scheduleDebouncedPlannerSettingsSave("corporation:98000001");

    await vi.runAllTimersAsync();

    expect(
      savePlannerExtrasCategories.mock.calls.map(([o]) => o).sort(),
    ).toEqual(["account:acc-1", "corporation:98000001"]);
  });

  // The house pattern for a settings write: the failure is logged and the flush
  // carries on, so one planner's refusal does not strand another's write.
  it("still writes the other planners when one fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    savePlannerExtrasCategories.mockImplementation(async (owner) => {
      if (owner === "account:acc-1") throw new Error("refused");
    });

    scheduleDebouncedPlannerSettingsSave("account:acc-1");
    scheduleDebouncedPlannerSettingsSave("corporation:98000001");
    await vi.runAllTimersAsync();

    expect(savePlannerExtrasCategories).toHaveBeenCalledWith(
      "corporation:98000001",
    );
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
    savePlannerExtrasCategories.mockImplementation(async () => {});
  });

  // Otherwise a failed write would be retried by every later edit to any
  // planner, and a tab left open would keep reissuing it.
  it("does not carry a planner over into the next window", async () => {
    scheduleDebouncedPlannerSettingsSave("account:acc-1");
    await vi.runAllTimersAsync();
    savePlannerExtrasCategories.mockClear();

    scheduleDebouncedPlannerSettingsSave("corporation:98000001");
    await vi.runAllTimersAsync();

    expect(savePlannerExtrasCategories).toHaveBeenCalledExactlyOnceWith(
      "corporation:98000001",
    );
  });

  it("ignores a schedule with no planner to write", async () => {
    scheduleDebouncedPlannerSettingsSave("");

    await vi.runAllTimersAsync();

    expect(savePlannerExtrasCategories).not.toHaveBeenCalled();
  });
});
