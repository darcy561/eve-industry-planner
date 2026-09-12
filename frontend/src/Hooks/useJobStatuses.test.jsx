import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { store, stored } = vi.hoisted(() => ({
  store: { current: null },
  stored: new Map(),
}));

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../Functions/Helper/jobStatuses", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readJobStatusExpandedMap: (accountId) => stored.get(accountId) ?? {},
    writeJobStatusExpandedMap: (accountId, map) => stored.set(accountId, map),
  };
});

const { useJobStatuses } = await import("./useJobStatuses.js");

function signedInAs(accountID) {
  store.current = {
    account: { accountID },
    applicationSettings: {
      jobStatuses: {
        0: { name: "Planning" },
        1: { name: "Purchasing" },
        2: { name: "Building" },
      },
    },
  };
}

function expansionOf(result) {
  return Object.fromEntries(
    result.current.jobStatuses.map((s) => [String(s.id), s.expanded]),
  );
}

beforeEach(() => {
  stored.clear();
});

describe("useJobStatuses", () => {
  it("names a stage from the settings, and the rest from the catalogue", () => {
    signedInAs("acc-1");
    const { result } = renderHook(() => useJobStatuses());
    const names = result.current.jobStatuses.map((s) => s.name);

    // The stages themselves are fixed; only their labels come from settings.
    expect(names.slice(0, 3)).toEqual(["Planning", "Purchasing", "Building"]);
    expect(names.length).toBeGreaterThan(3);
  });

  it("opens every stage when nothing has been stored", () => {
    signedInAs("acc-1");
    const { result } = renderHook(() => useJobStatuses());

    expect(Object.values(expansionOf(result)).every(Boolean)).toBe(true);
  });

  it("reads back what the account had collapsed", () => {
    stored.set("acc-1", { 1: false });
    signedInAs("acc-1");
    const { result } = renderHook(() => useJobStatuses());

    expect(expansionOf(result)["1"]).toBe(false);
  });

  it("remembers a stage being collapsed", () => {
    signedInAs("acc-1");
    const { result } = renderHook(() => useJobStatuses());

    act(() => result.current.toggleExpanded(1));

    expect(expansionOf(result)["1"]).toBe(false);
    expect(stored.get("acc-1")["1"]).toBe(false);
  });

  // The planner stays mounted across a sign-out and back in, so the stages have
  // to follow the account rather than keep the previous reader's.
  it("takes up the new account's stages when the account changes", () => {
    stored.set("acc-1", { 1: false });
    stored.set("acc-2", { 2: false });
    signedInAs("acc-1");
    const { result, rerender } = renderHook(() => useJobStatuses());
    expect(expansionOf(result)["1"]).toBe(false);

    signedInAs("acc-2");
    rerender();

    expect(expansionOf(result)["1"]).toBe(true);
    expect(expansionOf(result)["2"]).toBe(false);
  });

  it("keeps what it has while the account stays the same", () => {
    signedInAs("acc-1");
    const { result, rerender } = renderHook(() => useJobStatuses());
    act(() => result.current.toggleExpanded(0));

    rerender();

    expect(expansionOf(result)["0"]).toBe(false);
  });
});
