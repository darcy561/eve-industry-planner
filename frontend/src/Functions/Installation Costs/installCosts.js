/**
 * Install cost estimates — the setup formula and the sum of those estimates
 * across a job's setups.
 *
 * What a job's installs actually cost is Job.totalInstallCost: the ESI jobs
 * linked to it. Only getJobInstallCostForPlanning mixes the two, and only to
 * stand in with estimates before anything is linked.
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
import { getAdjustedPriceForType } from "../MarketData/marketPriceForType";
import { quotedCharacterHash } from "../Skills/quotedCharacter";

/**
 * Calculates the install cost for a single setup (per job slot, before × jobCount).
 *
 * @param {Setup} setup
 * @param {Object} [additionalSystemIndexValues]
 * @returns {number}
 */
export function calculateInstallCostfromSetup(
  setup,
  additionalSystemIndexValues = {},
) {
  if (!(setup instanceof Setup)) return 0;

  const estimatedItemValue = estimatedItemPriceCalc(
    setup.materialCount,
    setup.jobCount,
  );

  const facilityModifier = findFacilityModifier(
    setup.structureID,
    setup.jobType,
  );

  const facilityTax = findFacilityTax(
    setup.customStructureID,
    setup.structureID,
    setup.jobType,
    setup.taxValue,
  );

  const systemIndexValue = findSystemIndexForJob(
    setup.systemID,
    setup.jobType,
    setup.useAlternativeSystemIndexValue,
    setup.alternativeSystemIndexValue,
    additionalSystemIndexValues,
  );

  const cloneValue = findCloneValue(quotedCharacterHash(setup));

  const taxModifierTotal =
    estimatedItemValue *
    (systemIndexValue * facilityModifier +
      facilityTax +
      SCC_SURCHARGE +
      cloneValue);

  const systemIndexDeduction = Math.ceil(systemIndexValue * estimatedItemValue);

  const facilityBonusDeduction = Math.ceil(
    facilityModifier * systemIndexDeduction,
  );

  const jobGrossCost = systemIndexDeduction - facilityBonusDeduction;

  return jobGrossCost + taxModifierTotal;
}

/**
 * What installing every setup on a job would cost, across all of its job slots.
 *
 * @param {Record<string, Setup> | null | undefined} setups
 * @returns {number}
 */
export function sumSetupInstallCostEstimates(setups) {
  if (!setups) return 0;

  return Object.values(setups).reduce((sum, setup) => {
    const slots = Number(setup?.jobCount) || 1;
    return sum + calculateInstallCostfromSetup(setup) * slots;
  }, 0);
}

/**
 * Edit job / planning rollups: what the linked ESI jobs cost once any are
 * linked, and the setup estimates until they are.
 *
 * A linked job that has not reported a cost yet is still linked, so the
 * estimates do not come back once the build has started.
 *
 * @param {Job} job
 * @returns {number}
 */
export function getJobInstallCostForPlanning(job) {
  if (!job?.build) return 0;

  const linkedJobs = job.build.costs?.linkedJobs;
  if (Array.isArray(linkedJobs) && linkedJobs.length > 0) {
    return job.totalInstallCost;
  }

  return sumSetupInstallCostEstimates(job.build.setup);
}

function estimatedItemPriceCalc(materialArray, jobCount) {
  if (!materialArray || typeof materialArray !== "object") {
    return 0;
  }

  return Math.ceil(
    Object.values(materialArray).reduce((preValue, material) => {
      return (
        preValue +
        estimatedMaterialPriceCalc(
          material.quantity / jobCount,
          material.typeID,
        )
      );
    }, 0),
  );
}

function estimatedMaterialPriceCalc(materialQuantity, materialTypeID) {
  const adjustedPrice = getAdjustedPriceForType(materialTypeID);

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

  const customStructureTax = useUsersStore
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
