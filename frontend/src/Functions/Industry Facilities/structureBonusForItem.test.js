import { afterEach, describe, expect, it, vi } from "vitest";

import { structureBonusForItem } from "./structureBonusForItem";
import {
  capitalShipFamilyID,
  jobTypes,
  pirateFactions,
  structureTypeMap,
} from "../../Context/defaultValues";
import { readIndustryBonusCatalogue } from "../Static/industryBonuses";
import { itemRecord } from "../Static/items";

vi.mock("../Static/industryBonuses", () => ({
  readIndustryBonusCatalogue: vi.fn(),
}));
vi.mock("../Static/items", async (importOriginal) => ({
  ...(await importOriginal()),
  itemRecord: vi.fn(),
}));

const ANGEL_CRUISER = 17720;
const ANGEL_DREADNOUGHT = 42124;
const CALDARI_CRUISER = 621;

const families = {
  [capitalShipFamilyID]: { id: capitalShipFamilyID, groupIDs: [485] },
};

const items = {
  [ANGEL_CRUISER]: {
    group_id: 26,
    category_id: 6,
    faction_id: pirateFactions.angelCartel,
  },
  [ANGEL_DREADNOUGHT]: {
    group_id: 485,
    category_id: 6,
    faction_id: pirateFactions.angelCartel,
  },
  [CALDARI_CRUISER]: { group_id: 26, category_id: 6, faction_id: 500001 },
};

function published(sources = {}) {
  readIndustryBonusCatalogue.mockReturnValue({ families, sources });
  itemRecord.mockImplementation((typeID) => items[typeID]);
}

const theFulcrum = structureTypeMap[jobTypes.manufacturing][4];
const largeCitadel = structureTypeMap[jobTypes.manufacturing][2];

afterEach(() => {
  vi.clearAllMocks();
});

describe("what The Fulcrum gives what is built there", () => {
  it("gives its whole bonus to a pirate sub-capital", () => {
    published();

    expect(
      structureBonusForItem(
        theFulcrum,
        jobTypes.manufacturing,
        "material",
        ANGEL_CRUISER,
      ),
    ).toBe(6);
  });

  it("gives nothing to a hull of any other faction", () => {
    published();

    expect(
      structureBonusForItem(
        theFulcrum,
        jobTypes.manufacturing,
        "material",
        CALDARI_CRUISER,
      ),
    ).toBe(0);
  });

  it("gives nothing to a pirate capital", () => {
    published();

    expect(
      structureBonusForItem(
        theFulcrum,
        jobTypes.manufacturing,
        "material",
        ANGEL_DREADNOUGHT,
      ),
    ).toBe(0);
  });

  it("gives nothing when the item is not one it knows", () => {
    published();

    expect(
      structureBonusForItem(theFulcrum, jobTypes.manufacturing, "material", 99),
    ).toBe(0);
  });
});

describe("what an ordinary structure gives", () => {
  it("gives its flat figure to anything, scoping nothing", () => {
    published();

    for (const itemID of [ANGEL_CRUISER, CALDARI_CRUISER, ANGEL_DREADNOUGHT]) {
      expect(
        structureBonusForItem(
          largeCitadel,
          jobTypes.manufacturing,
          "material",
          itemID,
        ),
      ).toBe(1);
    }
  });

  it("prefers the game's own figures where the game publishes them", () => {
    published({
      2: {
        id: 2,
        kind: "structure",
        bonuses: [{ activity: "manufacturing", axis: "material", value: 4.2 }],
      },
    });

    expect(
      structureBonusForItem(
        { ...largeCitadel, publishedID: 2 },
        jobTypes.manufacturing,
        "material",
        CALDARI_CRUISER,
      ),
    ).toBe(4.2);
  });

  it("answers nothing for no structure at all", () => {
    published();

    expect(
      structureBonusForItem(null, jobTypes.manufacturing, "material", 1),
    ).toBe(0);
  });
});
