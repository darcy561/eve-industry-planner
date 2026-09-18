import { describe, expect, it, vi } from "vitest";

const stored = { predefined: null, world: {} };

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      applicationSettings: {
        actions: { findPredefinedSystemIndex: () => stored.predefined },
      },
      worldData: {
        actions: {
          findSystemIndex: (systemID, alternativeLocation = {}) =>
            stored.world[systemID] || alternativeLocation[systemID],
        },
      },
    }),
  },
}));

const { default: findSystemIndexForJob } =
  await import("./findSystemIndexValue.js");

const MANUFACTURING = 1;
const SYSTEM = 30000142;

describe("findSystemIndexForJob", () => {
  it("is zero where nothing holds an index for the system", () => {
    stored.predefined = null;
    stored.world = {};

    expect(findSystemIndexForJob(SYSTEM, MANUFACTURING)).toBe(0);
  });

  it("reads the index the world data holds", () => {
    stored.predefined = null;
    stored.world = { [SYSTEM]: { manufacturing: 0.03 } };

    expect(findSystemIndexForJob(SYSTEM, MANUFACTURING)).toBe(0.03);
  });

  // Indexes fetched for a job are handed in rather than waited for in the store,
  // so a system nothing is held for still reads a figure. A system the store
  // already knows keeps what it holds.
  it("falls back to indexes it was handed for a system nothing is held for", () => {
    stored.predefined = null;
    stored.world = {};

    expect(
      findSystemIndexForJob(SYSTEM, MANUFACTURING, false, 0, {
        [SYSTEM]: { manufacturing: 0.5 },
      }),
    ).toBe(0.5);
  });

  it("keeps what is already held over what it was handed", () => {
    stored.predefined = null;
    stored.world = { [SYSTEM]: { manufacturing: 0.03 } };

    expect(
      findSystemIndexForJob(SYSTEM, MANUFACTURING, false, 0, {
        [SYSTEM]: { manufacturing: 0.5 },
      }),
    ).toBe(0.03);
  });

  it("takes a reader's own figure for the system ahead of either", () => {
    stored.predefined = { manufacturing: 0.09 };
    stored.world = { [SYSTEM]: { manufacturing: 0.03 } };

    expect(findSystemIndexForJob(SYSTEM, MANUFACTURING)).toBe(0.09);
  });

  it("uses the setup's own value when it says to", () => {
    stored.predefined = { manufacturing: 0.09 };

    expect(findSystemIndexForJob(SYSTEM, MANUFACTURING, true, 0.7)).toBe(0.7);
  });
});
