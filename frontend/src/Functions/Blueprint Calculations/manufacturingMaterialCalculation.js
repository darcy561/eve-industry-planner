/**
 * The total material quantity a manufacturing job needs, from the base quantity and
 * the blueprint, structure and rig modifiers.
 * @param {number} materialBaseQuantity - Base quantity of material per run
 * @param {number} numberOfRuns - Number of manufacturing runs
 * @param {number} numberOfJobSlots - Number of job slots
 * @param {number} blueprintMEValue - Blueprint Material Efficiency value (%)
 * @param {number} structureModifierValue - Structure modifier value (%)
 * @param {number} rigModifierValue - Rig modifier value (%), already scaled to the band
 * @returns {number} Total material quantity needed (minimum 1)
 */
export default function manufacturingFormulaCalculation(
  materialBaseQuantity,
  numberOfRuns,
  numberOfJobSlots,
  blueprintMEValue,
  structureModifierValue,
  rigModifierValue,
) {
  const blueprintModifier = 1 - blueprintMEValue / 100;
  const structureModifier = 1 - structureModifierValue / 100;
  const rigModifier = 1 - rigModifierValue / 100;

  const totalEfficiencyModifier =
    blueprintModifier * structureModifier * rigModifier;

  const materialsPerRun =
    materialBaseQuantity === 1
      ? materialBaseQuantity
      : materialBaseQuantity * totalEfficiencyModifier;

  const totalMaterials = numberOfRuns * materialsPerRun;
  const materialsPerSlot = Math.ceil(totalMaterials);

  return Math.max(materialsPerSlot * numberOfJobSlots, 1);
}
