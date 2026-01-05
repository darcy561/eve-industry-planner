
/**
 * Calculates the total material quantity needed from the base quantity and the modifiers for a single material.
 * @param {number} materialBaseQuantity - Base quantity of material per run
 * @param {number} numberOfRuns - Number of manufacturing runs
 * @param {number} numberOfJobSlots - Number of job slots
 * @param {number} blueprintMEValue - Blueprint Material Efficiency value (%)
 * @param {number} structureModifierValue - Structure modifier value (%)
 * @param {number} rigModifierValue - Rig modifier value (%)
 * @param {number} systemModifierValue - System modifier value (%)
 * @returns {number} Total material quantity needed (minimum 1)
 */
export default function manufacturingFormulaCalculation(
    materialBaseQuantity,
    numberOfRuns,
    numberOfJobSlots,
    blueprintMEValue,
    structureModifierValue,
    rigModifierValue,
    systemModifierValue
) {
    // Calculate the combined Material Efficiency modifier
    const blueprintModifier = 1 - blueprintMEValue / 100;
    const structureModifier = 1 - structureModifierValue / 100;
    const rigSystemModifier = 1 - (rigModifierValue / 100) * systemModifierValue;

    const totalEfficiencyModifier = blueprintModifier * structureModifier * rigSystemModifier;

    // Calculate materials per run
    // If base quantity is 1, no efficiency modifier is applied
    const materialsPerRun = materialBaseQuantity === 1
        ? materialBaseQuantity
        : materialBaseQuantity * totalEfficiencyModifier;

    // Calculate total materials needed
    const totalMaterials = numberOfRuns * materialsPerRun;
    const materialsPerSlot = Math.ceil(totalMaterials);

    // Return total materials across all job slots (minimum 1)
    return Math.max(materialsPerSlot * numberOfJobSlots, 1);
}
