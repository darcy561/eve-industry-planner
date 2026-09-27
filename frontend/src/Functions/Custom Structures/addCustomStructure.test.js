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
const showSnackbarSuccess = vi.fn();
vi.mock("../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: (...args) => showSnackbarSuccess(...args),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ worldData: { actions: { addSystemIndex } } }),
  );
});

const { addCustomStructure } = await import("./addCustomStructure");
const { structureFromDocument } = await import("./customStructure");
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
  showSnackbarSuccess.mockReset();
});

describe("the system index a new structure asks for", () => {
  it("asks for the index of a kind that names a system", async () => {
    await add(
      structureFromDocument({
        jobType: structureKinds.manufacturing,
        systemID: 30000142,
      }),
    );

    expect(getSystemIndexes).toHaveBeenCalledWith(30000142);
    expect(addSystemIndex).toHaveBeenCalled();
  });

  it("asks for nothing for a kind that names no system", async () => {
    await add(structureFromDocument({ jobType: structureKinds.reprocessing }));

    expect(getSystemIndexes).not.toHaveBeenCalled();
    expect(addSystemIndex).not.toHaveBeenCalled();
  });

  it("asks for nothing for a market, whether or not it names a system", async () => {
    await add(
      structureFromDocument({
        jobType: structureKinds.market,
        systemID: 30000144,
      }),
    );
    await add(structureFromDocument({ jobType: structureKinds.market }));

    expect(getSystemIndexes).not.toHaveBeenCalled();
  });
});

describe("what a reader is told when a structure is saved", () => {
  it("announces it once", async () => {
    await add(
      structureFromDocument({
        jobType: structureKinds.reprocessing,
        name: "Athanor",
      }),
    );

    expect(showSnackbarSuccess).toHaveBeenCalledTimes(1);
    expect(showSnackbarSuccess).toHaveBeenCalledWith("Athanor Added");
  });
});
