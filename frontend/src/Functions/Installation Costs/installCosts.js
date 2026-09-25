/**
 * Install cost estimates — the setup formula and the sum of those estimates
 * across a job's setups.
 *
 * What a job's installs actually cost is `totalInstallCost` in `jobSelectors`:
 * the ESI jobs linked to it. Only getJobInstallCostForPlanning mixes the two,
 * and only to stand in with estimates before anything is linked.
 */

import findSystemIndexForJob from "../Helper/findSystemIndexValue";
import {
  structureTypeMap,
  jobTypes,
  SCC_SURCHARGE,
  ALPHA_CLONE_TAX,
} from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import { readAdjustedPriceForType } from "../MarketData/prices/marketPriceForType.js";
import { quotedCharacterHash } from "../Skills/quotedCharacter";
import { costOfInstalls } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * Calculates the install cost for a single setup (per job slot, before × jobCount).
 *
 * Takes the setup as it is stored as readily as an instance of the class built
 * over it: every figure it reads is a field of the row, and the job being edited
 * holds plain rows. A setup carrying none of them costs nothing either way,
 * because the material count it prices is what the estimate is made of.
 *
 * @param {Setup|Object} setup
 * @param {Object} [additionalSystemIndexValues]
 * @returns {number}
 */
export function calculateInstallCostfromSetup(
  setup,
  additionalSystemIndexValues = {},
) {
  if (!setup || typeof setup !== "object") return 0;

  // Nothing to price means nothing to charge for, and the answer would be zero
  // anyway — every term below is a share of this. It is a guard rather than a
  // shortcut because a setup this incomplete usually has no job type either,
  // and the facility lookup indexes a map by that before it checks anything.
  const estimatedItemValue = estimatedItemPriceCalc(
    setup.materialCount,
    setup.jobCount,
  );
  if (!estimatedItemValue) return 0;

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

  return installCostForPlanning({
    industryJobs: job.esi?.industryJobs,
    setups: job.build.setup,
  });
}

/**
 * The same figure for a reader that already holds the runs and the setups.
 *
 * @param {object} params
 * @param {object} [params.industryJobs] - The runs linked to the job
 * @param {object} [params.setups] - The job's setups
 * @returns {number}
 */
export function installCostForPlanning({ industryJobs, setups }) {
  if (Object.values(industryJobs ?? {}).length > 0) {
    return costOfInstalls(industryJobs);
  }

  return sumSetupInstallCostEstimates(setups);
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
  const adjustedPrice = readAdjustedPriceForType(materialTypeID);

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
