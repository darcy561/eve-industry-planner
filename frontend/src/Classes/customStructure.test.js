import { describe, expect, it } from "vitest";

import CustomStructure from "./customStructure";
import GLOBAL_CONFIG from "../global-config-app";
import { jobTypes } from "../Context/defaultValues";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

describe("describing a structure to cost jobs in", () => {
  it("mints an id naming the job type it was made for", () => {
    const structure = new CustomStructure({}, jobTypes.manufacturing);

    expect(structure.jobType).toBe(jobTypes.manufacturing);
    expect(structure.id).toMatch(/-.+/);
  });

  it("keeps the id and job type a stored structure already has", () => {
    const structure = new CustomStructure({
      id: "manufacturing-1",
      jobType: jobTypes.reaction,
    });

    expect(structure.id).toBe("manufacturing-1");
    expect(structure.jobType).toBe(jobTypes.reaction);
  });

  it("starts in the default system when none was recorded", () => {
    expect(new CustomStructure({}).systemID).toBe(DEFAULT_SYSTEM);
    expect(new CustomStructure({ systemID: null }).systemID).toBe(
      DEFAULT_SYSTEM,
    );
    expect(new CustomStructure({ systemID: "" }).systemID).toBe(DEFAULT_SYSTEM);
  });

  // Settings arrive from text fields, so a number can turn up as the string
  // the user typed.
  it("reads a typed number as a number", () => {
    expect(new CustomStructure({ tax: "2.5" }).tax).toBe(2.5);
    expect(new CustomStructure({ systemID: "30000142" }).systemID).toBe(
      30000142,
    );
  });

  it("falls back rather than holding something that is not a number", () => {
    expect(new CustomStructure({ tax: "abc" }).tax).toBe(0);
    expect(new CustomStructure({ systemID: "abc" }).systemID).toBe(
      DEFAULT_SYSTEM,
    );
  });
});

describe("changing a structure", () => {
  function structure() {
    return new CustomStructure({
      name: "Home",
      jobType: jobTypes.manufacturing,
    });
  }

  // The name is what a user typed, and the class is the only place that has to
  // know it needs cleaning.
  it("strips markup from a name", () => {
    const custom = structure();

    custom.setName('<img src=x onerror="alert(1)">Jita build');

    expect(custom.name).not.toContain("<");
    expect(custom.name).toContain("Jita build");
  });

  it("settles a tax and a system id as they are set", () => {
    const custom = structure();

    custom.setTax("3.5");
    custom.setSystemID("30000142");
    expect(custom.tax).toBe(3.5);
    expect(custom.systemID).toBe(30000142);

    custom.setTax("");
    custom.setSystemID("");
    expect(custom.tax).toBe(0);
    expect(custom.systemID).toBe(DEFAULT_SYSTEM);
  });

  it("records the structure, rig and system chosen", () => {
    const custom = structure();

    custom.setStructureType(2);
    custom.setRigType(1);
    custom.setSystemType(3);
    custom.setDefault(true);

    expect(custom.structureType).toBe(2);
    expect(custom.rigType).toBe(1);
    expect(custom.systemType).toBe(3);
    expect(custom.default).toBe(true);
  });
});

describe("storing a structure", () => {
  it("writes the fields as they stand, and reads them back the same", () => {
    const custom = new CustomStructure({
      id: "manufacturing-1",
      jobType: jobTypes.manufacturing,
      name: "Home",
      systemType: 3,
      structureType: 2,
      rigType: 1,
      systemID: 30000142,
      tax: 2.5,
      default: true,
    });

    const document = custom.toDocument();

    expect(document).toEqual({
      id: "manufacturing-1",
      jobType: jobTypes.manufacturing,
      name: "Home",
      systemType: 3,
      structureType: 2,
      rigType: 1,
      systemID: 30000142,
      tax: 2.5,
      default: true,
    });
    expect(new CustomStructure(document).toDocument()).toEqual(document);
  });

  // Every entry point settles its value, so a document written from a
  // structure built out of typed text is already clean.
  it("writes numbers for values that arrived as text", () => {
    const custom = new CustomStructure({ tax: "2.5", systemID: "30000142" });

    const document = custom.toDocument();

    expect(document.tax).toBe(2.5);
    expect(document.systemID).toBe(30000142);
  });
});
