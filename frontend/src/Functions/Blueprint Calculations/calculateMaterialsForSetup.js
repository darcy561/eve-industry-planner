import Setup from "../../Classes/jobSetup";
import { jobTypes } from "../../Context/defaultValues";
import manufacturingFormulaCalculation from "./manufacturingMaterialCalculation";
import reactionFormulaCalculation from "./reactionMaterialCalculation";
import { getStructureInfoFromID, getRigInfoFromID } from "../Helper/getStructureInfo";

/**
 * Calculates material requirements for a job setup based on the setup configuration.
 * This function determines the appropriate calculation method based on job type and
 * applies material efficiency bonuses from structures, rigs, and system indexes.
 * 
 * @param {Setup} setupObject - The job setup object containing all configuration data
 * @returns {Object|undefined} Material count object with calculated quantities, or undefined if invalid setup
 * 
 * @example
 * const setup = new Setup({
 *   jobType: 'manufacturing',
 *   runCount: 10,
 *   jobCount: 5,
 *   ME: 10,
 *   materialCount: { material1: { rawQuantity: 100 } }
 * });
 * const materials = calculateMaterialsFromSetup(setup);
 */
export default function calculateMaterialsFromSetup(setupObject) {
    if (!(setupObject instanceof Setup)) return;

    const requirements = setupObject.gatherRequirements();

    switch (setupObject.jobType) {
        case jobTypes.manufacturing:
            return calculateManufacturingMaterials(setupObject, requirements);
        case jobTypes.reaction:
            return calculateReactionMaterials(setupObject, requirements);
    }
}

/**
 * Calculates material requirements for manufacturing jobs.
 * Applies material efficiency bonuses from structures, rigs, and system indexes.
 * 
 * @param {Setup} setupObject - The job setup object
 * @param {Object} requirements - Requirements gathered from the setup object
 * @returns {Object} Updated material count object with calculated quantities
 * 
 * @private
 */
function calculateManufacturingMaterials(setupObject, requirements) {
    const structureValue = getStructureData(setupObject, requirements);
    const rigValue = getRigData(setupObject, requirements);
    const systemValue = getSystemData(setupObject, requirements);

    return updateMaterialQuantities(setupObject.materialCount, (rawQuantity) =>
        manufacturingFormulaCalculation(
            rawQuantity,
            setupObject.runCount,
            setupObject.jobCount,
            setupObject.ME,
            structureValue,
            rigValue,
            systemValue
        )
    );
}

/**
 * Calculates material requirements for reaction jobs.
 * Applies material efficiency bonuses from rigs and system indexes.
 * Note: Reactions do not use structure bonuses.
 * 
 * @param {Setup} setupObject - The job setup object
 * @param {Object} requirements - Requirements gathered from the setup object
 * @returns {Object} Updated material count object with calculated quantities
 * 
 * @private
 */
function calculateReactionMaterials(setupObject, requirements) {
    const rigValue = getRigData(setupObject, requirements);
    const systemValue = getSystemData(setupObject, requirements);

    return updateMaterialQuantities(setupObject.materialCount, (rawQuantity) =>
        reactionFormulaCalculation(
            rawQuantity,
            setupObject.runCount,
            setupObject.jobCount,
            rigValue,
            systemValue
        )
    );
}

/**
 * Updates material quantities by applying calculation function to each material's raw quantity.
 * 
 * @param {Object} materialCount - Object containing material data with rawQuantity properties
 * @param {Function} calculateMaterial - Function to calculate final quantity from raw quantity
 * @returns {Object} Updated material count object with calculated quantities
 * 
 * @private
 */
function updateMaterialQuantities(materialCount, calculateMaterial) {
    Object.values({ ...materialCount }).forEach((material) => {
        material.quantity = calculateMaterial(material.rawQuantity);
    });
    return materialCount;
}

/**
 * Retrieves structure material efficiency bonus value.
 * Checks requirements for specific structure ID, otherwise uses setup's structure.
 * 
 * @param {Setup} setupObject - The job setup object
 * @param {Object} requirements - Requirements object that may contain structureID
 * @returns {number} Material efficiency bonus value (0 if no structure)
 * 
 * @private
 */
function getStructureData(setupObject, requirements) {
    const structureObject = setupObject.getStructureObject();

    if (Object.hasOwn(requirements, "structureID")) {
        const requiredObject = getStructureInfoFromID(
            setupObject.jobType,
            requirements.structureID
        );
        return requiredObject?.material ?? 0;
    }
    return structureObject?.material ?? 0;
}

/**
 * Retrieves rig material efficiency bonus value.
 * Checks requirements for specific rig ID, otherwise uses setup's rig.
 * 
 * @param {Setup} setupObject - The job setup object
 * @param {Object} requirements - Requirements object that may contain rigID
 * @returns {number} Material efficiency bonus value (0 if no rig)
 * 
 * @private
 */
function getRigData(setupObject, requirements) {
    const rigObject = setupObject.getRigObject();

    if (Object.hasOwn(requirements, "rigID")) {
        const requiredObject = getRigInfoFromID(
            setupObject.jobType,
            requirements.rigID
        );
        return requiredObject?.material ?? 0;
    }
    return rigObject?.material ?? 0;
}

/**
 * Retrieves system index material efficiency bonus value.
 * Checks requirements for alternative system values, otherwise uses setup's system.
 * 
 * @param {Setup} setupObject - The job setup object
 * @param {Object} requirements - Requirements object that may contain alternativeSystemValue
 * @returns {number} Material efficiency bonus value (0 if no system index)
 * 
 * @private
 */
function getSystemData(setupObject, requirements) {
    const systemObject = setupObject.getSystemTypeObject();

    if (Object.hasOwn(requirements, "alternativeSystemValue")) {
        return requirements.alternativeSystemValue[systemObject.id] ?? systemObject?.value ?? 0;
    }
    return systemObject?.value ?? 0;
}