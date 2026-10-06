import { describe, expect, it } from "vitest";

import { render, screen } from "@testing-library/react";
import { STRUCTURE_FIELDS, StructureField, fieldsFor } from "./structureFields";
import { fieldsForKind } from "../../Functions/Custom Structures/customStructure";
import { jobTypes, structureKinds } from "../../Context/defaultValues";

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

describe("what a field says it is for", () => {
  it("describes a reprocessing structure's tax as what its refinery charges", () => {
    const tax = STRUCTURE_FIELDS.find((entry) => entry.id === "tax");

    expect(tax.describe({ jobType: jobTypes.reprocessing })).toMatch(
      /refinery/,
    );
    expect(tax.describe({ jobType: jobTypes.manufacturing })).toBeNull();
  });
});

describe("a field laid out compactly", () => {
  const entry = {
    id: "tax",
    title: "Structure Tax",
    shortTitle: ({ jobType }) =>
      jobType === jobTypes.reprocessing ? "Reprocessing tax" : "Tax",
    description: "What the structure charges.",
    render: () => <span>field</span>,
  };

  it("takes its short name and leaves out its description", () => {
    render(
      <StructureField
        entry={entry}
        context={{ jobType: jobTypes.reprocessing }}
        compact
      />,
    );

    expect(screen.getByText("Reprocessing tax")).toBeInTheDocument();
    expect(screen.queryByText("What the structure charges.")).toBeNull();
  });

  it("keeps its full name and description otherwise", () => {
    render(
      <StructureField
        entry={entry}
        context={{ jobType: jobTypes.reprocessing }}
      />,
    );

    expect(screen.getByText("Structure Tax")).toBeInTheDocument();
    expect(screen.getByText("What the structure charges.")).toBeInTheDocument();
  });
});
