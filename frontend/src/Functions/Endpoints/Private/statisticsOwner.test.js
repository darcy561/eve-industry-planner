import { describe, it, expect, vi } from "vitest";
import { activePlannerStoreState } from "../../../tests/utils.js";

const state = activePlannerStoreState();

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(state));
});

const { currentOwnerHandle, statisticsPath } =
  await import("./statisticsOwner.js");

describe("the owner a statistics request names", () => {
  it("is the kind and the id", () => {
    expect(currentOwnerHandle()).toBe("account:acct-1");
  });

  // The colon separates the halves of the handle, so escaping it would only make
  // the path harder to read in a log.
  it("escapes the id and leaves the separator alone", () => {
    state.account.accountID = "acct/1 2";
    expect(currentOwnerHandle()).toBe("account:acct%2F1%202");
    state.account.accountID = "acct-1";
  });

  it("puts the owner ahead of the view", () => {
    expect(statisticsPath("timeline/items")).toBe(
      "/api/v1/statistics/account:acct-1/timeline/items",
    );
  });

  // Two planners' figures are different data, so a switch has to move the read.
  it("is the named planner once one is active", () => {
    state.activePlanner.owner = "corporation:98000001";

    expect(currentOwnerHandle()).toBe("corporation:98000001");
    expect(statisticsPath("totals")).toBe(
      "/api/v1/statistics/corporation:98000001/totals",
    );

    state.activePlanner.owner = null;
  });

  // Callers bail on null rather than asking about an owner that is not there.
  it("names no path when nobody is signed in", () => {
    state.account.accountID = "";

    expect(currentOwnerHandle()).toBe("");
    expect(statisticsPath("totals")).toBeNull();

    state.account.accountID = "acct-1";
  });
});
