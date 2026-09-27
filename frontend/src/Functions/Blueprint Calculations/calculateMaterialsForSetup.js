import { jobTypes } from "../../Context/defaultValues";
import manufacturingFormulaCalculation from "./manufacturingMaterialCalculation";
import reactionFormulaCalculation from "./reactionMaterialCalculation";
import { getStructureInfoFromID } from "../Custom Structures/getStructureInfo";
import { getRigInfoFromID, rigSlotBonuses } from "../Custom Structures/rigs";

/**
 * The material count a setup's configuration calls for, built from its job's raw
 * material list with structure, rig and system bonuses applied.
 *
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @param {Array<{typeID: number, quantity: number}>} rawMaterialQuantities
 * @returns {Object} A new material count map keyed by type id
 */
export default function materialQuantitiesForSetup(
  setupObject,
  rawMaterialQuantities,
) {
  const calculateMaterial = materialCalculationForSetup(setupObject);

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
function materialCalculationForSetup(setupObject) {
  const isManufacturing = setupObject.jobType === jobTypes.manufacturing;
  if (!isManufacturing && setupObject.jobType !== jobTypes.reaction) {
    return (rawQuantity) => rawQuantity;
  }

  const requirements = setupObject.gatherRequirements();
  const rigValue = getRigData(setupObject, requirements);
  const systemValue = getSystemData(setupObject, requirements);

  if (!isManufacturing) {
    return (rawQuantity) =>
      reactionFormulaCalculation(
        rawQuantity,
        setupObject.runCount,
        setupObject.jobCount,
        rigValue,
        systemValue,
      );
  }

  const structureValue = getStructureData(setupObject, requirements);
  return (rawQuantity) =>
    manufacturingFormulaCalculation(
      rawQuantity,
      setupObject.runCount,
      setupObject.jobCount,
      setupObject.ME,
      structureValue,
      rigValue,
      systemValue,
    );
}

/**
 * Structure material efficiency bonus, preferring a required structure over the
 * setup's own.
 *
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @param {Object} requirements
 * @returns {number} Material efficiency bonus value (0 if no structure)
 *
 * @private
 */
function getStructureData(setupObject, requirements) {
  if (Object.hasOwn(requirements, "structureID")) {
    const requiredObject = getStructureInfoFromID(
      setupObject.jobType,
      requirements.structureID,
    );
    return requiredObject?.material ?? 0;
  }
  return setupObject.getStructureObject()?.material ?? 0;
}

/**
 * Rig material efficiency bonus, preferring a required rig over the setup's own.
 *
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @param {Object} requirements
 * @returns {number} Material efficiency bonus value (0 if no rig)
 *
 * @private
 */
function getRigData(setupObject, requirements) {
  if (Object.hasOwn(requirements, "rigID")) {
    const requiredObject = getRigInfoFromID(
      setupObject.jobType,
      requirements.rigID,
    );
    return requiredObject?.material ?? 0;
  }
  return rigSlotBonuses(
    setupObject.jobType,
    setupObject.rigSlot1,
    setupObject.rigSlot2,
  ).material;
}

/**
 * System index material efficiency bonus, preferring an alternative value for
 * this system over the setup's own.
 *
 * @param {import("../../Classes/jobSetup").default} setupObject
 * @param {Object} requirements
 * @returns {number} Material efficiency bonus value (0 if no system index)
 *
 * @private
 */
function getSystemData(setupObject, requirements) {
  const systemObject = setupObject.getSystemTypeObject();

  if (Object.hasOwn(requirements, "alternativeSystemValue")) {
    return (
      requirements.alternativeSystemValue[systemObject.id] ??
      systemObject?.value ??
      0
    );
  }
  return systemObject?.value ?? 0;
}
