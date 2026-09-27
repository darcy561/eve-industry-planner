import { describe, expect, it } from "vitest";

import {
  getImplantFromID,
  getRigInfoFromID,
  getStructureInfoFromID,
  getSystemTypeFromID,
} from "./getStructureInfo";
import {
  Implants,
  jobTypes,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../Context/defaultValues";

const lookups = [
  ["a structure type", getStructureInfoFromID, structureTypeMap],
  ["a rig", getRigInfoFromID, rigTypeMap],
  ["a system security", getSystemTypeFromID, systemTypeMap],
  ["an implant", getImplantFromID, Implants],
];

describe("reading a structure's vocabulary out of the tables", () => {
  it.each(lookups)("finds %s by its kind and id", (_name, read, table) => {
    for (const jobType of Object.values(jobTypes)) {
      const entries = table[jobType];
      if (!entries) continue;

      for (const id of Object.keys(entries)) {
        expect(read(jobType, Number(id))).toBe(entries[id]);
      }
    }
  });

  it.each(lookups)(
    "answers nothing for a kind it does not know",
    (_name, read) => {
      expect(read(999, 0)).toBeNull();
    },
  );

  it.each(lookups)(
    "answers nothing for an id its kind does not carry",
    (_name, read) => {
      expect(read(jobTypes.manufacturing, 4040)).toBeNull();
    },
  );

  it.each(lookups)(
    "answers nothing when asked about nothing",
    (_name, read) => {
      expect(read(undefined, undefined)).toBeNull();
    },
  );
});
