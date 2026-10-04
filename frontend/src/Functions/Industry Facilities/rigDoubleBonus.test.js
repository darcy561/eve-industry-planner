import { afterEach, describe, expect, it, vi } from "vitest";

import { rigsCompete } from "./rigs";
import * as industryBonuses from "./industryBonuses";
import { jobTypes } from "../../Context/defaultValues";

const SMALL_SHIPS = 7;
const LARGE_SHIPS = 9;

function rig(id, { groupID, axis, familyID, activity = "manufacturing" }) {
  return {
    id,
    groupID,
    kind: "rig",
    size: 2,
    bonuses: [{ activity, axis, familyID, value: 1 }],
  };
}

const smallShipME1 = rig(46601, {
  groupID: 100,
  axis: "material",
  familyID: SMALL_SHIPS,
});
const smallShipME2 = rig(46602, {
  groupID: 100,
  axis: "material",
  familyID: SMALL_SHIPS,
});
const smallShipTE1 = rig(46603, {
  groupID: 200,
  axis: "time",
  familyID: SMALL_SHIPS,
});
const largeShipME1 = rig(46604, {
  groupID: 300,
  axis: "material",
  familyID: LARGE_SHIPS,
});
const regrouped = rig(46605, {
  groupID: 999,
  axis: "material",
  familyID: SMALL_SHIPS,
});

function catalogue(...rigs) {
  vi.spyOn(industryBonuses, "readIndustryBonuses").mockReturnValue({
    families: {},
    sources: Object.fromEntries(rigs.map((entry) => [entry.id, entry])),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a structure may not carry the same bonus twice", () => {
  it("refuses a tier II beside the tier I of the same rig", () => {
    catalogue(smallShipME1, smallShipME2);

    expect(
      rigsCompete(smallShipME2, smallShipME1.id, jobTypes.manufacturing),
    ).toBe(true);
  });

  it("allows the time rig of the same family beside the material one", () => {
    catalogue(smallShipME1, smallShipTE1);

    expect(
      rigsCompete(smallShipTE1, smallShipME1.id, jobTypes.manufacturing),
    ).toBe(false);
  });

  it("allows the same figure for a different family", () => {
    catalogue(smallShipME1, largeShipME1);

    expect(
      rigsCompete(largeShipME1, smallShipME1.id, jobTypes.manufacturing),
    ).toBe(false);
  });

  it("refuses the same figure for the same family however the two are grouped", () => {
    catalogue(smallShipME1, regrouped);

    expect(
      rigsCompete(regrouped, smallShipME1.id, jobTypes.manufacturing),
    ).toBe(true);
  });

  it("keeps two ore kinds fittable together, which name no family of their own", () => {
    const ore = rig(46606, {
      groupID: 1941,
      axis: "value",
      activity: "reprocessing",
    });
    const ice = rig(46607, {
      groupID: 1942,
      axis: "value",
      activity: "reprocessing",
    });
    catalogue(ore, ice);

    expect(rigsCompete(ice, ore.id, jobTypes.reprocessing)).toBe(false);
  });

  it("refuses two tiers of one ore kind", () => {
    const oreI = rig(46608, {
      groupID: 1941,
      axis: "value",
      activity: "reprocessing",
    });
    const oreII = rig(46609, {
      groupID: 1941,
      axis: "value",
      activity: "reprocessing",
    });
    catalogue(oreI, oreII);

    expect(rigsCompete(oreII, oreI.id, jobTypes.reprocessing)).toBe(true);
  });
});
