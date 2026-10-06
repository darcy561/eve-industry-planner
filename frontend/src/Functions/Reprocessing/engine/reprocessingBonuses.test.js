import { describe, expect, it, vi } from "vitest";

import {
  rigBonusFor,
  rigSecurityFor,
  structureBonusFor,
} from "./reprocessingBonuses";
import { structureFromDocument } from "../../Custom Structures/customStructure";
import * as rigs from "../../Industry Facilities/rigs";
import {
  jobTypes,
  reprocessingItemTypes,
} from "../../../Context/defaultValues";

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

  it("gives erratic ore the ore bonus and ore rigs, and an unrefined mineral ore rigs only", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.reprocessing,
      structureType: 3,
      rigSlot1: 1,
      rigSlot2: 0,
    });

    expect(structureBonusFor(structure, reprocessingItemTypes.erratic)).toBe(
      0.055,
    );
    expect(rigBonusFor(structure, reprocessingItemTypes.erratic)).toBe(1);
    expect(
      structureBonusFor(structure, reprocessingItemTypes.unrefinedMineral),
    ).toBe(0);
    expect(rigBonusFor(structure, reprocessingItemTypes.unrefinedMineral)).toBe(
      1,
    );
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

  it("gives the winning rig's multiplier for the band it sits in", () => {
    for (const [systemType, multiplier] of [
      [0, 1],
      [1, 1.06],
      [2, 1.12],
    ]) {
      const oreOnly = structureFromDocument({
        jobType: jobTypes.reprocessing,
        systemType,
        rigSlot1: 1,
      });

      expect(rigSecurityFor(oreOnly, reprocessingItemTypes.ore)).toBe(
        multiplier,
      );
    }
  });

  it("takes the multiplier of the rig that won, not of the other slot", () => {
    const bothSlots = structureFromDocument({
      jobType: jobTypes.reprocessing,
      systemType: 2,
      rigSlot1: 1,
      rigSlot2: 4,
    });

    expect(rigBonusFor(bothSlots, reprocessingItemTypes.ore)).toBe(3);
    expect(rigSecurityFor(bothSlots, reprocessingItemTypes.ore)).toBe(1.12);
  });

  it("gives a neutral multiplier when no fitted rig helps the item", () => {
    const oreOnly = structureFromDocument({
      jobType: jobTypes.reprocessing,
      systemType: 2,
      rigSlot1: 1,
    });
    const noRig = structureFromDocument({
      jobType: jobTypes.reprocessing,
      systemType: 2,
    });
    const unknown = structureFromDocument({ jobType: 999 });

    expect(rigSecurityFor(oreOnly, reprocessingItemTypes.gas)).toBe(1);
    expect(rigSecurityFor(noRig, reprocessingItemTypes.ore)).toBe(1);
    expect(rigSecurityFor(unknown, reprocessingItemTypes.ore)).toBe(1);
  });

  it("reads a published rig's yield where its group names the ore", () => {
    const published = {
      id: 46633,
      groupID: 1941,
      security: { hiSec: 1, lowSec: 1.06, nullSec: 1.12 },
      bonuses: [{ activity: "reprocessing", axis: "value", value: 1 }],
    };
    const structure = {
      jobType: jobTypes.reprocessing,
      systemType: 2,
      rigSlot1: 46633,
      rigSlot2: 0,
    };

    vi.spyOn(rigs, "getRigInfoFromID").mockImplementation((jobType, id) =>
      id === 46633 ? published : null,
    );

    expect(rigBonusFor(structure, reprocessingItemTypes.ore)).toBe(1);
    expect(rigBonusFor(structure, reprocessingItemTypes.gas)).toBe(0);
    expect(rigSecurityFor(structure, reprocessingItemTypes.ore)).toBe(1.12);

    vi.restoreAllMocks();
  });

  it("answers zero for a kind that carries no rig slots", () => {
    const unknown = structureFromDocument({ jobType: 999 });

    expect(rigBonusFor(unknown, reprocessingItemTypes.ore)).toBe(0);
    expect(structureBonusFor(unknown, reprocessingItemTypes.ore)).toBe(0);
  });
});
