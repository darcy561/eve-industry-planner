import { describe, expect, it, vi } from "vitest";
import {
  clearOrphanedCustomStructureOnSetups,
  setupHasOrphanedCustomStructure,
  setupShowsManualStructureFields,
} from "../src/Functions/Helper/customStructureSetup.js";

describe("customStructureSetup helpers", () => {
  const getCustomStructureWithID = vi.fn((id) =>
    id === "exists" ? { id: "exists" } : null
  );

  it("detects orphaned custom structure references", () => {
    expect(
      setupHasOrphanedCustomStructure(
        { customStructureID: "gone" },
        getCustomStructureWithID
      )
    ).toBe(true);
    expect(
      setupHasOrphanedCustomStructure(
        { customStructureID: "exists" },
        getCustomStructureWithID
      )
    ).toBe(false);
    expect(
      setupHasOrphanedCustomStructure({ customStructureID: "" }, getCustomStructureWithID)
    ).toBe(false);
  });

  it("shows manual fields when no custom structure or when orphaned", () => {
    expect(
      setupShowsManualStructureFields({ customStructureID: "" }, getCustomStructureWithID)
    ).toBe(true);
    expect(
      setupShowsManualStructureFields(
        { customStructureID: "gone" },
        getCustomStructureWithID
      )
    ).toBe(true);
    expect(
      setupShowsManualStructureFields(
        { customStructureID: "exists" },
        getCustomStructureWithID
      )
    ).toBe(false);
  });

  it("clears orphaned references without touching other setups", () => {
    const setups = {
      a: { customStructureID: "gone", structureID: 1 },
      b: { customStructureID: "exists", structureID: 2 },
      c: { customStructureID: "", structureID: 3 },
    };

    clearOrphanedCustomStructureOnSetups(setups, getCustomStructureWithID);

    expect(setups.a.customStructureID).toBe("");
    expect(setups.a.structureID).toBe(1);
    expect(setups.b.customStructureID).toBe("exists");
    expect(setups.c.customStructureID).toBe("");
  });
});
