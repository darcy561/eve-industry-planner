import Setup from "../../Classes/jobSetupConstructor";
import { jobTypes } from "../../Context/defaultValues";
import manufacturingTimeModifierCalculation from "./manufacturingTimeModifierCalculation";
import reactionTimeModifierCalculation from "./reactionTimeModifierCalculation";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";

/**
 * Calculates the time for a job setup based on the user's skills, structure, and rig.
 * 
 * @param {Setup} setupObject - The job setup object
 * @param {Array} jobSkillRequirements - The job skill requirements
 * @param {QueryClient} queryClient - The react query client
 * @returns {number} The time for the job setup
 */

export default function calculateTimeForSetup(setupObject, jobSkillRequirements, queryClient) {
    if (!(setupObject instanceof Setup) || !jobSkillRequirements || !queryClient) return;

    const usersSkills = getCachedCharacterSkills(queryClient, setupObject.selectedCharacter)?.data || {};

    const timeModifier = timeModifierCalc(setupObject, usersSkills);
    const skillModifier = skillModifierCalc(jobSkillRequirements, usersSkills);

    return Math.floor(
        setupObject.rawTime * timeModifier * skillModifier * setupObject.runCount
    );

    function timeModifierCalc(setupObject, usersSkills) {
        switch (setupObject.jobType) {
            case jobTypes.manufacturing:
                return manufacturingTimeModifierCalculation(setupObject.TE, setupObject.structureID, setupObject.rigID, usersSkills);
            case jobTypes.reaction:
                return reactionTimeModifierCalculation(setupObject.structureID, setupObject.rigID, usersSkills);
        }
    }

    function skillModifierCalc(jobSkillRequirements, usersSkills) {
        if (!jobSkillRequirements || !usersSkills) return 1;
        const skillsToIgnore = new Set([3380, 3388, 45746, 22242]);

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