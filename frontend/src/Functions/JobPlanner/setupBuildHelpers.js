import Setup from "../../Classes/jobSetup";
import useUsersStore from "../../Zustand/usersStore";
import {
  findHighestMaterialEfficiencyBlueprint,
  getDefaultStrutureForJobType,
  calculateSetupQuantitiesFromRequiredQuantity,
  calculateSetupQuantitiesAcrossOwnedBlueprintOriginals,
} from "../Job Build/setupHelpers";

/**
 * @callback CalculateSetupQuantities
 * @param {SetupQuantitiesContext} ctx
 * @returns {unknown[]} Same shape as {@link calculateSetupQuantitiesFromRequiredQuantity} (e.g. `{ runCount, jobCount }[]`).
 */

/**
 * @typedef {object} SetupQuantitiesContext
 * @property {import("../../Classes/job").default} job
 * @property {import("@tanstack/react-query").QueryClient} queryClient
 * @property {number} maxProductionLimit
 * @property {number} baseQuantity Output per run (`job.rawData.products[0].quantity`).
 * @property {number} itemQuantityRequired Target finished quantity (`requiredQuantity`).
 */

/**
 * Default planner: max-run batching via {@link calculateSetupQuantitiesFromRequiredQuantity}.
 *
 * @type {CalculateSetupQuantities}
 */
export function defaultCalculateSetupQuantities({
  maxProductionLimit,
  baseQuantity,
  itemQuantityRequired,
}) {
  return calculateSetupQuantitiesFromRequiredQuantity(
    maxProductionLimit,
    baseQuantity,
    itemQuantityRequired
  );
}

/**
 * Uses cached personal + corporation blueprints to count matching originals and split
 * minimum total runs across them (see `calculateSetupQuantitiesAcrossOwnedBlueprintOriginals` in setupHelpers).
 *
 * @type {CalculateSetupQuantities}
 */
export function calculateSetupQuantitiesAcrossOwnedBlueprintOriginalsFromContext(ctx) {
  return calculateSetupQuantitiesAcrossOwnedBlueprintOriginals(
    ctx.job.blueprintTypeID,
    ctx.maxProductionLimit,
    ctx.itemQuantityRequired,
    ctx.baseQuantity,
    ctx.queryClient
  );
}

/**
 * @param {object} [options]
 * @param {CalculateSetupQuantities} [options.calculateSetupQuantities]
 *   Default: {@link defaultCalculateSetupQuantities}. Pass
 *   {@link calculateSetupQuantitiesAcrossOwnedBlueprintOriginalsFromContext} for the multi-BPO split.
 */
export function buildSetupContextForJob(
  job,
  requiredQuantity,
  queryClient,
  options = {}
) {
  const {
    calculateSetupQuantities = defaultCalculateSetupQuantities,
  } = options;
  const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
    job.jobType,
    job.blueprintTypeID,
    queryClient
  );
  const structureData = getDefaultStrutureForJobType(job.jobType);
  const setupQuantities = calculateSetupQuantities({
    job,
    queryClient,
    maxProductionLimit: job.maxProductionLimit,
    baseQuantity: job.rawData.products[0].quantity,
    itemQuantityRequired: requiredQuantity,
  });

  return {
    ME,
    TE,
    structureData,
    setupQuantities,
    rawTimeValue: job.rawData.time,
  };
}

export function buildSetupFromQuantity(
  job,
  setupQuantity,
  queryClient,
  context,
  overrides = {}
) {
  const newSetup = new Setup({
    ME: context.ME,
    TE: context.TE,
    ...context.structureData,
    ...setupQuantity,
    systemID: overrides.systemID ?? context.structureData.systemID,
    characterToUse:
      overrides.characterToUse ??
      useUsersStore.getState().account.actions.getMainCharacterHash(),
    rawTimeValue: context.rawTimeValue,
    jobType: job.jobType,
  });

  newSetup.applyInitialRawMaterialQuantities(job.rawData.materials);
  newSetup.recalculate(job.skills, queryClient);
  return newSetup;
}

/**
 * Build a {@link Setup} from a persisted template row (ME/TE/structure/runs + optional character).
 *
 * @param {import("../../Classes/job").default} job
 * @param {Record<string, unknown>} presetRow — same shape as API `presetSetups[]`
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {number} rawTimeValue — `job.rawData.time`
 */
export function buildSetupFromPresetRow(job, presetRow, queryClient, rawTimeValue) {
  const mainChar =
    useUsersStore.getState().account.actions.getMainCharacterHash();
  const newSetup = new Setup({
    runCount: presetRow.runCount,
    jobCount: presetRow.jobCount,
    ME: presetRow.ME,
    TE: presetRow.TE,
    rigID: presetRow.rigID,
    structureID: presetRow.structureID,
    systemTypeID: presetRow.systemTypeID,
    systemID: presetRow.systemID,
    taxValue: presetRow.taxValue,
    customStructureID: presetRow.customStructureID ?? "",
    characterToUse: presetRow.characterToUse ?? mainChar,
    rawTimeValue,
    jobType: job.jobType,
  });
  newSetup.applyInitialRawMaterialQuantities(job.rawData.materials);
  newSetup.recalculate(job.skills, queryClient);
  return newSetup;
}
