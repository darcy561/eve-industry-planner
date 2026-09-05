import { describe, it, expect } from "vitest";
import {
  serialiseGroupToTemplatePayload,
  hasParentCycle,
} from "../src/Functions/GroupTemplates/serialiseGroupToTemplatePayload";

function minimalJob(overrides = {}) {
  const jobID = overrides.jobID ?? "job-a";
  return {
    jobID,
    itemID: overrides.itemID ?? 34,
    jobType: overrides.jobType ?? 1,
    name: overrides.name ?? "Test job",
    parentJobs: overrides.parentJobs ?? [],
    itemsProducedPerRun: overrides.itemsProducedPerRun ?? 1,
    totalQuantityProduced:
      overrides.totalQuantity !== undefined ? overrides.totalQuantity : 5,
    build: {
      materials: overrides.materials ?? [
        { typeID: 35, name: "Mat", quantity: 1 },
      ],
      childJobs: overrides.childJobs ?? {},
      setup: overrides.setup ?? {
        s1: {
          runCount: 5,
          jobCount: 1,
          ME: 2,
          TE: 4,
          rigID: 0,
          structureID: 0,
          systemTypeID: 0,
          systemID: 30000142,
          taxValue: 0.1,
          customStructureID: "",
          selectedCharacter: "",
        },
      },
    },
    rawData: { products: [{ quantity: 1 }] },
  };
}

describe("serialiseGroupToTemplatePayload", () => {
  it("serializes a single job", () => {
    const j = minimalJob({ jobID: "job-1" });
    const out = serialiseGroupToTemplatePayload({
      groupID: "group-1",
      jobs: [j],
      name: "One",
      description: "d",
    });
    expect(out.name).toBe("One");
    expect(out.payload.jobs).toHaveLength(1);
    expect(out.payload.jobs[0].templateJobId).toBe("tj-001");
    expect(out.payload.jobs[0].desiredTotalQuantity).toBe(5);
    expect(out.payload.jobs[0].presetSetups).toHaveLength(1);
    expect(out.payload.jobs[0].presetSetups[0].runCount).toBe(5);
  });

  it("maps parent and child links inside the group", () => {
    const child = minimalJob({
      jobID: "job-c",
      itemID: 35,
      parentJobs: ["job-p"],
      childJobs: {},
      setup: {
        s1: {
          runCount: 1,
          jobCount: 1,
          ME: 0,
          TE: 0,
          rigID: 0,
          structureID: 0,
          systemTypeID: 0,
          systemID: 1,
          taxValue: 0,
          customStructureID: "",
        },
      },
      totalQuantity: 1,
      materials: [],
    });
    const parent = minimalJob({
      jobID: "job-p",
      childJobs: { 35: ["job-c"] },
      materials: [{ typeID: 35, name: "Mat", quantity: 1 }],
      parentJobs: [],
    });
    const out = serialiseGroupToTemplatePayload({
      groupID: "g",
      jobs: [parent, child],
    });
    const tChild = out.payload.jobs.find((n) => n.itemID === 35);
    const tParent = out.payload.jobs.find((n) => n.itemID === 34);
    expect(tChild.parentTemplateJobIds).toContain(tParent.templateJobId);
    expect(
      tParent.childLinksByMaterialTypeId["35"] ||
        tParent.childLinksByMaterialTypeId[35]
    ).toContain(tChild.templateJobId);
  });
});

describe("hasParentCycle", () => {
  it("detects a cycle", () => {
    const m = new Map([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    expect(hasParentCycle(m)).toBe(true);
  });

  it("returns false for a chain", () => {
    const m = new Map([
      ["c", ["p"]],
      ["p", []],
    ]);
    expect(hasParentCycle(m)).toBe(false);
  });
});
