/**
 * The total material quantity a reaction job needs, from the base quantity and the
 * rig modifier.
 * @param {number} materialBaseQuantity - Base quantity of material per run
 * @param {number} numberOfRuns - Number of reaction runs
 * @param {number} numberOfJobSlots - Number of job slots
 * @param {number} rigModifierValue - Rig modifier value (%), already scaled to the band
 * @returns {number} Total material quantity needed (minimum 1)
 */
export default function reactionFormulaCalculation(
  materialBaseQuantity,
  numberOfRuns,
  numberOfJobSlots,
  rigModifierValue,
) {
  const materialEfficiencyModifier = 1 - rigModifierValue / 100;

  const materialsPerRun =
    materialBaseQuantity === 1
      ? materialBaseQuantity
      : materialBaseQuantity * materialEfficiencyModifier;

  const totalMaterials = numberOfRuns * materialsPerRun;
  const materialsPerSlot = Math.ceil(totalMaterials);

  return Math.max(materialsPerSlot * numberOfJobSlots, 1);
}
