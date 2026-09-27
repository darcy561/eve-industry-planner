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
 * @property {object} job
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
    itemQuantityRequired,
  );
}

/**
 * Uses cached personal + corporation blueprints to count matching originals and split
 * minimum total runs across them (see `calculateSetupQuantitiesAcrossOwnedBlueprintOriginals` in setupHelpers).
 *
 * @type {CalculateSetupQuantities}
 */
export function calculateSetupQuantitiesAcrossOwnedBlueprintOriginalsFromContext(
  ctx,
) {
  return calculateSetupQuantitiesAcrossOwnedBlueprintOriginals(
    ctx.job.blueprintTypeID,
    ctx.maxProductionLimit,
    ctx.itemQuantityRequired,
    ctx.baseQuantity,
    ctx.queryClient,
  );
}

/**
 * Where a job is made and with what, derived from the current user's settings and
 * the blueprints they hold. The floor a setup is built on when nothing above it
 */
export function buildSetupContextForJob(job, queryClient) {
  const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
    job.jobType,
    job.blueprintTypeID,
    queryClient,
  );

  return {
    ME,
    TE,
    structureData: getDefaultStrutureForJobType(job.jobType),
    rawTime: job.rawData.time,
  };
}

/**
 * How a required total divides into setups, as `{ runCount, jobCount }` entries.
 *
 * @param {object} [options]
 * @param {CalculateSetupQuantities} [options.calculateSetupQuantities]
 *   Default: {@link defaultCalculateSetupQuantities}. Pass
 *   {@link calculateSetupQuantitiesAcrossOwnedBlueprintOriginalsFromContext} for the multi-BPO split.
 */
export function setupQuantitiesForTotal(
  job,
  requiredQuantity,
  queryClient,
  options = {},
) {
  const { calculateSetupQuantities = defaultCalculateSetupQuantities } =
    options;

  return calculateSetupQuantities({
    job,
    queryClient,
    maxProductionLimit: job.maxProductionLimit,
    baseQuantity: job.rawData.products[0].quantity,
    itemQuantityRequired: requiredQuantity,
  });
}

/**
 * Setup accepts the character under two names and stores it under one, so a
 * source naming the other would not override one spread in beneath it.
 *
 * @param {Object} source
 */
function asStoredFieldNames({ characterToUse, ...rest }) {
  return characterToUse === undefined
    ? rest
    : { ...rest, selectedCharacter: characterToUse };
}

/**
 * Drops keys with no value, so spreading one source does not blank a field the
 * source beneath it answered.
 */
function withoutUndefined(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  );
}

/**
 * Builds one setup. Precedence, highest first: the quantity, `overrides` (a build
 * request or a stored template row), `basedOn` (the setup this one continues
 *
 * @param {Object} [sources]
 * @param {Object} [sources.basedOn] - The setup this one continues from, as a row
 * @param {Object} [sources.overrides]
 * @returns {Object} The setup as a stored row
 */
export function buildSetupFromQuantity(
  job,
  setupQuantity,
  queryClient,
  context,
  { basedOn = null, overrides = {} } = {},
) {
  const newSetup = new Setup({
    ME: context.ME,
    TE: context.TE,
    ...context.structureData,
    selectedCharacter: useUsersStore
      .getState()
      .account.actions.getMainCharacterHash(),
    ...(basedOn ?? {}),
    ...withoutUndefined(asStoredFieldNames(overrides)),
    ...setupQuantity,
    id: undefined,
    rawTime: context.rawTime,
    jobType: job.jobType,
  });

  newSetup.recalculateMaterials(job.rawData.materials);
  return newSetup.toDocument();
}

/**
 * Works out again what one of a job's setups calls for, in place.
 *
 * @param {Object} job - The job holding the setup, as plain data
 * @param {string} setupID
 */
export function recalculateSetupMaterials(job, setupID) {
  const row = job?.build?.setup?.[setupID];
  if (!row) return;

  const setup = new Setup(row);
  setup.recalculateMaterials(job.rawData?.materials);
  job.build.setup[setupID] = setup.toDocument();
}
