import { describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

const {
  clearOrphanedCustomStructureOnSetups,
  setupFieldsFromCustomStructure,
  setupHasOrphanedCustomStructure,
  setupShowsManualStructureFields,
} = await import("./customStructureSetup.js");
const { structureFromDocument } = await import("./customStructure.js");
const { jobTypes, structureKinds } =
  await import("../../Context/defaultValues");

const SAVED = structureFromDocument({
  id: "exists",
  jobType: jobTypes.manufacturing,
  name: "Sotiyo",
});

function saved(rows = [SAVED]) {
  store.current = { applicationSettings: { customStructures: rows } };
}

describe("customStructureSetup helpers", () => {
  saved();

  it("detects orphaned custom structure references", () => {
    expect(setupHasOrphanedCustomStructure({ customStructureID: "gone" })).toBe(
      true,
    );
    expect(
      setupHasOrphanedCustomStructure({ customStructureID: "exists" }),
    ).toBe(false);
    expect(setupHasOrphanedCustomStructure({ customStructureID: "" })).toBe(
      false,
    );
  });

  it("shows manual fields when no custom structure or when orphaned", () => {
    expect(setupShowsManualStructureFields({ customStructureID: "" })).toBe(
      true,
    );
    expect(setupShowsManualStructureFields({ customStructureID: "gone" })).toBe(
      true,
    );
    expect(
      setupShowsManualStructureFields({ customStructureID: "exists" }),
    ).toBe(false);
  });

  it("clears orphaned references without touching other setups", () => {
    const setups = {
      a: { customStructureID: "gone", structureID: 1 },
      b: { customStructureID: "exists", structureID: 2 },
      c: { customStructureID: "", structureID: 3 },
    };

    clearOrphanedCustomStructureOnSetups(setups);

    expect(setups.a.customStructureID).toBe("");
    expect(setups.a.structureID).toBe(1);
    expect(setups.b.customStructureID).toBe("exists");
    expect(setups.c.customStructureID).toBe("");
  });
});

describe("what a setup takes from the structure it references", () => {
  it("takes the id, the structure type, both rigs, the system and the tax", () => {
    const structure = structureFromDocument({
      id: "manStruct-1",
      jobType: jobTypes.manufacturing,
      structureType: 3,
      systemType: 2,
      rigSlot1: 1,
      rigSlot2: 3,
      systemID: 30000142,
      tax: 2.5,
    });

    expect(setupFieldsFromCustomStructure(structure)).toEqual({
      customStructureID: "manStruct-1",
      structureID: 3,
      rigSlot1: 1,
      rigSlot2: 3,
      systemTypeID: 2,
      systemID: 30000142,
      taxValue: 2.5,
    });
  });

  it("reads both rig slots as none for a kind that carries none", () => {
    const market = structureFromDocument({
      id: "market-1",
      jobType: structureKinds.market,
    });

    const fields = setupFieldsFromCustomStructure(market);

    expect(fields.rigSlot1).toBe(0);
    expect(fields.rigSlot2).toBe(0);
  });

  it("names every field a setup stores about its structure, and no others", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.reprocessing,
    });

    expect(
      Object.keys(setupFieldsFromCustomStructure(structure)).sort(),
    ).toEqual([
      "customStructureID",
      "rigSlot1",
      "rigSlot2",
      "structureID",
      "systemID",
      "systemTypeID",
      "taxValue",
    ]);
  });
});
