import Setup from "../../../Classes/jobSetup";
import useUsersStore from "../../../Zustand/usersStore";
import { jobTypes } from "../../../Context/defaultValues";
import {
  BLUEPRINT_SCOPE,
  getCachedBlueprintIndex,
} from "../../../Hooks/EveEsi/useBlueprintIndex";
import { setupFieldsFromCustomStructure } from "../../Custom Structures/customStructureSetup";
import materialQuantitiesForSetup from "../../Blueprint Calculations/calculateMaterialsForSetup";
import { readIndustryBonuses } from "../../Industry Facilities/industryBonuses";

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
 * Splits the minimum total runs across the matching originals in the reader's personal and
 * corporation blueprints.
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
 * Where a job is made and with what, derived from the current user's settings and the blueprints
 * they hold.
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
 * Setup accepts the character under two names and stores it under one, so a source naming the other
 * would not override one spread in beneath it.
 *
 * @param {Object} source
 */
function asStoredFieldNames({ characterToUse, ...rest }) {
  return characterToUse === undefined
    ? rest
    : { ...rest, selectedCharacter: characterToUse };
}

/**
 * Drops keys with no value, so spreading one source does not blank a field the source beneath it
 * answered.
 */
function withoutUndefined(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  );
}

/**
 * Builds one setup from its quantity, `overrides`, `basedOn` and the job's context, each taking
 * precedence over the ones after it.
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

  newSetup.recalculateMaterials(job.rawData.materials, job.itemID);
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
  setup.recalculateMaterials(job.rawData?.materials, job?.itemID);
  job.build.setup[setupID] = setup.toDocument();
}

export function checkForDefaultMaterialEfficiecyValue(inputJobType) {
  if (
    useUsersStore.getState().applicationSettings
      .defaultMaterialEfficiencyValue &&
    inputJobType === jobTypes.manufacturing
  ) {
    return useUsersStore.getState().applicationSettings
      .defaultMaterialEfficiencyValue;
  }
  return 0;
}

export function findHighestMaterialEfficiencyBlueprint(
  inputJobType,
  blueprintTypeID,
  queryClient,
) {
  const defaultReturn = {
    ME: checkForDefaultMaterialEfficiecyValue(inputJobType),
    TE: 0,
  };

  if (
    inputJobType !== jobTypes.manufacturing ||
    !useUsersStore.getState().account.isLoggedIn
  ) {
    return defaultReturn;
  }

  const { byTypeId } = getCachedBlueprintIndex(queryClient, {
    scope: BLUEPRINT_SCOPE.ALL,
  });

  const [best] = byTypeId.get(blueprintTypeID) ?? [];

  if (!best) {
    return defaultReturn;
  }

  return { ME: best.me, TE: best.te / 2 };
}

export function getDefaultStrutureForJobType(inputJobType) {
  const matchedStructure = useUsersStore
    .getState()
    .applicationSettings.actions.getDefaultCustomStructureWithJobType(
      inputJobType,
    );

  if (!matchedStructure) return {};

  return setupFieldsFromCustomStructure(matchedStructure);
}

export function calculateSetupQuantitiesFromRequiredQuantity(
  maxProductionLimit,
  baseQuantity,
  itemQuantityRequired,
) {
  const jobs = [];
  const totalPerMaxRuns = maxProductionLimit * baseQuantity;
  const numMaxRuns = Math.floor(itemQuantityRequired / totalPerMaxRuns);
  let leftOvers = 0;
  let singleJobRequired = false;

  if (totalPerMaxRuns > itemQuantityRequired) {
    jobs.push({
      runCount: Math.ceil(itemQuantityRequired / baseQuantity),
      jobCount: 1,
    });
    singleJobRequired = true;
  } else {
    leftOvers = itemQuantityRequired - totalPerMaxRuns * numMaxRuns;
  }

  if (!singleJobRequired) {
    jobs.push({
      runCount: maxProductionLimit,
      jobCount: numMaxRuns,
    });
  }
  if (leftOvers > 0) {
    jobs.push({
      runCount: Math.ceil(leftOvers / baseQuantity),
      jobCount: 1,
    });
  }

  return jobs;
}

/**
 * Split a positive integer total across `parts` buckets as evenly as possible (largest remainders).
 *
 * @param {number} total
 * @param {number} parts
 * @returns {number[]}
 */
function splitIntegerEvenlyAcrossParts(total, parts) {
  if (parts <= 0 || total <= 0) {
    return [];
  }
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < parts; i++) {
    out.push(base + (i < remainder ? 1 : 0));
  }
  return out;
}

/**
 * Groups per-slot run counts that are equal into planner segments (`jobCount` = BPOs with that run
 * count).
 *
 * @param {number[]} runsPerSlot — one run count per original blueprint; zeros are ignored
 * @returns {Array<{ runCount: number, jobCount: number }>}
 */
