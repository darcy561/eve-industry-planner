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
import {
  enlistedValuesFor,
  settledFieldFor,
} from "../Industry Facilities/placeConstraints";
import enlistedFactionForSetup from "../Industry Facilities/enlistedFaction";
import militiaDiscountForSetup from "../Industry Facilities/militiaDiscount";
import { costOfInstalls } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * What installing one setup costs, for one job slot.
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

  const estimatedItemValue = estimatedItemPriceCalc(
    setup.materialCount,
    setup.jobCount,
  );
  if (!estimatedItemValue) return 0;

  const militiaDiscount = militiaDiscountForSetup(setup);
  const facilityModifier = findFacilityModifier(
    settledFieldFor(setup, "structureID", setup.structureID),
    setup.jobType,
  );

  const facilityTax = findFacilityTax(
    setup.customStructureID,
    settledFieldFor(setup, "structureID", setup.structureID),
    setup.jobType,
    settledFieldFor(setup, "taxValue", setup.taxValue),
  );

  const systemIndexValue = findSystemIndexForJob(
    settledFieldFor(setup, "systemID", setup.systemID),
    setup.jobType,
    setup.useAlternativeSystemIndexValue,
    setup.alternativeSystemIndexValue,
    additionalSystemIndexValues,
  );

  const cloneValue = findCloneValue(quotedCharacterHash(setup));
  const surcharge =
    SCC_SURCHARGE *
    (1 -
      (enlistedValuesFor(setup, enlistedFactionForSetup(setup))
        .sccSurchargeReduction ?? 0));

  const taxModifierTotal =
    estimatedItemValue *
    (systemIndexValue * (1 - militiaDiscount) * facilityModifier +
      facilityTax +
      surcharge +
      cloneValue);

  const systemIndexDeduction = Math.ceil(
    systemIndexValue * estimatedItemValue * (1 - militiaDiscount),
  );

  const facilityBonusDeduction = Math.ceil(
    facilityModifier * systemIndexDeduction,
  );

  const jobGrossCost = systemIndexDeduction - facilityBonusDeduction;

  return jobGrossCost + taxModifierTotal;
}

/**
 * What installing one setup would cost across all of its job slots.
 *
 * @param {Setup} setup
 * @returns {number}
 */
export function setupInstallCost(setup) {
  return calculateInstallCostfromSetup(setup) * (Number(setup?.jobCount) || 1);
}

/**
 * What installing every setup on a job would cost, across all of its job slots.
 *
 * @param {Record<string, Setup> | null | undefined} setups
 * @returns {number}
 */
export function sumSetupInstallCostEstimates(setups) {
  if (!setups) return 0;

  return Object.values(setups).reduce(
    (sum, setup) => sum + setupInstallCost(setup),
    0,
  );
}

/**
 * What a job's installs cost: the linked ESI jobs once any are linked, and the
 * setup estimates until they are.
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

  return matchedCharacter?.isOmega ? 0 : ALPHA_CLONE_TAX;
}

export default calculateInstallCostfromSetup;
