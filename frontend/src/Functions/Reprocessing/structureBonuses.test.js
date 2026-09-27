import { describe, expect, it } from "vitest";

import { rigBonusFor, structureBonusFor } from "./structureBonuses";
import { structureFromDocument } from "../Structure/customStructure";
import { jobTypes, reprocessingItemTypes } from "../../Context/defaultValues";

describe("what a refinery gives what is put through it", () => {
  it("gives an ore bonus to ore, moon ore and ice, and none to gas", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.reprocessing,
      structureType: 3,
    });

    for (const itemType of [
      reprocessingItemTypes.ore,
      reprocessingItemTypes.moonOre,
      reprocessingItemTypes.ice,
    ]) {
      expect(structureBonusFor(structure, itemType)).toBe(0.055);
    }
    expect(structureBonusFor(structure, reprocessingItemTypes.gas)).toBe(10);
  });

  it("gives no bonus at an NPC station", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.reprocessing,
    });

    expect(structureBonusFor(structure, reprocessingItemTypes.ore)).toBe(0);
  });

  it("takes the strongest rig that applies to the item", () => {
    const oreOnly = structureFromDocument({
      jobType: jobTypes.reprocessing,
      rigSlot1: 1,
      rigSlot2: 0,
    });

    expect(rigBonusFor(oreOnly, reprocessingItemTypes.ore)).toBe(1);
    expect(rigBonusFor(oreOnly, reprocessingItemTypes.gas)).toBe(0);
  });

  it("answers no reprocessing bonus for a manufacturing rig", () => {
    const manufacturing = structureFromDocument({
      jobType: jobTypes.manufacturing,
      rigSlot1: 1,
    });

    expect(rigBonusFor(manufacturing, reprocessingItemTypes.ore)).toBe(0);
  });

  it("answers zero for a kind that carries no rig slots", () => {
    const unknown = structureFromDocument({ jobType: 999 });

    expect(rigBonusFor(unknown, reprocessingItemTypes.ore)).toBe(0);
    expect(structureBonusFor(unknown, reprocessingItemTypes.ore)).toBe(0);
  });
});
