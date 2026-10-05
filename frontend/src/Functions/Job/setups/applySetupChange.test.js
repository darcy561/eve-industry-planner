import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, asked, added } = vi.hoisted(() => ({
  store: { current: null },
  asked: [],
  added: [],
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});
vi.mock("../../System Indexes/findSystemIndex", () => ({
  default: async (systemID) => {
    asked.push(systemID);
    return { [systemID]: { manufacturing: 0.02 } };
  },
}));

const { default: applySetupChange } = await import("./applySetupChange.js");
const { commandActions, appliedTo } =
  await import("../../../tests/jobCommandSpy.js");

const setup = (overrides = {}) => ({
  id: "setup-1",
  jobType: 1,
  runCount: 1,
  jobCount: 1,
  systemID: 30000142,
  structureID: 0,
  rigID: 0,
  materialCount: {},
  ...overrides,
});

beforeEach(() => {
  asked.length = 0;
  added.length = 0;
  store.current = {
    worldData: { actions: { addSystemIndex: (rows) => added.push(rows) } },
  };
});

describe("changing the setup being edited", () => {
  it("records the change rather than making it on the setup it was given", async () => {
    const actions = commandActions();
    const held = setup();

    await applySetupChange(
      held,
      "set the runs",
      (copy) => copy.updateRunCount(25),
      actions,
    );

    expect(held.runCount).toBe(1);
    expect(
      appliedTo(actions, {
        build: { setup: { "setup-1": held } },
        rawData: { materials: [] },
      }).build.setup["setup-1"].runCount,
    ).toBe(25);
  });

  it("names the step for the reader", async () => {
    const actions = commandActions();

    await applySetupChange(
      setup(),
      "set the runs",
      (copy) => copy.updateRunCount(25),
      actions,
    );

    expect(actions.run.mock.calls[0][0].name).toBe("set the runs");
  });

  it("asks about the system the change moved it to", async () => {
    const actions = commandActions();

    await applySetupChange(
      setup(),
      "choose a system",
      (copy) => copy.updateSystemID(30002187),
      actions,
    );

    expect(asked).toEqual([30002187]);
    expect(added).toHaveLength(1);
  });
});
