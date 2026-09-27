import { describe, expect, it } from "vitest";

import rigSlotLabel from "./rigSlotLabel";
import { jobTypes, rigTypeMap } from "../../Context/defaultValues";

const kind = jobTypes.manufacturing;
const table = rigTypeMap[kind];

describe("how a setup's rig slots read", () => {
  it("names both rigs when both slots are fitted", () => {
    expect(rigSlotLabel(kind, 1, 3)).toBe(
      `${table[1].label}, ${table[3].label}`,
    );
  });

  it("names only the rig that is fitted", () => {
    expect(rigSlotLabel(kind, 2, 0)).toBe(table[2].label);
    expect(rigSlotLabel(kind, 0, 2)).toBe(table[2].label);
  });

  it("reads as the empty entry's own label when neither slot is fitted", () => {
    expect(rigSlotLabel(kind, 0, 0)).toBe(table[0].label);
  });

  it("reads an unknown kind as None", () => {
    expect(rigSlotLabel(999, 1, 2)).toBe("None");
  });

  it("leaves out a slot holding a rig the table does not name", () => {
    expect(rigSlotLabel(kind, 2, 404)).toBe(table[2].label);
  });
});
