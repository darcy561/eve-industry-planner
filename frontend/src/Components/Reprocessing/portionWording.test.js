import { describe, expect, it } from "vitest";
import { portionText, reprocessedAtATime } from "./portionWording";

describe("how much an item reprocesses in, in words", () => {
  it("names a hundred units for raw ore and one unit for compressed ore", () => {
    expect(portionText(100)).toBe("100 units");
    expect(portionText(1)).toBe("unit");
  });

  it("notes how many reprocess at a time only where it is more than one", () => {
    expect(reprocessedAtATime(100)).toBe("reprocessed 100 at a time");
    expect(reprocessedAtATime(1)).toBeNull();
  });
});
