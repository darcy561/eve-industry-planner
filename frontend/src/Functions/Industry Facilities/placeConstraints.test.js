import { describe, expect, it } from "vitest";

import {
  allowedOptionsFor,
  constraintsFor,
  fieldsReleasedBy,
  forcedFieldsFor,
  jobTypesAllowedIn,
  enlistedValuesFor,
  settledSetup,
} from "./placeConstraints";
import {
  ZARZAKH_SYSTEM_ID,
  jobTypes,
  nullSecurityBandID,
  pirateFactions,
  structureTypeMap,
  systemTypeMap,
} from "../../Context/defaultValues";

const manufacturing = jobTypes.manufacturing;

describe("which place a setup is subject to", () => {
  it("puts a setup under The Fulcrum by its structure or by its system", () => {
    const byStructure = constraintsFor({
      jobType: manufacturing,
      structureID: 4,
    });
    const bySystem = constraintsFor({
      jobType: manufacturing,
      structureID: 2,
      systemID: ZARZAKH_SYSTEM_ID,
    });

    expect(byStructure.map((entry) => entry.id)).toEqual(["theFulcrum"]);
    expect(bySystem.map((entry) => entry.id)).toEqual(["theFulcrum"]);
  });

  it("puts a setup at an NPC station under its own rule, on every kind", () => {
    for (const jobType of Object.values(jobTypes)) {
      expect(
        constraintsFor({ jobType, structureID: 0 }).map((entry) => entry.id),
      ).toEqual(["npcStation"]);
    }
  });

  it("subjects a reaction in Zarzakh to nothing, because only manufacturing runs there", () => {
    expect(
      constraintsFor({
        jobType: jobTypes.reaction,
        structureID: 2,
        systemID: ZARZAKH_SYSTEM_ID,
      }),
    ).toEqual([]);
  });

  it("subjects an ordinary citadel to nothing", () => {
    expect(constraintsFor({ jobType: manufacturing, structureID: 2 })).toEqual(
      [],
    );
  });
});

describe("what a place fixes", () => {
  it("fixes The Fulcrum's structure, system, band, rigs and tax", () => {
    expect(forcedFieldsFor({ jobType: manufacturing, structureID: 4 })).toEqual(
      {
        structureID: 4,
        systemTypeID: nullSecurityBandID,
        systemID: ZARZAKH_SYSTEM_ID,
        rigSlot1: 0,
        rigSlot2: 0,
        taxValue: 0.25,
      },
    );
  });

  it("fixes the rig slots and the tax at an NPC station", () => {
    expect(forcedFieldsFor({ jobType: manufacturing, structureID: 0 })).toEqual(
      {
        rigSlot1: 0,
        rigSlot2: 0,
        taxValue: 0.25,
      },
    );
  });

  it("keeps The Fulcrum's structure when a reader names an NPC station in Zarzakh", () => {
    const inZarzakh = {
      jobType: manufacturing,
      structureID: 0,
      systemID: ZARZAKH_SYSTEM_ID,
    };

    expect(constraintsFor(inZarzakh).map((entry) => entry.id)).toEqual([
      "theFulcrum",
      "npcStation",
    ]);
    expect(forcedFieldsFor(inZarzakh).structureID).toBe(4);
  });

  it("fixes nothing where no rule is in force", () => {
    expect(forcedFieldsFor({ jobType: manufacturing, structureID: 2 })).toEqual(
      {},
    );
  });
});

describe("what a place gives an enlisted character", () => {
  it("gives nothing to a character flying for nobody", () => {
    expect(
      enlistedValuesFor({ jobType: manufacturing, structureID: 4 }),
    ).toEqual({});
  });

  it("gives nothing to a character flying for the wrong militia", () => {
    expect(
      enlistedValuesFor({ jobType: manufacturing, structureID: 4 }, 500003),
    ).toEqual({});
  });

  it("reduces the surcharge for either pirate militia", () => {
    for (const faction of [
      pirateFactions.angelCartel,
      pirateFactions.guristas,
    ]) {
      expect(
        enlistedValuesFor({ jobType: manufacturing, structureID: 4 }, faction),
      ).toEqual({ sccSurchargeReduction: 0.9 });
    }
  });

  it("never hands the faction list out as a figure", () => {
    const values = enlistedValuesFor(
      { jobType: manufacturing, structureID: 4 },
      pirateFactions.guristas,
    );

    expect(values.factions).toBeUndefined();
  });

  it("gives nothing at a place that names no militia", () => {
    expect(
      enlistedValuesFor(
        { jobType: manufacturing, structureID: 0 },
        pirateFactions.guristas,
      ),
    ).toEqual({});
  });
});

