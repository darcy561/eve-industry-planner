import useUsersStore from "../../Zustand/usersStore";
import { jobTypes } from "../../Context/defaultValues";
import { getAllCachedCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { getAllCachedCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";

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
  queryClient
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

  const characterBlueprints = getAllCachedCharacterBlueprints(queryClient);
  const corporationBlueprints = getAllCachedCorporationBlueprints(queryClient);

  const filteredBlueprints = [
    ...Object.values(characterBlueprints.data).flat(),
    ...Object.values(corporationBlueprints.data).flat(),
  ].filter((entry) => entry.type_id === blueprintTypeID);

  if (filteredBlueprints.length < 1) {
    return defaultReturn;
  }

  filteredBlueprints.sort(
    (a, b) =>
      a.quantity.toString().localeCompare(b.quantity.toString()) ||
      b.material_efficiency - a.material_efficiency ||
      b.time_efficiency - a.time_efficiency
  );

  return {
    ME: filteredBlueprints[0].material_efficiency,
    TE: filteredBlueprints[0].time_efficiency / 2,
  };
}

export function getDefaultStrutureForJobType(inputJobType) {
  const matchedStructure = useUsersStore
    .getState()
    .applicationSettings.actions.getDefaultCustomStructureWithJobType(
      inputJobType
    );

  if (!matchedStructure) return {};

  return {
    rigID: matchedStructure.rigType,
    structureID: matchedStructure.structureType,
    systemTypeID: matchedStructure.systemType,
    systemID: matchedStructure.systemID,
    taxValue: matchedStructure.tax,
    customStructureID: matchedStructure.id,
  };
}

export function calculateSetupQuantitiesFromRequiredQuantity(
  maxProductionLimit,
  baseQuantity,
  itemQuantityRequired
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
 * ESI uses quantity -2 for blueprint copies; anything else is treated as an original here
 * (same rule as {@link ../Shared/findBlueprintType.js}).
 *
 * @param {{ quantity?: number }} entry
 * @returns {boolean}
 */
function isBlueprintOriginalEntry(entry) {
  return entry?.quantity !== -2;
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
 * Groups per-slot run counts that are equal into planner segments (`jobCount` = BPOs with that run count).
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
 * (personal + corporation caches). Uses the minimum total runs `ceil(requiredQuantity / baseQuantity)`
 * and splits those runs across originals (largest remainder), so total output is
 * `baseQuantity × ceil(requiredQuantity / baseQuantity)` — no extra runs from per-blueprint
 * `ceil(share / baseQuantity)` when shares are split by item count.
 * Blueprint rows are deduped by `item_id`. Not capped by `maxProductionLimit`.
 *
 * For a single original or bad cache, falls back to {@link calculateSetupQuantitiesFromRequiredQuantity}.
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
  queryClient
) {
  const characterBlueprints = getAllCachedCharacterBlueprints(queryClient);
  const corporationBlueprints = getAllCachedCorporationBlueprints(queryClient);

  const cacheReady =
    !characterBlueprints.isLoading &&
    !characterBlueprints.isError &&
    !corporationBlueprints.isLoading &&
    !corporationBlueprints.isError;

  if (!cacheReady || requiredQuantity <= 0) {
    return calculateSetupQuantitiesFromRequiredQuantity(
      maxProductionLimit,
      baseQuantity,
      requiredQuantity
    );
  }

  const merged = [
    ...Object.values(characterBlueprints.data ?? {}).flat(),
    ...Object.values(corporationBlueprints.data ?? {}).flat(),
  ];

  const seenItemIds = new Set();
  /** @type {unknown[]} */
  const matchingOriginals = [];
  for (const entry of merged) {
    if (
      !entry ||
      entry.type_id !== blueprintTypeID ||
      !isBlueprintOriginalEntry(entry)
    ) {
      continue;
    }
    const itemId = entry.item_id;
    if (itemId != null) {
      if (seenItemIds.has(itemId)) continue;
      seenItemIds.add(itemId);
    }
    matchingOriginals.push(entry);
  }

  const originalCount = matchingOriginals.length;

  if (originalCount <= 1) {
    return calculateSetupQuantitiesFromRequiredQuantity(
      maxProductionLimit,
      baseQuantity,
      requiredQuantity
    );
  }

  const itemsPerRun = baseQuantity > 0 ? baseQuantity : 1;
  const totalRunsNeeded = Math.ceil(requiredQuantity / itemsPerRun);
  const runsPerSlot = splitIntegerEvenlyAcrossParts(
    totalRunsNeeded,
    originalCount
  );
  const segments = groupIdenticalRunCountsIntoSegments(runsPerSlot);

  return segments.length > 0
    ? segments
    : calculateSetupQuantitiesFromRequiredQuantity(
        maxProductionLimit,
        baseQuantity,
        requiredQuantity
      );
}
