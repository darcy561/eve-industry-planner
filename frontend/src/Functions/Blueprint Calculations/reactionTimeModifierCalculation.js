import { getStructureInfoFromID, getRigInfoFromID } from "../Helper/getStructureInfo";
import { jobTypes } from "../../Context/defaultValues";
/**
 * Calculates the time modifier value for a reaction job setup based on the user's skills, structure, and rig.
 * 
 * @param {number} structureID - The ID of the structure to be used for the job setup
 * @param {number} rigID - The ID of the rig to be used for the job setup
 * @param {Object} usersSkills - Skills object containing the user's skills
 * @returns {number} The time modifier value for the job setup
 */

export default function reactionTimeModifierCalculation(
    structureID,
    rigID,
    usersSkills) {
    if (structureID == null || rigID == null || usersSkills == null) return 0;

    const reactionSkill = usersSkills[45746]?.activeLevel ?? 0;
    const structureData = getStructureInfoFromID(jobTypes.reaction, structureID)?.time || 0;
    const rigData = getRigInfoFromID(jobTypes.reaction, rigID)?.time || 0;

    const reactionSkillIndexer = Math.max(1 - 0.04 * reactionSkill, 0.8);
    const structureIndexer = 1 - structureData;
    const rigIndexer = 1 - rigData;

    return reactionSkillIndexer * structureIndexer * rigIndexer;
}