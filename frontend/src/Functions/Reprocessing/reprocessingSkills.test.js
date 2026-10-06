import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLEAR_ICICLE,
  HEDBERGITE,
  SCORDITE,
  VELDSPAR,
  reprocessingFile,
} from "../../tests/reprocessingFixtures.js";
import { reprocessingItemTypes } from "../../Context/defaultValues";

const getReprocessingData = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: (...args) => getReprocessingData(...args),
  });
});

const { primeReprocessing, resetReprocessing } =
  await import("../Static/reprocessing.js");
const {
  allReprocessingSkillIDs,
  itemTypeRaisedBy,
  yieldKindsFor,
  reprocessingSkillIDsFor,
} = await import("./reprocessingSkills.js");

beforeEach(async () => {
  resetReprocessing();
  getReprocessingData.mockResolvedValue(
    reprocessingFile([VELDSPAR, SCORDITE, CLEAR_ICICLE, HEDBERGITE], {}),
  );
  await primeReprocessing();
});

describe("the skills a reprocessing yield reads", () => {
  it("are, across the file, the two every yield reads then each processing skill once", () => {
    expect(allReprocessingSkillIDs()).toEqual([
      3385, 3389, 60378, 60377, 18025,
    ]);
  });

  it("for some items, are the two every yield reads and those items' own skills once", () => {
    expect(
      reprocessingSkillIDsFor([VELDSPAR.id, SCORDITE.id, CLEAR_ICICLE.id]),
    ).toEqual([3385, 3389, 60377, 18025]);
  });

  it("ignore an id the file does not carry", () => {
    expect(reprocessingSkillIDsFor(["34", 999999])).toEqual([3385, 3389]);
  });

  it("name the kind of item each processing skill raises", () => {
    expect(itemTypeRaisedBy(18025)).toBe(reprocessingItemTypes.ice);
    expect(itemTypeRaisedBy(60377)).toBe(reprocessingItemTypes.ore);
    expect(itemTypeRaisedBy(1)).toBeUndefined();
  });

  it("are only the two every yield reads before the file arrives", () => {
    resetReprocessing();
    expect(allReprocessingSkillIDs()).toEqual([3385, 3389]);
  });
});

describe("the kinds a setup states a yield for", () => {
  it("are ore, moon ore and ice before anything is read, each with every skill of its kind", () => {
    expect(yieldKindsFor([])).toEqual([
      { itemType: reprocessingItemTypes.ore, skillIDs: [60378, 60377] },
      { itemType: reprocessingItemTypes.ice, skillIDs: [18025] },
    ]);
  });

  it("read only the pasted items' own skills for a kind that was pasted", () => {
    expect(yieldKindsFor([VELDSPAR.id])[0]).toEqual({
      itemType: reprocessingItemTypes.ore,
      skillIDs: [60377],
    });
  });

  it("add a kind that was pasted beyond the three always shown", () => {
    expect(
      yieldKindsFor([HEDBERGITE.id]).map((kind) => kind.itemType),
    ).toContain(HEDBERGITE.itemType);
  });
});
