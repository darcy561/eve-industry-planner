/**
 * Install cost calculations — single module for setup formulas, job totals, and recalculation.
 */

import Setup from "../../Classes/jobSetup";
import findSystemIndexForJob from "../Helper/findSystemIndexValue";
import {
  structureTypeMap,
  jobTypes,
  SCC_SURCHARGE,
  ALPHA_CLONE_TAX,
} from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Calculates the install cost for a single setup (per job slot, before × jobCount).
 *
 * @param {Setup} setup
 * @param {Object} [additionalMaterialPrices]
 * @param {Object} [additionalSystemIndexValues]
 * @returns {number}
 */
export function calculateInstallCostfromSetup(
  setup,
  additionalMaterialPrices = {},
  additionalSystemIndexValues = {}
) {
  if (!(setup instanceof Setup)) return 0;

  const estimatedItemValue = estimatedItemPriceCalc(
    setup.materialCount,
    setup.jobCount,
    additionalMaterialPrices
  );

  const facilityModifier = findFacilityModifier(
    setup.structureID,
    setup.jobType
  );

  const facilityTax = findFacilityTax(
    setup.customStructureID,
    setup.structureID,
    setup.jobType,
    setup.taxValue
  );

  const systemIndexValue = findSystemIndexForJob(
    setup.systemID,
    setup.jobType,
    setup.useAlternativeSystemIndexValue,
    setup.alternativeSystemIndexValue,
    additionalSystemIndexValues
  );

  const cloneValue = findCloneValue(setup.selectedCharacter);

  const taxModifierTotal =
    estimatedItemValue *
    (systemIndexValue * facilityModifier +
      facilityTax +
      SCC_SURCHARGE +
      cloneValue);

  const systemIndexDeduction = Math.ceil(
    systemIndexValue * estimatedItemValue
  );

  const facilityBonusDeduction = Math.ceil(
    facilityModifier * systemIndexDeduction
  );

  const jobGrossCost = systemIndexDeduction - facilityBonusDeduction;

  return jobGrossCost + taxModifierTotal;
}

/**
 * Sum of `estimatedInstallCost × jobCount` across all setups on a job.
 *
 * @param {Record<string, { estimatedInstallCost?: number, jobCount?: number }> | null | undefined} setups
 * @returns {number}
 */
export function sumSetupEstimatedInstallCosts(setups) {
  if (!setups) return 0;

  return Object.values(setups).reduce((sum, setup) => {
    const perJob = Number(setup?.estimatedInstallCost) || 0;
    const slots = Number(setup?.jobCount) || 1;
    return sum + perJob * slots;
  }, 0);
}

/**
 * Whether this job has authoritative actual install costs (ESI-linked or stored total).
 *
 * @param {{ build?: { costs?: { installCosts?: number, linkedJobs?: unknown[] } } }} job
 * @returns {boolean}
 */
export function hasAuthoritativeActualInstallCost(job) {
  if (!job?.build?.costs) return false;

  const { installCosts, linkedJobs } = job.build.costs;
  if (Array.isArray(linkedJobs) && linkedJobs.length > 0) {
    return true;
  }
  const persisted = Number(installCosts);
  return Number.isFinite(persisted) && persisted > 0;
}

/**
 * Actual install cost from ESI linking (`build.costs.installCosts`). No setup estimates.
 *
 * @param {{ build?: { costs?: { installCosts?: number, linkedJobs?: unknown[] } } }} job
 * @returns {number}
 */
export function getJobActualInstallCost(job) {
  if (!hasAuthoritativeActualInstallCost(job)) return 0;

  const persisted = Number(job.build.costs.installCosts);
  return Math.max(0, Number.isFinite(persisted) ? persisted : 0);
}

/**
 * Edit job / planning rollups: actual install when set, otherwise setup estimates.
 *
 * @param {{ build?: { setup?: object, costs?: { installCosts?: number, linkedJobs?: unknown[] } } }} job
 * @returns {number}
 */
export function getJobInstallCostForPlanning(job) {
  if (!job?.build?.costs) return 0;

  if (hasAuthoritativeActualInstallCost(job)) {
    return getJobActualInstallCost(job);
  }

  return sumSetupEstimatedInstallCosts(job.build.setup);
}

/** @deprecated Use {@link getJobInstallCostForPlanning} */
export const getJobInstallCostForBuildPricing = getJobInstallCostForPlanning;

/**
 * Refreshes `setup.estimatedInstallCost` on jobs when market or system index data updates.
 *
 * @param {Array|Object} inputJobs
 * @param {Object} newMarketData
 * @param {Object} newSystemIndexData
 */
export function recalculateInstallCostsWithNewData(
  inputJobs,
  newMarketData,
  newSystemIndexData
) {
  const jobsArray = Array.isArray(inputJobs) ? inputJobs : [inputJobs];
  if (
    (!newMarketData || Object.keys(newMarketData).length === 0) &&
    (!newSystemIndexData || Object.keys(newSystemIndexData).length === 0)
  ) {
    return;
  }
  jobsArray.forEach((job) => {
    Object.values(job.build.setup).forEach((setup) => {
      setup.estimatedInstallCost = calculateInstallCostfromSetup(
        setup,
        newMarketData,
        newSystemIndexData
      );
    });
  });
}

function estimatedItemPriceCalc(materialArray, jobCount, additionalMaterialPrices) {
  if (!materialArray || typeof materialArray !== "object") {
    return 0;
  }

  return Math.ceil(
    Object.values(materialArray).reduce((preValue, material) => {
      return (preValue += estimatedMaterialPriceCalc(
        material.quantity / jobCount,
        material.typeID,
        additionalMaterialPrices
      ));
    }, 0)
  );
}

function estimatedMaterialPriceCalc(
  materialQuantity,
  materialTypeID,
  additionalMaterialPrices
) {
  const adjustedPrice = useUsersStore
    .getState()
    .worldData.actions.findMarketData(
      materialTypeID,
      additionalMaterialPrices
    )?.adjustedPrice;

  return materialQuantity * adjustedPrice;
}

function findFacilityModifier(structureID, jobType) {
  return structureTypeMap[jobType][structureID]?.cost || 0;
}

function findFacilityTax(facilityID, structureType, jobType, taxValue) {
  if (
    jobType === jobTypes.manufacturing &&
    structureType === structureTypeMap[jobTypes.manufacturing].id
  ) {
    return structureTypeMap[jobTypes.manufacturing].defaultTax / 100;
  }

  if (facilityID === "") return taxValue / 100;

  if (!useUsersStore.getState().account.actions.getMainCharacter()) return 0;

  const customStructureTax =
    useUsersStore
      .getState()
      .applicationSettings.actions.getCustomStructureWithID(facilityID)?.tax;

  if (customStructureTax == null) return taxValue / 100;

  return customStructureTax / 100;
}

function findCloneValue(inputCharacterHash) {
  const matchedCharacter = useUsersStore
    .getState()
    .account.actions.findCharacterByHash(inputCharacterHash);

  return matchedCharacter?.isOmega ? 0 : ALPHA_CLONE_TAX / 100;
}

export default calculateInstallCostfromSetup;
