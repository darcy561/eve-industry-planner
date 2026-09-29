import { industrySkillIDs, jobTypes } from "../../Context/defaultValues";
import manufacturingTimeModifierCalculation from "./manufacturingTimeModifierCalculation";
import reactionTimeModifierCalculation from "./reactionTimeModifierCalculation";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { quotedCharacterHash } from "../Skills/quotedCharacter";
import { rigSlotBonuses } from "../Industry Facilities/rigs";

/**
 * How long this setup takes the account reading it.
 *
 * Takes the setup as it is stored as readily as an instance of the class built
 * over it: every figure it reads is a field of the row, and the job being edited
 * holds plain rows.
 *
 * @param {object} setupObject - The job setup, stored or as a class
 * @param {Object<string, {typeID: number, level: number}>} jobSkillRequirements -
 *   The job's required skills, keyed by type id - The job skill requirements
 * @param {QueryClient} queryClient - The react query client
 * @param {number} [itemID] - What the job builds, which a scoped bonus is read against
 * @returns {number} The time for the job setup
 */

export default function calculateTimeForSetup(
  setupObject,
  jobSkillRequirements,
  queryClient,
  itemID,
) {
  // The raw time is the figure everything below multiplies, so a setup without
  // one has no time to state. A data check rather than a type check: the job
  // being edited holds stored rows, and a class gate here reads as a job that
  // takes no time at all.
  if (!setupObject?.rawTime || !jobSkillRequirements || !queryClient) return;

  const usersSkills =
    getCachedCharacterSkills(queryClient, quotedCharacterHash(setupObject))
      ?.data || {};

  return timeForSetup(setupObject, jobSkillRequirements, usersSkills, itemID);
}

/**
 * The same calculation over skill levels handed in rather than read from cache.
 *
 * Split out so a level can be asked about without being trained: the Skills
 * panel's what-if needs the time at a level the character does not have, and a
 * function that fetches its own skills can only ever answer for the real ones.
 *
 * @param {object} setupObject
 * @param {Object<string, {typeID: number, level: number}>} jobSkillRequirements -
 *   The job's required skills, keyed by type id
 * @param {Object} usersSkills - Keyed by skill type id, `{ id, activeLevel }`
 * @param {number} [itemID] - What the job builds, which a scoped bonus is read against
 * @returns {number} Seconds
 */
export function timeForSetup(
  setupObject,
  jobSkillRequirements,
  usersSkills = {},
  itemID,
) {
  const timeModifier = timeModifierCalc(setupObject, usersSkills);
  const skillModifier = skillModifierCalc(jobSkillRequirements, usersSkills);

  return Math.floor(
    setupObject.rawTime * timeModifier * skillModifier * setupObject.runCount,
  );

  function timeModifierCalc(setupObject, usersSkills) {
    const rigTime = rigSlotBonuses(
      setupObject.jobType,
      setupObject.rigSlot1,
      setupObject.rigSlot2,
      setupObject.systemTypeID,
      itemID,
    ).time;

    switch (setupObject.jobType) {
      case jobTypes.manufacturing:
        return manufacturingTimeModifierCalculation(
          setupObject.TE,
          setupObject.structureID,
          rigTime,
          usersSkills,
        );
      case jobTypes.reaction:
        return reactionTimeModifierCalculation(
          setupObject.structureID,
          rigTime,
          usersSkills,
        );
    }
  }

  function skillModifierCalc(jobSkillRequirements, usersSkills) {
    if (!jobSkillRequirements || !usersSkills) return 1;
    const skillsToIgnore = new Set(Object.values(industrySkillIDs));

    let indexer = 1;
    for (const typeID of Object.keys(jobSkillRequirements)) {
      let { id, activeLevel } = usersSkills[typeID] || {};
      if (id && activeLevel && !skillsToIgnore.has(id)) {
        indexer *= 1 - 0.01 * activeLevel;
      }
    }
    return indexer;
  }
}
