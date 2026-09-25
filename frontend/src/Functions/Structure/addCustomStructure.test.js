import { beforeEach, describe, expect, it, vi } from "vitest";

const getSystemIndexes = vi.fn();
const addSystemIndex = vi.fn();
const saveApplicationSettings = vi.fn();

vi.mock("../System Indexes/findSystemIndex", () => ({
  default: (...args) => getSystemIndexes(...args),
}));
vi.mock("../Endpoints/Private/userDocument", () => ({
  saveApplicationSettings: (...args) => saveApplicationSettings(...args),
}));
vi.mock("../../analytics/trackAppEvent", () => ({ trackAppEvent: vi.fn() }));
vi.mock("../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: vi.fn(),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ worldData: { actions: { addSystemIndex } } }),
  );
});

const { addCustomStructure } = await import("./addCustomStructure");
const { default: Structure } = await import("../../Classes/structure");
const { structureKinds } = await import("../../Context/defaultValues");

function add(structure) {
  return addCustomStructure({
    structure,
    addCustomStructure: vi.fn(),
    setIsLoading: vi.fn(),
  });
}

beforeEach(() => {
  getSystemIndexes.mockReset().mockResolvedValue({ 30000142: {} });
  addSystemIndex.mockReset();
  saveApplicationSettings.mockReset().mockResolvedValue(undefined);
});

// The index is what an installation cost is derived from, so a kind that is
// built in asks for it and a kind that is not has nothing to ask about.
describe("the system index a new structure asks for", () => {
  it("asks for the index of a kind that names a system", async () => {
    await add(
      new Structure({
        jobType: structureKinds.manufacturing,
        systemID: 30000142,
      }),
    );

    expect(getSystemIndexes).toHaveBeenCalledWith(30000142);
    expect(addSystemIndex).toHaveBeenCalled();
  });

  // Reprocessing happens wherever the structure is and carries no system, so
  // asking would fetch against undefined.
  it("asks for nothing for a kind that names no system", async () => {
    await add(new Structure({ jobType: structureKinds.reprocessing }));

    expect(getSystemIndexes).not.toHaveBeenCalled();
    expect(addSystemIndex).not.toHaveBeenCalled();
  });

  // A market has no installation cost, so its system is there to answer the
  // index question of a job built elsewhere — not to fetch one of its own.
  it("asks for nothing for a market, whether or not it names a system", async () => {
    await add(
      new Structure({
        jobType: structureKinds.market,
        systemID: 30000144,
      }),
    );
    await add(new Structure({ jobType: structureKinds.market }));

    expect(getSystemIndexes).not.toHaveBeenCalled();
  });
});
