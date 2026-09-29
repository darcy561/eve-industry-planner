import { jobTypes } from "../../Context/defaultValues";
import manufacturingFormulaCalculation from "./manufacturingMaterialCalculation";
import reactionFormulaCalculation from "./reactionMaterialCalculation";
import { getStructureInfoFromID } from "../Industry Facilities/getStructureInfo";
import { rigSlotBonuses } from "../Industry Facilities/rigs";
import { structureBonusForItem } from "../Industry Facilities/structureBonusForItem";
import { settledFieldFor } from "../Industry Facilities/placeConstraints";

/**
 * The material count a setup's configuration calls for, built from its job's raw
 * material list with structure, rig and system bonuses applied.
 *
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @param {Array<{typeID: number, quantity: number}>} rawMaterialQuantities
 * @param {number} [itemID] - What the job builds, which a scoped bonus is read against
 * @returns {Object} A new material count map keyed by type id
 */
export default function materialQuantitiesForSetup(
  setupObject,
  rawMaterialQuantities,
  itemID,
) {
  const calculateMaterial = materialCalculationForSetup(setupObject, itemID);

  return Object.fromEntries(
    rawMaterialQuantities.map((material) => [
      material.typeID,
      {
        typeID: material.typeID,
        rawQuantity: material.quantity,
        quantity: calculateMaterial(material.quantity),
      },
    ]),
  );
}

/**
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @returns {(rawQuantity: number) => number}
 *
 * @private
 */
function materialCalculationForSetup(setupObject, itemID) {
  const isManufacturing = setupObject.jobType === jobTypes.manufacturing;
  if (!isManufacturing && setupObject.jobType !== jobTypes.reaction) {
    return (rawQuantity) => rawQuantity;
  }

  const rigValue = getRigData(setupObject, itemID);

  if (!isManufacturing) {
    return (rawQuantity) =>
      reactionFormulaCalculation(
        rawQuantity,
        setupObject.runCount,
        setupObject.jobCount,
        rigValue,
      );
  }

  const structureValue = getStructureData(setupObject, itemID);
  return (rawQuantity) =>
    manufacturingFormulaCalculation(
      rawQuantity,
      setupObject.runCount,
      setupObject.jobCount,
      setupObject.ME,
      structureValue,
      rigValue,
    );
}

/**
 * Structure material efficiency bonus, from the structure the place fixes where it
 * fixes one.
 *
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @param {number} [itemID] - What the job builds
 * @returns {number} Material efficiency bonus value (0 if no structure)
 *
 * @private
 */
function getStructureData(setupObject, itemID) {
  const structureID = settledFieldFor(
    setupObject,
    "structureID",
    setupObject.structureID,
  );

  return structureBonusForItem(
    getStructureInfoFromID(setupObject.jobType, structureID),
    setupObject.jobType,
    "material",
    itemID,
  );
}

/**
 * Rig material efficiency bonus in the band the job runs in, from the slots the
 * place fixes where it fixes them.
 *
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @param {number} [itemID] - What the job builds
 * @returns {number} Material efficiency bonus value (0 if no rig)
 *
 * @private
 */
function getRigData(setupObject, itemID) {
  return rigSlotBonuses(
    setupObject.jobType,
    settledFieldFor(setupObject, "rigSlot1", setupObject.rigSlot1),
    settledFieldFor(setupObject, "rigSlot2", setupObject.rigSlot2),
    settledFieldFor(setupObject, "systemTypeID", setupObject.systemTypeID),
    itemID,
  ).material;
}
