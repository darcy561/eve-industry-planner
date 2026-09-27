import { describe, expect, it } from "vitest";

import { STRUCTURE_FIELDS, fieldsFor } from "./structureFields";
import { fieldsForKind } from "../../../../Functions/Custom Structures/customStructure";
import { jobTypes, structureKinds } from "../../../../Context/defaultValues";

const asked = (jobType) =>
  fieldsFor(fieldsForKind(jobType)).map((entry) => entry.id);

describe("which fields a kind is asked for", () => {
  it("asks manufacturing and reaction for a structure, rigs, security, tax and a system", () => {
    for (const jobType of [jobTypes.manufacturing, jobTypes.reaction]) {
      expect(asked(jobType)).toEqual([
        "structureType",
        "rigSlot1",
        "rigSlot2",
        "systemType",
        "tax",
        "systemID",
      ]);
    }
  });

  it("asks reprocessing for an implant instead of a system", () => {
    expect(asked(jobTypes.reprocessing)).toContain("implant");
    expect(asked(jobTypes.reprocessing)).not.toContain("systemID");
  });

  it("asks invention for neither", () => {
    expect(asked(jobTypes.invention)).not.toContain("implant");
    expect(asked(jobTypes.invention)).not.toContain("systemID");
  });

  it("asks a kind that carries no optional fields for none of them", () => {
    expect(asked(structureKinds.market)).toEqual([]);
    expect(asked(999)).toEqual([]);
  });

  it("offers no field that no kind stores", () => {
    const everyKindAsks = new Set(
      Object.values(structureKinds).flatMap((jobType) => asked(jobType)),
    );

    expect([...everyKindAsks].sort()).toEqual(
      STRUCTURE_FIELDS.map((entry) => entry.id).sort(),
    );
  });
});
