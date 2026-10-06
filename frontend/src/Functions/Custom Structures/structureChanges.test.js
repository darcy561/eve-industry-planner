import { describe, expect, it } from "vitest";
import { changeStructure, structureAsSetup } from "./structureChanges.js";
import { structureFromDocument } from "./customStructure.js";
import { jobTypes } from "../../Context/defaultValues";

const refinery = () =>
  structureFromDocument({
    jobType: jobTypes.reprocessing,
    structureType: 1,
    rigSlot1: 1,
    tax: 3,
  });

describe("changing a structure", () => {
  it("applies what an NPC station fixes when one is chosen", () => {
    const changed = changeStructure(refinery(), { structureType: 0 });

    expect(changed).toMatchObject({
      structureType: 0,
      rigSlot1: 0,
      rigSlot2: 0,
      tax: 0.25,
    });
  });

  it("leaves the structure it was handed alone", () => {
    const current = refinery();
    changeStructure(current, { structureType: 0 });

    expect(current.structureType).toBe(1);
    expect(current.tax).toBe(3);
  });

  it("leaves the station's tax for the reader to change once the station is left", () => {
    const atStation = changeStructure(refinery(), { structureType: 0 });
    const leftIt = changeStructure(atStation, { structureType: 1 });

    expect(leftIt.tax).toBe(0.25);
    expect(changeStructure(leftIt, { tax: 2 }).tax).toBe(2);
  });

  it("changes nothing a place does not decide", () => {
    expect(changeStructure(refinery(), { implant: 2 })).toMatchObject({
      structureType: 1,
      rigSlot1: 1,
      tax: 3,
      implant: 2,
    });
  });

  it("reads a structure as the setup the place rules are written against", () => {
    expect(structureAsSetup(refinery())).toMatchObject({
      jobType: jobTypes.reprocessing,
      structureID: 1,
      taxValue: 3,
    });
  });
});
