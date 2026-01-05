
/**
 * Calculates the total material quantity needed from the base quantity and the modifiers for a single material in reactions.
 * @param {number} materialBaseQuantity - Base quantity of material per run
 * @param {number} numberOfRuns - Number of reaction runs
 * @param {number} numberOfJobSlots - Number of job slots
 * @param {number} rigModifierValue - Rig modifier value (%)
 * @param {number} systemModifierValue - System modifier value (%)
 * @returns {number} Total material quantity needed (minimum 1)
 */
export default function reactionFormulaCalculation(
    materialBaseQuantity,
    numberOfRuns,
    numberOfJobSlots,
    rigModifierValue,
    systemModifierValue
) {
    // Calculate the Material Efficiency modifier for reactions
    const materialEfficiencyModifier = 1 - (rigModifierValue / 100) * systemModifierValue;

    // Calculate materials per run
    // If base quantity is 1, no efficiency modifier is applied
    const materialsPerRun = materialBaseQuantity === 1
        ? materialBaseQuantity
        : materialBaseQuantity * materialEfficiencyModifier;

    // Calculate total materials needed
    const totalMaterials = numberOfRuns * materialsPerRun;
    const materialsPerSlot = Math.ceil(totalMaterials);

    // Return total materials across all job slots (minimum 1)
    return Math.max(materialsPerSlot * numberOfJobSlots, 1);
}