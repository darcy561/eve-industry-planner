import { describe, expect, it } from "vitest";

import {
  bonusReachesItem,
  familiesHelpedBy,
  itemInFamily,
  rigOptionsFor,
  rigsFittingSize,
  sourceBonusFor,
} from "./industryBonuses";

const families = {
  3: { id: 3, name: "Ships", categoryIDs: [6] },
  14: { id: 14, name: "Components", groupIDs: [334] },
};

const cruiser = { groupID: 26, categoryID: 6 };
const component = { groupID: 334, categoryID: 17 };

const thukker = {
  id: 45641,
  label: "Thukker Advanced Component Efficiency",
  kind: "rig",
  size: 3,
  bonuses: [
    { activity: "manufacturing", axis: "material", familyID: 14, value: 2.0 },
    { activity: "manufacturing", axis: "material", familyID: 15, value: 3.7 },
  ],
};

const raitaru = {
  id: 35825,
  label: "Raitaru",
  kind: "structure",
  bonuses: [
    { activity: "manufacturing", axis: "material", value: 1 },
    { activity: "manufacturing", axis: "time", value: 15 },
  ],
};

describe("which items a family holds", () => {
  it("holds an item named by its category", () => {
    expect(itemInFamily(cruiser, families[3])).toBe(true);
    expect(itemInFamily(component, families[3])).toBe(false);
  });

  it("holds an item named by its group", () => {
    expect(itemInFamily(component, families[14])).toBe(true);
    expect(itemInFamily(cruiser, families[14])).toBe(false);
  });

  it("holds nothing when either side is missing", () => {
    expect(itemInFamily(null, families[3])).toBe(false);
    expect(itemInFamily(cruiser, undefined)).toBe(false);
  });
});

describe("which items a bonus reaches", () => {
  it("reaches every item when it names no family", () => {
    const everything = {
      activity: "manufacturing",
      axis: "material",
      value: 1,
    };

    expect(bonusReachesItem(everything, cruiser, families)).toBe(true);
    expect(bonusReachesItem(everything, component, families)).toBe(true);
  });

  it("reaches only its own family when it names one", () => {
    const components = { familyID: 14, value: 2 };

    expect(bonusReachesItem(components, component, families)).toBe(true);
    expect(bonusReachesItem(components, cruiser, families)).toBe(false);
  });

  it("reaches nothing when the family it names is not published", () => {
    expect(bonusReachesItem({ familyID: 99 }, cruiser, families)).toBe(false);
  });
});

describe("what a source gives the item being built", () => {
  it("gives the figure for the family the item is in", () => {
    expect(
      sourceBonusFor(thukker, "manufacturing", "material", component, families),
    ).toBe(2.0);
  });

  it("gives nothing for an item none of its bonuses reach", () => {
    expect(
      sourceBonusFor(thukker, "manufacturing", "material", cruiser, families),
    ).toBe(0);
  });

  it("gives nothing on an axis or an activity it does not bonus", () => {
    expect(
      sourceBonusFor(thukker, "manufacturing", "time", component, families),
    ).toBe(0);
    expect(
      sourceBonusFor(thukker, "reaction", "material", component, families),
    ).toBe(0);
  });

  it("gives a structure's unscoped figure to anything", () => {
    for (const item of [cruiser, component]) {
      expect(
        sourceBonusFor(raitaru, "manufacturing", "material", item, families),
      ).toBe(1);
    }
  });

  it("takes the better figure where two bonuses both reach the item", () => {
    const both = {
      bonuses: [
        { activity: "manufacturing", axis: "material", value: 1 },
        { activity: "manufacturing", axis: "material", familyID: 3, value: 4 },
      ],
    };

    expect(
      sourceBonusFor(both, "manufacturing", "material", cruiser, families),
    ).toBe(4);
    expect(
      sourceBonusFor(both, "manufacturing", "material", component, families),
    ).toBe(1);
  });
});

describe("which rigs a structure may fit", () => {
  const catalogue = {
    sources: {
      45641: thukker,
      35825: raitaru,
      1: {
        id: 1,
        label: "Bravo",
        kind: "rig",
        size: 3,
        bonuses: thukker.bonuses,
      },
      2: {
        id: 2,
        label: "Alpha",
        kind: "rig",
        size: 2,
        bonuses: thukker.bonuses,
      },
      3: {
        id: 3,
        label: "Outpost",
        kind: "outpostRig",
        size: 3,
        bonuses: thukker.bonuses,
      },
    },
  };

  it("offers only the rigs that fit the size, in name order", () => {
    expect(
      rigsFittingSize(catalogue, "manufacturing", 3).map((rig) => rig.label),
    ).toEqual(["Bravo", "Thukker Advanced Component Efficiency"]);
  });

  it("offers neither a structure nor an outpost rig", () => {
    const kinds = rigsFittingSize(catalogue, "manufacturing", 3).map(
      (rig) => rig.kind,
    );

    expect(kinds).toEqual(["rig", "rig"]);
  });

  it("offers nothing for a kind of job none of them bonus", () => {
    expect(rigsFittingSize(catalogue, "invention", 3)).toEqual([]);
  });

  it("answers empty for a catalogue that has not arrived", () => {
    expect(rigsFittingSize(undefined, "manufacturing", 3)).toEqual([]);
  });
});

