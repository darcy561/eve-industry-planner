import {
  reprocessingItemTypes,
  reprocessingRigFamilies,
} from "../../Context/defaultValues";
import { getStructureInfoFromID } from "../Industry Facilities/getStructureInfo";
import {
  getRigInfoFromID,
  rigSecurityMultiplier,
} from "../Industry Facilities/rigs";
import { fieldsForKind } from "../Custom Structures/customStructure";

/**
 * The bonus a structure's rigs give one reprocessing item type.
 *
 * @param {Object} structure - The structure the job runs in
 * @param {number} [itemType] - Reprocessing item type (ore, gas, ice, moon ore)
 * @returns {number} The rig bonus, or 0 when none applies
 */
export function rigBonusFor(structure, itemType = 0) {
  return bestReprocessingRig(structure, itemType).value;
}

/**
 * The fitted rig that gives the most for one item type, and what it gives.
 *
 * @param {Object} structure - The structure the job runs in
 * @param {number} itemType - Reprocessing item type
 * @returns {{rig: Object|null, value: number}}
 * @private
 */
function bestReprocessingRig(structure, itemType) {
  if (!fieldsForKind(structure?.jobType).rigSlots)
    return { rig: null, value: 0 };

  const rigObjects = [
    getRigInfoFromID(structure.jobType, structure.rigSlot1),
    getRigInfoFromID(structure.jobType, structure.rigSlot2),
  ];
  let best = { rig: null, value: 0 };

  for (const rig of rigObjects) {
    const value = reprocessingRigValue(rig, itemType);
    if (value <= best.value) continue;
    best = { rig, value };
  }
  return best;
}

/**
 * What one rig gives an item type: a legacy rig's own figure, or a published
 * rig's yield where its group names that ore.
 *
 * @param {Object|null} rig - The fitted rig
 * @param {number} itemType - Reprocessing item type
 * @returns {number}
 * @private
 */
function reprocessingRigValue(rig, itemType) {
  if (!rig) return 0;
  if (rig.appliesTo) return rig.appliesTo.includes(itemType) ? rig.value : 0;
  if (!reprocessingRigFamilies[rig.groupID]?.includes(itemType)) return 0;

  const yieldBonus = (rig.bonuses ?? []).find(
    (bonus) => bonus.activity === "reprocessing" && bonus.axis === "value",
  );
  return yieldBonus?.value ?? 0;
}

/**
 * How much of its bonus the best-placed rig gives in the band the structure sits in.
 * 1 when no fitted rig helps this item type.
 *
 * @param {Object} structure - The structure the job runs in
 * @param {number} [itemType] - Reprocessing item type (ore, gas, ice, moon ore)
 * @returns {number}
 */
export function rigSecurityFor(structure, itemType = 0) {
  const { rig } = bestReprocessingRig(structure, itemType);
  if (!rig) return 1;

  return rigSecurityMultiplier(rig, structure.systemType, structure.jobType);
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
