import { getStructureInfoFromID, getRigInfoFromID } from "../Helper/getStructureInfo";
import { jobTypes } from "../../Context/defaultValues";

/**
 * Calculates the time modifier value for a manufacturing job setup based on the user's skills, structure, and rig.
 * 
 * @param {number} timeEfficiencyValue - The time efficiency value of the job setup
 * @param {number} structureID - The ID of the structure to be used for the job setup
 * @param {number} rigID - The ID of the rig to be used for the job setup
 * @param {Object} usersSkills - Skills object containing the user's skills
 * @returns {number} The time modifier value for the job setup
 */

export default function manufacturingTimeModifierCalculation(
    timeEfficiencyValue,
    structureID,
    rigID,
    usersSkills) {
    if (timeEfficiencyValue == null || structureID == null || rigID == null || usersSkills == null) return 0;


    const industrySkill = usersSkills[3380]?.activeLevel ?? 0;
    const advIndustrySkill = usersSkills[3388]?.activeLevel ?? 0;
    const structureData = getStructureInfoFromID(jobTypes.manufacturing, structureID)?.time || 0;
    const rigData = getRigInfoFromID(jobTypes.manufacturing, rigID)?.time || 0;

    const teIndexer = Math.max(1 - 0.01 * timeEfficiencyValue * 2, 0.8);
    const industryIndexer = Math.max(1 - 0.04 * industrySkill, 0.8);
    const advIndustryIndexer = Math.max(1 - 0.03 * advIndustrySkill, 0.85);
    const structureIndexer = 1 - structureData;
    const rigIndexer = 1 - rigData;

    return teIndexer * industryIndexer * advIndustryIndexer * structureIndexer * rigIndexer;
}