describe("what a field may offer", () => {
  const everyStructure = Object.values(structureTypeMap[manufacturing]);

  it("offers every candidate where nothing is fixed", () => {
    expect(
      allowedOptionsFor(
        { jobType: manufacturing, structureID: 2 },
        "structureID",
        everyStructure,
      ),
    ).toEqual(everyStructure);
  });

  it("keeps offering the field a setup came into a place by", () => {
    const offered = allowedOptionsFor(
      { jobType: manufacturing, structureID: 4 },
      "structureID",
      everyStructure,
    );

    expect(offered).toEqual(everyStructure);
  });

  it("offers only the fixed value for a field the place decides", () => {
    const offered = allowedOptionsFor(
      { jobType: manufacturing, structureID: 4 },
      "systemTypeID",
      Object.values(systemTypeMap[manufacturing]),
    );

    expect(offered.map((entry) => entry.id)).toEqual([nullSecurityBandID]);
  });

  it("offers no rig where the place takes none", () => {
    const offered = allowedOptionsFor(
      { jobType: manufacturing, structureID: 0 },
      "rigSlot1",
      [{ id: 0 }, { id: 1 }, { id: 2 }],
    );

    expect(offered.map((entry) => entry.id)).toEqual([0]);
  });
});

describe("which systems take which jobs", () => {
  it("allows only manufacturing in Zarzakh", () => {
    expect(jobTypesAllowedIn(ZARZAKH_SYSTEM_ID)).toEqual([manufacturing]);
  });

  it("allows every kind in a system no rule names", () => {
    expect(jobTypesAllowedIn(30000142)).toBeNull();
  });
});

describe("leaving a place that fixed a setup's other choices", () => {
  const atTheFulcrum = {
    jobType: manufacturing,
    structureID: 4,
    systemTypeID: 0,
    systemID: ZARZAKH_SYSTEM_ID,
    rigSlot1: 0,
    rigSlot2: 0,
    taxValue: 0.25,
  };

  it("lets go of everything else when the structure is changed", () => {
    const released = fieldsReleasedBy(atTheFulcrum, "structureID", 2);

    expect(released.sort()).toEqual(
      ["rigSlot1", "rigSlot2", "systemID", "systemTypeID", "taxValue"].sort(),
    );
  });

  it("lets go of the structure when the system is changed", () => {
    expect(fieldsReleasedBy(atTheFulcrum, "systemID", 30000142)).toContain(
      "structureID",
    );
  });

  it("lets go of nothing when the choice is what the place already fixes", () => {
    expect(fieldsReleasedBy(atTheFulcrum, "structureID", 4)).toEqual([]);
  });

  it("lets go of what both places fix when two are in force at once", () => {
    const atTheFulcrumAndAnNPCStation = {
      jobType: manufacturing,
      structureID: 0,
      systemID: ZARZAKH_SYSTEM_ID,
      systemTypeID: nullSecurityBandID,
      rigSlot1: 0,
      rigSlot2: 0,
      taxValue: 0.25,
    };

    expect(constraintsFor(atTheFulcrumAndAnNPCStation)).toHaveLength(2);

    const released = fieldsReleasedBy(
      atTheFulcrumAndAnNPCStation,
      "systemID",
      30000142,
    );

    expect(released).toContain("structureID");
    expect(released).toContain("rigSlot1");
    expect(released).not.toContain("systemID");
  });

  it("lets go of nothing when a choice matches one place and leaves another", () => {
    const atTheFulcrumAndAnNPCStation = {
      jobType: manufacturing,
      structureID: 0,
      systemID: ZARZAKH_SYSTEM_ID,
      systemTypeID: nullSecurityBandID,
      taxValue: 0.25,
    };

    expect(
      fieldsReleasedBy(atTheFulcrumAndAnNPCStation, "taxValue", 0.25),
    ).toEqual([]);
  });

  it("lets go of nothing where no place is in force", () => {
    expect(
      fieldsReleasedBy(
        { jobType: manufacturing, structureID: 2, systemID: 30000142 },
        "structureID",
        3,
      ),
    ).toEqual([]);
  });
});

describe("the band The Fulcrum sits in", () => {
  it("settles a setup into the band Zarzakh really is", () => {
    const settled = settledSetup({
      jobType: manufacturing,
      structureID: 4,
      systemTypeID: 0,
    });

    expect(settled.systemTypeID).toBe(nullSecurityBandID);
    expect(systemTypeMap[manufacturing][settled.systemTypeID].label).toBe(
      "Null Sec / WH",
    );
  });

  it("fits no rig there, so the band scales nothing", () => {
    const settled = settledSetup({
      jobType: manufacturing,
      structureID: 4,
      rigSlot1: 1,
      rigSlot2: 2,
    });

    expect(settled.rigSlot1).toBe(0);
    expect(settled.rigSlot2).toBe(0);
  });
});
