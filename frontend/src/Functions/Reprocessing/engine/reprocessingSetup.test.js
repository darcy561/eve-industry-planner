import { describe, expect, it } from "vitest";
import {
  COMPRESSED_AMBER_CYTOSEROCIN as COMPRESSED_GAS,
  VELDSPAR,
} from "../../../tests/reprocessingFixtures.js";

const { reprocessingSetupFrom, yieldFor } =
  await import("./reprocessingSetup.js");
const { structureFromDocument } =
  await import("../../Custom Structures/customStructure.js");
const { jobTypes, reprocessingItemTypes } =
  await import("../../../Context/defaultValues");

const TRAINED = { 3385: 5, 3389: 5, [VELDSPAR.reprocessingSkill]: 5 };

function refinery(fields) {
  return structureFromDocument({ jobType: jobTypes.reprocessing, ...fields });
}

describe("reprocessingSetupFrom", () => {
  it("is an NPC station with no skills when given nothing", () => {
    expect(yieldFor(reprocessingSetupFrom(), VELDSPAR)).toBe(50);
  });

  it("resolves the structure's bonus for every kind at once", () => {
    const setup = reprocessingSetupFrom(refinery({ structureType: 3 }));

    expect(setup.kinds[reprocessingItemTypes.ore].structure).toBe(0.055);
    expect(setup.kinds[reprocessingItemTypes.ice].structure).toBe(0.055);
    expect(setup.kinds[reprocessingItemTypes.gas].structure).toBe(10);
    expect(setup.kinds[reprocessingItemTypes.erratic].structure).toBe(0.055);
    expect(setup.kinds[reprocessingItemTypes.unrefinedMineral].structure).toBe(
      0,
    );
  });

  it("reads the implant the structure names", () => {
    const setup = reprocessingSetupFrom(refinery({ implant: 3 }));

    expect(setup.implant).toBe(0.04);
    expect(yieldFor(setup, VELDSPAR)).toBeCloseTo(50 * 1.04, 10);
  });

  it("carries the structure's tax as a percentage", () => {
    expect(reprocessingSetupFrom(refinery({ tax: 2.5 })).taxPercent).toBe(2.5);
    expect(reprocessingSetupFrom().taxPercent).toBe(0);
  });

  it("keeps its own copy of the skills it was given", () => {
    const skills = { ...TRAINED };
    const setup = reprocessingSetupFrom(undefined, skills);
    skills[3385] = 0;

    expect(yieldFor(setup, VELDSPAR)).toBeCloseTo(69.575, 10);
    expect(Object.isFrozen(setup)).toBe(true);
    expect(Object.isFrozen(setup.skills)).toBe(true);
  });
});

describe("yieldFor", () => {
  it("raises ore by Reprocessing, Reprocessing Efficiency and the ore's own skill", () => {
    const setup = reprocessingSetupFrom(undefined, TRAINED);

    expect(yieldFor(setup, VELDSPAR)).toBeCloseTo(50 * 1.15 * 1.1 * 1.1, 10);
  });

  it("decompresses gas by the structure's gas bonus and the decompression skill", () => {
    const setup = reprocessingSetupFrom(refinery({ structureType: 3 }), {
      [COMPRESSED_GAS.reprocessingSkill]: 5,
    });

    expect(yieldFor(setup, COMPRESSED_GAS)).toBe(95);
  });

  it("gives nothing for a kind the setup does not know", () => {
    expect(
      yieldFor(reprocessingSetupFrom(), { itemType: 99, reprocessingSkill: 0 }),
    ).toBe(0);
  });

  it("gives the same answer however often it is asked", () => {
    const setup = reprocessingSetupFrom(
      refinery({ structureType: 3 }),
      TRAINED,
    );

    expect(yieldFor(setup, VELDSPAR)).toBe(yieldFor(setup, VELDSPAR));
  });
});
