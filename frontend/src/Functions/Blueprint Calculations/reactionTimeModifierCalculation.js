import { getStructureInfoFromID } from "../Industry Facilities/getStructureInfo";
import { industrySkillIDs, jobTypes } from "../../Context/defaultValues";
/**
 * Calculates the time modifier value for a reaction job setup based on the user's skills, structure, and rig.
 *
 * @param {number} structureID - The ID of the structure to be used for the job setup
 * @param {number} rigTimeBonus - The time bonus the setup's fitted rigs give
 * @param {Object} usersSkills - Skills object containing the user's skills
 * @returns {number} The time modifier value for the job setup
 */

export default function reactionTimeModifierCalculation(
  structureID,
  rigTimeBonus,
  usersSkills,
) {
  if (structureID == null || rigTimeBonus == null || usersSkills == null)
    return 0;

  const reactionSkill =
    usersSkills[industrySkillIDs.reaction]?.activeLevel ?? 0;
  const structureData =
    getStructureInfoFromID(jobTypes.reaction, structureID)?.time || 0;
  const rigData = rigTimeBonus || 0;

  const reactionSkillIndexer = Math.max(1 - 0.04 * reactionSkill, 0.8);
  const structureIndexer = 1 - structureData;
  const rigIndexer = 1 - rigData;

  return reactionSkillIndexer * structureIndexer * rigIndexer;
}
