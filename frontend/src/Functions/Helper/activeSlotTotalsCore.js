/**
 * Core calculation helpers for industry slot totals.
 *
 * These functions are deliberately pure and framework-agnostic so they can be
 * used both from React hooks (e.g. `useActiveSlotTotals`) and from non-React
 * modules such as the group scheduler.
 */

const JOB_ACTIVITY_IDS = {
  manufacturing: [1],
  science: [3, 4, 5, 8],
  reaction: [9],
};

const SKILL_IDS = {
  manufacturing: [3387, 24625],
  reaction: [45748, 45749],
  science: [3406, 24624],
};

/**
 * Calculates active slot usage and total slots for a single character from
 * plain data objects.
 *
 * @param {Object} character - Character row (`Character` instance) with `CharacterHash` and `CharacterID`.
 * @param {Object} userSkills - Skills map keyed by skill ID -> { activeLevel, ... }.
 * @param {Array<Object>} characterIndustryJobs - Character industry jobs (ESI) for this character.
 * @param {Array<Object>} corporationIndustryJobs - Corporation industry jobs (ESI) relevant to this character.
 *
 * @returns {Object} Slot summary for this character.
 */
export function calculateActiveSlotsSingleFromData(
  character,
  userSkills = {},
  characterIndustryJobs = [],
  corporationIndustryJobs = []
) {
  if (!character) return null;

  const { CharacterHash, CharacterID } = character;

  const slots = {
    manufacturing: { total: 1, active: 0 },
    reaction: { total: 1, active: 0 },
    science: { total: 1, active: 0 },
  };
  let corpJobsPresent = false;

  const allJobs = [...(characterIndustryJobs || []), ...(corporationIndustryJobs || [])];

  for (let job of allJobs) {
    if (!job || job.status !== "active") continue;

    for (let [activity, ids] of Object.entries(JOB_ACTIVITY_IDS)) {
      if (ids.includes(job.activity_id)) {
        slots[activity].active++;
        if (!corpJobsPresent && job.corporation_id) {
          corpJobsPresent = true;
        }
        break;
      }
    }
  }

  for (let [activity, ids] of Object.entries(SKILL_IDS)) {
    const skillLevels = ids.map((id) => userSkills?.[id]?.activeLevel);
    const totalLevels = skillLevels
      .filter((lvl) => lvl !== undefined)
      .reduce((acc, lvl) => acc + lvl, 0);
    slots[activity].total += totalLevels;
  }

  return {
    characterHash: CharacterHash,
    activeManufacturingJobs: slots.manufacturing.active,
    manufacturingSlots: slots.manufacturing.total,
    activeReactionSlots: slots.reaction.active,
    reactionSlots: slots.reaction.total,
    activeScienceSlots: slots.science.active,
    scienceSlots: slots.science.total,
    corpJobsPresent: corpJobsPresent,
  };
}

/**
 * Convenience helper to calculate slot totals for multiple characters when you
 * already have per-character skill and job data available.
 *
 * @param {Array<Object>} characters - Character rows (`Character` instances).
 * @param {Object} skillsByCharacterHash - Map CharacterHash -> skills map.
 * @param {Object} charJobsByCharacterHash - Map CharacterHash -> array of character industry jobs.
 * @param {Object} corpJobsByCharacterHash - Map CharacterHash -> array of corporation industry jobs for that character.
 *
 * @returns {Array<Object>} Slot summaries in the same order as `characters`.
 */
export function calculateActiveSlotsMultipleFromData(
  characters = [],
  skillsByCharacterHash = {},
  charJobsByCharacterHash = {},
  corpJobsByCharacterHash = {}
) {
  if (!Array.isArray(characters) || characters.length === 0) return [];

  return characters.map((character) => {
    const { CharacterHash } = character || {};
    const userSkills = skillsByCharacterHash?.[CharacterHash] || {};
    const charJobs = charJobsByCharacterHash?.[CharacterHash] || [];
    const corpJobs = corpJobsByCharacterHash?.[CharacterHash] || [];

    return calculateActiveSlotsSingleFromData(
      character,
      userSkills,
      charJobs,
      corpJobs
    );
  });
}

