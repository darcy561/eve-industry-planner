import { describe, it, expect, vi } from "vitest";

const account = { accountID: "acct-1" };

vi.mock("../../../Zustand/usersStore", () => ({
  default: { getState: () => ({ account }) },
}));

const { currentOwnerHandle, statisticsPath } = await import(
  "./statisticsOwner.js"
);

describe("the owner a statistics request names", () => {
  it("is the kind and the id", () => {
    expect(currentOwnerHandle()).toBe("account:acct-1");
  });

  // The colon separates the halves of the handle, so escaping it would only make
  // the path harder to read in a log.
  it("escapes the id and leaves the separator alone", () => {
    account.accountID = "acct/1 2";
    expect(currentOwnerHandle()).toBe("account:acct%2F1%202");
    account.accountID = "acct-1";
  });

  it("puts the owner ahead of the view", () => {
    expect(statisticsPath("timeline/items")).toBe(
      "/api/v1/statistics/account:acct-1/timeline/items",
    );
  });

  // Callers bail on null rather than asking about an owner that is not there.
  it("names no path when nobody is signed in", () => {
    account.accountID = "";

    expect(currentOwnerHandle()).toBe("");
    expect(statisticsPath("totals")).toBeNull();

    account.accountID = "acct-1";
  });
});
