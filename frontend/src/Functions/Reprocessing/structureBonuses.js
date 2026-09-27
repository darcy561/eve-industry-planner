import { reprocessingItemTypes } from "../../Context/defaultValues";
import {
  getRigInfoFromID,
  getStructureInfoFromID,
} from "../Custom Structures/getStructureInfo";
import { fieldsForKind } from "../Custom Structures/customStructure";

/**
 * The bonus a structure's rigs give one reprocessing item type.
 *
 * @param {Object} structure - The structure the job runs in
 * @param {number} [itemType] - Reprocessing item type (ore, gas, ice, moon ore)
 * @returns {number} The rig bonus, or 0 when none applies
 */
export function rigBonusFor(structure, itemType = 0) {
  if (!fieldsForKind(structure?.jobType).rigSlots) return 0;

  const rigObjects = [
    getRigInfoFromID(structure.jobType, structure.rigSlot1),
    getRigInfoFromID(structure.jobType, structure.rigSlot2),
  ];
  let maxValue = 0;

  for (const rig of rigObjects) {
    if (rig && rig.appliesTo?.includes(itemType)) {
      maxValue = Math.max(rig.value, maxValue);
    }
  }
  return maxValue;
}

/**
 * The bonus the structure itself gives one reprocessing item type.
 *
 * @param {Object} structure - The structure the job runs in
 * @param {number} [itemType] - Reprocessing item type (ore, gas, ice, moon ore)
 * @returns {number} The structure bonus, or 0 when it gives none
 */
export function structureBonusFor(structure, itemType = 0) {
  const structureObject = getStructureInfoFromID(
    structure?.jobType,
    structure?.structureType,
  );
  if (!structureObject) return 0;

  if (
    itemType === reprocessingItemTypes.ore ||
    itemType === reprocessingItemTypes.moonOre ||
    itemType === reprocessingItemTypes.ice
  ) {
    return structureObject.ore ?? 0;
  }
  if (itemType === reprocessingItemTypes.gas) {
    return structureObject.gas ?? 0;
  }
  return 0;
}
