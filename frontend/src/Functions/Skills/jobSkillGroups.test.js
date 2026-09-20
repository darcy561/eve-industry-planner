import { describe, expect, it } from "vitest";

import { SKILL_GROUP, groupJobSkills } from "./jobSkillGroups";
import {
  industrySkillIDs,
  jobTypes,
  marketSkillIDs,
} from "../../Context/defaultValues";
import { SALE_LOCATION_KIND } from "../MarketOrders/saleLocations";

// Keyed by type id, as a job document stores them and as the Job class holds
// them.
const jobSkills = {
  [industrySkillIDs.industry]: { typeID: industrySkillIDs.industry, level: 4 },
  3395: { typeID: 3395, level: 3 },
};

const characterSkills = {
  [industrySkillIDs.industry]: { activeLevel: 5 },
  3395: { activeLevel: 2 },
  [marketSkillIDs.brokerRelations]: { activeLevel: 4 },
  [marketSkillIDs.accounting]: { activeLevel: 5 },
};

const hub = { kind: SALE_LOCATION_KIND.NPC_STATION, name: "Jita" };
const citadel = { kind: SALE_LOCATION_KIND.CITADEL, name: "A Citadel" };

const group = (groups, id) => groups.find((g) => g.id === id);

const build = (overrides = {}) =>
  groupJobSkills({
    jobSkills,
    characterSkills,
    jobType: jobTypes.manufacturing,
    saleLocation: hub,
    ...overrides,
  });

describe("groupJobSkills", () => {
  it("states what the blueprint requires and whether it is met", () => {
    const rows = group(build(), SKILL_GROUP.REQUIRED).rows;

    expect(rows.map((r) => [r.typeID, r.level, r.required, r.met])).toEqual([
      [industrySkillIDs.industry, 5, 4, true],
      [3395, 2, 3, false],
    ]);
  });

  // A skill belongs in every group it belongs to. Industry is required and also
  // shortens the job, and saying so twice is the honest answer.
  it("lists a skill in more than one group where it belongs to both", () => {
    const groups = build();

    const inRequired = group(groups, SKILL_GROUP.REQUIRED).rows.map(
      (r) => r.typeID,
    );
    const inTime = group(groups, SKILL_GROUP.BUILD_TIME).rows.map(
      (r) => r.typeID,
    );

    expect(inRequired).toContain(industrySkillIDs.industry);
    expect(inTime).toContain(industrySkillIDs.industry);
  });

  // The whole-job skills are applied once rather than per skill, so listing them
  // among the 1%-a-level rows would say they do something they do not.
  it("separates the skills applied once over the whole job", () => {
    const rows = group(build(), SKILL_GROUP.BUILD_TIME).rows;

    const industry = rows.find((r) => r.typeID === industrySkillIDs.industry);
    const other = rows.find((r) => r.typeID === 3395);

    expect(industry.effect).toBe("applied to the whole job");
    expect(other.effect).toBe("1% a level");
  });

  it("names the reaction skill for a reaction rather than the industry ones", () => {
    const rows = group(
      build({ jobType: jobTypes.reaction }),
      SKILL_GROUP.BUILD_TIME,
    ).rows;

    expect(rows.map((r) => r.typeID)).toContain(industrySkillIDs.reaction);
    expect(rows.map((r) => r.typeID)).not.toContain(
      industrySkillIDs.advancedIndustry,
    );
  });

  it("names both selling skills at a station", () => {
    const rows = group(build(), SKILL_GROUP.SELLING).rows;

    expect(rows.map((r) => r.typeID)).toEqual([
      marketSkillIDs.brokerRelations,
      marketSkillIDs.accounting,
    ]);
    expect(rows[0].applies).toBe(true);
  });

  // A skill vanishing from a panel reads as a defect. It stays, marked as not
  // applying, because that is the answer to the question being asked.
  it("keeps Broker Relations at a citadel, marked as not applying", () => {
    const rows = group(
      build({ saleLocation: citadel }),
      SKILL_GROUP.SELLING,
    ).rows;
    const brokerRelations = rows.find(
      (r) => r.typeID === marketSkillIDs.brokerRelations,
    );

    expect(brokerRelations).toBeDefined();
    expect(brokerRelations.applies).toBe(false);
    expect(brokerRelations.effect).toMatch(/not applied here/);
  });

  it("keeps Accounting applying at a citadel", () => {
    const rows = group(
      build({ saleLocation: citadel }),
      SKILL_GROUP.SELLING,
    ).rows;
    const accounting = rows.find((r) => r.typeID === marketSkillIDs.accounting);

    expect(accounting.applies).toBe(true);
  });

  // A job whose whole output is owed to a parent never lists anything, so what
  // selling would cost is not a question it has.
  it("drops the selling group for a job with nothing to sell", () => {
    expect(group(build({ sells: false }), SKILL_GROUP.SELLING)).toBeUndefined();
  });

  // The panel is signed-in only today; the requirement is readable without an
  // account, and a level of zero would be a claim about a character there isn't.
  it("states requirements without levels when signed out", () => {
    const rows = group(
      build({ characterSkills: null }),
      SKILL_GROUP.REQUIRED,
    ).rows;

    expect(rows[0].level).toBeNull();
    expect(rows[0].met).toBe(false);
  });
});
