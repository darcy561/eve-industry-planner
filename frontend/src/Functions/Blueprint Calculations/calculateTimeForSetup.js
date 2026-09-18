import Setup from "../../Classes/jobSetup";
import { industrySkillIDs, jobTypes } from "../../Context/defaultValues";
import manufacturingTimeModifierCalculation from "./manufacturingTimeModifierCalculation";
import reactionTimeModifierCalculation from "./reactionTimeModifierCalculation";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { quotedCharacterHash } from "../Skills/quotedCharacter";

/**
 * How long this setup takes the account reading it.
 *
 * @param {Setup} setupObject - The job setup object
 * @param {Array} jobSkillRequirements - The job skill requirements
 * @param {QueryClient} queryClient - The react query client
 * @returns {number} The time for the job setup
 */

export default function calculateTimeForSetup(
  setupObject,
  jobSkillRequirements,
  queryClient,
) {
  if (!(setupObject instanceof Setup) || !jobSkillRequirements || !queryClient)
    return;

  const usersSkills =
    getCachedCharacterSkills(queryClient, quotedCharacterHash(setupObject))
      ?.data || {};

  return timeForSetup(setupObject, jobSkillRequirements, usersSkills);
}

/**
 * The same calculation over skill levels handed in rather than read from cache.
 *
 * Split out so a level can be asked about without being trained: the Skills
 * panel's what-if needs the time at a level the character does not have, and a
 * function that fetches its own skills can only ever answer for the real ones.
 *
 * @param {Setup} setupObject
 * @param {Array} jobSkillRequirements
 * @param {Object} usersSkills - Keyed by skill type id, `{ id, activeLevel }`
 * @returns {number} Seconds
 */
export function timeForSetup(
  setupObject,
  jobSkillRequirements,
  usersSkills = {},
) {
  const timeModifier = timeModifierCalc(setupObject, usersSkills);
  const skillModifier = skillModifierCalc(jobSkillRequirements, usersSkills);

  return Math.floor(
    setupObject.rawTime * timeModifier * skillModifier * setupObject.runCount,
  );

  function timeModifierCalc(setupObject, usersSkills) {
    switch (setupObject.jobType) {
      case jobTypes.manufacturing:
        return manufacturingTimeModifierCalculation(
          setupObject.TE,
          setupObject.structureID,
          setupObject.rigID,
          usersSkills,
        );
      case jobTypes.reaction:
        return reactionTimeModifierCalculation(
          setupObject.structureID,
          setupObject.rigID,
          usersSkills,
        );
    }
  }

  function skillModifierCalc(jobSkillRequirements, usersSkills) {
    if (!jobSkillRequirements || !usersSkills) return 1;
    const skillsToIgnore = new Set(Object.values(industrySkillIDs));

    let indexer = 1;
    jobSkillRequirements.forEach((skill) => {
      let { id, activeLevel } = usersSkills[skill.typeID] || {};
      if (id && activeLevel && !skillsToIgnore.has(id)) {
        indexer *= 1 - 0.01 * activeLevel;
      }
    });
    return indexer;
  }
}