describe("what a rig field offers", () => {
  const catalogue = {
    families: {
      3: { id: 3, name: "Ships" },
      14: { id: 14, name: "Components" },
    },
    sources: {
      100: {
        id: 100,
        label: "Basic Small Ship",
        kind: "rig",
        size: 2,
        bonuses: [
          {
            activity: "manufacturing",
            axis: "material",
            familyID: 3,
            value: 2,
          },
        ],
      },
      200: {
        id: 200,
        label: "A Large Rig",
        kind: "rig",
        size: 3,
        bonuses: [
          {
            activity: "manufacturing",
            axis: "material",
            familyID: 3,
            value: 2,
          },
        ],
      },
    },
  };

  it("offers no rig, then the rigs that fit the size", () => {
    expect(
      rigOptionsFor(catalogue, "manufacturing", 2).map(
        (option) => option.label,
      ),
    ).toEqual(["None", "Basic Small Ship"]);
  });

  it("offers only no rig where the structure takes none", () => {
    expect(
      rigOptionsFor(catalogue, "manufacturing", undefined).map(
        (option) => option.label,
      ),
    ).toEqual(["None"]);
  });

  it("says which items each rig helps", () => {
    const offered = rigOptionsFor(catalogue, "manufacturing", 2);

    expect(offered[1].helps).toBe("Ships");
  });

  it("still offers a fitted rig that would not be offered", () => {
    const legacy = { id: 9, label: "Faction - ME - All" };

    expect(
      rigOptionsFor(catalogue, "manufacturing", 2, legacy).map(
        (option) => option.label,
      ),
    ).toEqual(["None", "Faction - ME - All", "Basic Small Ship"]);
  });

  it("does not offer a fitted rig twice", () => {
    const fitted = catalogue.sources[100];

    expect(
      rigOptionsFor(catalogue, "manufacturing", 2, fitted).map(
        (option) => option.label,
      ),
    ).toEqual(["None", "Basic Small Ship"]);
  });

  it("adds nothing for a slot holding no rig", () => {
    expect(
      rigOptionsFor(catalogue, "manufacturing", 2, { id: 0 }).map(
        (option) => option.label,
      ),
    ).toEqual(["None", "Basic Small Ship"]);
  });
});

describe("naming the items a rig helps", () => {
  const families = { 3: { name: "Ships" }, 14: { name: "Components" } };

  it("names every family it bonuses, once and in order", () => {
    const rig = {
      bonuses: [{ familyID: 14 }, { familyID: 3 }, { familyID: 14 }],
    };

    expect(familiesHelpedBy(rig, families)).toBe("Components, Ships");
  });

  it("says it helps everything when it names no family", () => {
    expect(familiesHelpedBy({ bonuses: [{ value: 1 }] }, families)).toBe(
      "Every item",
    );
  });
});

describe("the order a rig field offers its rigs in", () => {
  const manufacturing = (label, id) => ({
    id,
    label,
    kind: "rig",
    size: 2,
    bonuses: [{ activity: "manufacturing", axis: "material", value: 1 }],
  });

  const catalogue = {
    families: {},
    sources: {
      1: manufacturing("Basic Large Ship Material Efficiency II", 1),
      2: manufacturing("Advanced Component Time Efficiency I", 2),
      3: manufacturing("Basic Large Ship Material Efficiency I", 3),
      4: manufacturing("Advanced Component Time Efficiency II", 4),
      5: manufacturing("Thukker Component Material Efficiency", 5),
    },
  };

  it("puts every tier of one rig together, lowest first", () => {
    expect(
      rigsFittingSize(catalogue, "manufacturing", 2).map((rig) => rig.label),
    ).toEqual([
      "Advanced Component Time Efficiency I",
      "Advanced Component Time Efficiency II",
      "Basic Large Ship Material Efficiency I",
      "Basic Large Ship Material Efficiency II",
      "Thukker Component Material Efficiency",
    ]);
  });

  it("keeps the tiers of one rig in order", () => {
    const tiers = {
      families: {},
      sources: {
        1: manufacturing("Ammunition Efficiency V", 1),
        2: manufacturing("Ammunition Efficiency II", 2),
        3: manufacturing("Ammunition Efficiency IV", 3),
        4: manufacturing("Ammunition Efficiency I", 4),
        5: manufacturing("Ammunition Efficiency III", 5),
      },
    };

    expect(
      rigsFittingSize(tiers, "manufacturing", 2).map((rig) => rig.label),
    ).toEqual([
      "Ammunition Efficiency I",
      "Ammunition Efficiency II",
      "Ammunition Efficiency III",
      "Ammunition Efficiency IV",
      "Ammunition Efficiency V",
    ]);
  });

  it("keeps a rig carrying no tier with its own name", () => {
    const offered = rigsFittingSize(catalogue, "manufacturing", 2);

    expect(offered.at(-1).label).toBe("Thukker Component Material Efficiency");
  });
});