function groupIdenticalRunCountsIntoSegments(runsPerSlot) {
  /** @type {Map<number, number>} */
  const runCountToSlots = new Map();
  for (const r of runsPerSlot) {
    if (r <= 0) continue;
    runCountToSlots.set(r, (runCountToSlots.get(r) ?? 0) + 1);
  }
  /** @type {Array<{ runCount: number, jobCount: number }>} */
  const segments = [];
  for (const [runCount, jobCount] of runCountToSlots) {
    segments.push({ runCount, jobCount });
  }
  segments.sort((a, b) => b.runCount - a.runCount);
  return segments;
}

/**
 * Distributes **manufacturing runs** across owned **original** blueprints for `blueprintTypeID`
 * (personal + corporation caches).
 *
 * @param {number} blueprintTypeID
 * @param {number} maxProductionLimit — unused for the multi-blueprint path; kept for call-site compatibility.
 * @param {number} requiredQuantity — total **finished output items** to build (product units).
 * @param {number} baseQuantity — output items per **single** manufacturing run (recipe batch size).
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @returns {Array<{ runCount: number, jobCount: number }>}
 */
export function calculateSetupQuantitiesAcrossOwnedBlueprintOriginals(
  blueprintTypeID,
  maxProductionLimit,
  requiredQuantity,
  baseQuantity,
  queryClient,
) {
  const { byTypeId } = getCachedBlueprintIndex(queryClient, {
    scope: BLUEPRINT_SCOPE.ALL,
  });

  if (requiredQuantity <= 0) {
    return calculateSetupQuantitiesFromRequiredQuantity(
      maxProductionLimit,
      baseQuantity,
      requiredQuantity,
    );
  }

  const originalCount = (byTypeId.get(blueprintTypeID) ?? []).reduce(
    (total, row) => total + row.originalCount,
    0,
  );

  if (originalCount <= 1) {
    return calculateSetupQuantitiesFromRequiredQuantity(
      maxProductionLimit,
      baseQuantity,
      requiredQuantity,
    );
  }

  const itemsPerRun = baseQuantity > 0 ? baseQuantity : 1;
  const totalRunsNeeded = Math.ceil(requiredQuantity / itemsPerRun);
  const runsPerSlot = splitIntegerEvenlyAcrossParts(
    totalRunsNeeded,
    originalCount,
  );
  const segments = groupIdenticalRunCountsIntoSegments(runsPerSlot);

  return segments.length > 0
    ? segments
    : calculateSetupQuantitiesFromRequiredQuantity(
        maxProductionLimit,
        baseQuantity,
        requiredQuantity,
      );
}

/**
 * Whether two material counts ask for the same quantity of the same types.
 *
 * @param {Object} stored - What the setup holds
 * @param {Object} rebuilt - What its inputs call for now
 * @returns {boolean}
 * @private
 */
function sameMaterialCount(stored, rebuilt) {
  const held = stored ?? {};
  const wanted = rebuilt ?? {};
  const typeIDs = new Set([...Object.keys(held), ...Object.keys(wanted)]);

  for (const typeID of typeIDs) {
    if (held[typeID]?.quantity !== wanted[typeID]?.quantity) return false;
    if (held[typeID]?.rawQuantity !== wanted[typeID]?.rawQuantity) return false;
  }
  return true;
}

/**
 * The figures a setup works out from its own choices, each with how to work it out again and how to
 * tell whether the stored one still agrees.
 *
 * @type {Array<{field: string, rebuild: (setup: Object, job: Object) => *,
 * matches: (stored: *, rebuilt: *) => boolean}>}
 */
const derivedFigures = [
  {
    field: "materialCount",
    rebuild: (setup, job) =>
      materialQuantitiesForSetup(
        setup,
        job?.rawData?.materials ?? [],
        job?.itemID,
      ),
    matches: sameMaterialCount,
  },
];

/**
 * Brings a job's setups back into step with the choices they were built from, in place, and says
 * which figures on which setups it corrected.
 *
 * @param {Object} job - The job, as plain data
 * @returns {Array<{setupID: string, fields: Array<string>}>}
 */
export function correctSetupFigures(job) {
  const setups = job?.build?.setup;
  if (!setups) return [];
  if (!readIndustryBonuses()) return [];

  const corrected = [];

  for (const [setupID, row] of Object.entries(setups)) {
    if (!row) continue;

    const setup = new Setup(row);
    const drifted = [];

    for (const figure of derivedFigures) {
      const rebuilt = figure.rebuild(setup, job);
      if (figure.matches(setup[figure.field], rebuilt)) continue;

      setup[figure.field] = rebuilt;
      drifted.push(figure.field);
    }

    if (drifted.length === 0) continue;

    setups[setupID] = setup.toDocument();
    corrected.push({ setupID, fields: drifted });
  }

  return corrected;
}
