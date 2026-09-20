import bpSkills from "../../RawData/bpSkills.json";
import {
  industrySkillIDs,
  jobTypes,
  marketSkillIDs,
} from "../../Context/defaultValues";
import { SALE_LOCATION_KIND } from "../MarketOrders/saleLocations";

/**
 * A job's skills grouped by what each one changes.
 *
 * A player has three questions about skills on this stage: what the blueprint
 * requires, what is making the job slower than it needs to be, and what is
 * making the sale cost more. The last two are answered by skills the requirement
 * list never mentions.
 *
 * A skill appears in every group it belongs to. Industry shortens the job and is
 * usually also required, and saying so twice is the honest answer.
 */

/**
 * @enum {string}
 */
export const SKILL_GROUP = {
  REQUIRED: "required",
  BUILD_TIME: "buildTime",
  SELLING: "selling",
};

/**
 * @typedef {object} SkillRow
 * @property {number} typeID
 * @property {string} name
 * @property {number|null} level - The character's active level, null when signed out
 * @property {number|null} required - The level the blueprint asks for, where it asks
 * @property {boolean} met - Whether the requirement is satisfied
 * @property {string} [effect] - What this skill does for this job, in words
 * @property {boolean} [applies] - False for a skill that would apply elsewhere
 *   but not at this sale location
 * @property {number|null} proposed - A level being tried, or null
 * @property {boolean} metWhenProposed - Whether the requirement is satisfied at
 *   the proposed level
 */

/**
 * @typedef {object} SkillGroup
 * @property {string} id - One of SKILL_GROUP
 * @property {string} label
 * @property {string} [note] - Why the group is empty, where it is
 * @property {SkillRow[]} rows
 * @property {{met: number, total: number, short: SkillRow[]}} [requirement] - How
 *   much of the group is satisfied, for a group that states a requirement
 */

/**
 * @param {object} params
 * @param {Object<string, {typeID: number, level: number}>} params.jobSkills -
 *   `activeJob.skills`, keyed by type id
 * @param {object|null} params.characterSkills - Keyed by type id, null when signed out
 * @param {number} params.jobType - One of `jobTypes`
 * @param {import("../MarketOrders/saleLocations").SaleLocation|null} params.saleLocation
 * @param {boolean} params.sells - Whether this job has output to sell at all
 * @param {Object<number, number>} [params.proposed] - Levels being tried, keyed
 *   by skill type id
 * @returns {SkillGroup[]}
 */
export function groupJobSkills({
  jobSkills = {},
  characterSkills = null,
  jobType,
  saleLocation = null,
  sells = true,
  proposed = {},
}) {
  const levelOf = (typeID) =>
    characterSkills ? (characterSkills[typeID]?.activeLevel ?? 0) : null;

  const row = (typeID, { required = null, effect, applies = true } = {}) => {
    const level = levelOf(typeID);
    // A level being tried is only a proposal where it differs from the real one;
    // "2 → 2" is not a question anybody asked.
    const tried = proposed[typeID];
    const proposedLevel =
      Number.isInteger(tried) && tried !== level ? tried : null;
    const at = proposedLevel ?? level;

    return {
      typeID,
      name: bpSkills[typeID]?.name ?? "Unknown Skill",
      level,
      required,
      met: required === null || (level !== null && level >= required),
      proposed: proposedLevel,
      metWhenProposed: required === null || (at !== null && at >= required),
      effect,
      applies,
    };
  };

  const groups = [
    requirementGroup(
      Object.entries(jobSkills).map(([typeID, skill]) =>
        row(Number(typeID), { required: skill.level }),
      ),
    ),
    {
      id: SKILL_GROUP.BUILD_TIME,
      label: "Shortens the job",
      rows: buildTimeRows(jobSkills, jobType, row),
    },
  ];

  if (sells) {
    groups.push({
      id: SKILL_GROUP.SELLING,
      label: "Affects what selling costs",
      rows: sellingRows(saleLocation, row),
    });
  }

  return groups;
}

/**
 * Every required skill shortens the job by 1% a level, except the ones applied
 * once over the whole job — which are listed separately so a reader is not left
 * to work out why Industry is missing from a list of what makes this faster.
 *
 * @param {Object<string, {level: number}>} jobSkills - The job's required
 *   skills, keyed by type id
 * @param {number} jobType
 * @param {Function} row
 * @returns {SkillRow[]}
 */
function buildTimeRows(jobSkills, jobType, row) {
  const appliedOnce =
    jobType === jobTypes.reaction
      ? [industrySkillIDs.reaction]
      : [industrySkillIDs.industry, industrySkillIDs.advancedIndustry];

  const appliedToTheWholeJob = new Set(
    Object.values(industrySkillIDs).map(String),
  );
  const perSkill = Object.keys(jobSkills)
    .filter((typeID) => !appliedToTheWholeJob.has(typeID))
    .map((typeID) => row(Number(typeID), { effect: "1% a level" }));

  return [
    ...appliedOnce.map((typeID) =>
      row(typeID, { effect: "applied to the whole job" }),
    ),
    ...perSkill,
  ];
}

/**
 * Broker Relations is shown at a citadel rather than hidden, marked as not
 * applying there. A structure's fee is its owner's and no skill reduces it — and
 * a skill that silently disappears from a panel reads as a defect rather than as
 * an answer.
 *
 * @param {import("../MarketOrders/saleLocations").SaleLocation|null} saleLocation
 * @param {Function} row
 * @returns {SkillRow[]}
 */
function sellingRows(saleLocation, row) {
  const atStructure = saleLocation?.kind === SALE_LOCATION_KIND.CITADEL;

  return [
    row(marketSkillIDs.brokerRelations, {
      effect: atStructure
        ? "not applied here — a structure's fee is its owner's"
        : "reduces the broker fee",
      applies: !atStructure,
    }),
    row(marketSkillIDs.accounting, {
      effect: "reduces sales tax, wherever you sell",
    }),
  ];
}

/**
 * The required group, with how much of it is satisfied.
 *
 * A red row saying "2 / 4" leaves the reader to work out the consequence; the
 * count and the shortfall are what turn it into an answer.
 *
 * @param {SkillRow[]} rows
 * @returns {SkillGroup}
 */
function requirementGroup(rows) {
  const short = rows.filter((skillRow) => !skillRow.metWhenProposed);

  return {
    id: SKILL_GROUP.REQUIRED,
    label: "Required to build",
    rows,
    requirement: {
      met: rows.length - short.length,
      total: rows.length,
      short,
    },
  };
}
