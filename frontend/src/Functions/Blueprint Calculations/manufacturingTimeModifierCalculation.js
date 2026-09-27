import { getStructureInfoFromID } from "../Custom Structures/getStructureInfo";
import { industrySkillIDs, jobTypes } from "../../Context/defaultValues";

/**
 * Calculates the time modifier value for a manufacturing job setup based on the user's skills, structure, and rig.
 *
 * @param {number} timeEfficiencyValue - The time efficiency value of the job setup
 * @param {number} structureID - The ID of the structure to be used for the job setup
 * @param {number} rigTimeBonus - The time bonus the setup's fitted rigs give
 * @param {Object} usersSkills - Skills object containing the user's skills
 * @returns {number} The time modifier value for the job setup
 */

export default function manufacturingTimeModifierCalculation(
  timeEfficiencyValue,
  structureID,
  rigTimeBonus,
  usersSkills,
) {
  if (
    timeEfficiencyValue == null ||
    structureID == null ||
    rigTimeBonus == null ||
    usersSkills == null
  )
    return 0;

  const industrySkill =
    usersSkills[industrySkillIDs.industry]?.activeLevel ?? 0;
  const advIndustrySkill =
    usersSkills[industrySkillIDs.advancedIndustry]?.activeLevel ?? 0;
  const structureData =
    getStructureInfoFromID(jobTypes.manufacturing, structureID)?.time || 0;
  const rigData = rigTimeBonus || 0;

  const teIndexer = Math.max(1 - 0.01 * timeEfficiencyValue * 2, 0.8);
  const industryIndexer = Math.max(1 - 0.04 * industrySkill, 0.8);
  const advIndustryIndexer = Math.max(1 - 0.03 * advIndustrySkill, 0.85);
  const structureIndexer = 1 - structureData;
  const rigIndexer = 1 - rigData;

  return (
    teIndexer *
    industryIndexer *
    advIndustryIndexer *
    structureIndexer *
    rigIndexer
  );
}
