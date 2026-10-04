import { describe, expect, it } from "vitest";

import {
  jobTypes,
  rigTypeMap,
  structureTypeMap,
} from "../../Context/defaultValues";

const KINDS = [
  jobTypes.manufacturing,
  jobTypes.reaction,
  jobTypes.invention,
  jobTypes.reprocessing,
];

const SIZES = new Set([2, 3, 4]);

describe("every structure that takes a rig says what size it takes", () => {
  it.each(KINDS)("covers every structure of kind %i", (jobType) => {
    const missing = Object.values(structureTypeMap[jobType] ?? {})
      .filter((structure) => !structure.npcStation)
      .filter((structure) => !SIZES.has(structure.rigSize))
      .map((structure) => structure.label);

    expect(missing).toEqual([]);
  });

  it.each(KINDS)("gives an NPC station no rig size, kind %i", (jobType) => {
    const stations = Object.values(structureTypeMap[jobType] ?? {}).filter(
      (structure) => structure.npcStation,
    );

    for (const station of stations) {
      expect(station.rigSize).toBeUndefined();
    }
  });

  it.each(KINDS)("has rigs to offer for kind %i", (jobType) => {
    expect(Object.keys(rigTypeMap[jobType] ?? {}).length).toBeGreaterThan(0);
  });
});
