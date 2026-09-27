import useUsersStore from "../../Zustand/usersStore";
import { jobTypes } from "../../Context/defaultValues";
import {
  BLUEPRINT_SCOPE,
  getCachedBlueprintIndex,
} from "../../Hooks/EveEsi/useBlueprintIndex";
import { setupFieldsFromCustomStructure } from "../Custom Structures/customStructureSetup";

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

  // Ordered when the collection was built — originals first, then the most researched — so the
  // best one is simply the first.
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
  queryClient,
) {
  // No readiness guard of its own: the reader reports nothing for a collection still arriving or
  // one whose refetch failed, and no originals takes the same fallback below.
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

  // Summed rather than counted. A stack of originals is one row carrying several, and each of them
  // can hold its own job — a count of rows gives one slot where the stack offers as many as it
  // holds. Reaction formulas restack after every use, so a stack is their ordinary condition.
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
