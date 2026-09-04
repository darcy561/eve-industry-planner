import useUsersStore from "../../Zustand/usersStore";

/**
 * Selects optimal ore combinations to fulfil mineral requirements using a scoring algorithm.
 * Evaluates each ore based on cost efficiency, mineral yield, waste penalties, and user preferences.
 * Uses a greedy algorithm to build an optimal plan that minimizes cost while meeting requirements.
 *
 * @param {Object} mineralRequirements - Object with mineral IDs as keys and required quantities
 * @param {Object} ores - Object with ore IDs as keys and ore objects as values
 * @param {Array<number>} [oreIDsToBeIgnored=[]] - Array of ore IDs to exclude from selection
 * @param {Object} [reprocessingCalculationSettings] - Settings for the selection algorithm
 * @param {boolean} [reprocessingCalculationSettings.preferCompressed=false] - Prefer compressed ores
 * @param {number} [reprocessingCalculationSettings.compressionBonusMultiplier=0.1] - Bonus for compressed ores
 * @param {number} [reprocessingCalculationSettings.valueMultiplier=1.0] - Value multiplier for scoring
 * @param {number} [reprocessingCalculationSettings.wastePenaltyMultiplier=0.5] - Penalty for excess minerals
 * @returns {Array<Object>} Array of selected ore objects with quantities
 */
function oreSelector(
  mineralRequirements,
  ores,
  oreIDsToBeIgnored = [],
  reprocessingCalculationSettings
) {
  const rs = useUsersStore.getState().applicationSettings.reprocessingSettings;
  const resolved =
    reprocessingCalculationSettings ?? {
      preferCompressed: rs.preferCompressed,
      compressionBonusMultiplier: rs.compressionBonusMultiplier,
      valueMultiplier: rs.valueMultiplier,
      wastePenaltyMultiplier: rs.wastePenaltyMultiplier,
      sellExcessMineralTypes: rs.sellExcessMineralTypes,
    };
  const { preferCompressed, compressionBonusMultiplier, valueMultiplier, wastePenaltyMultiplier } = resolved;
  const plan = [];

  function areMineralsRemaining() {
    return Object.values(mineralRequirements).some(
      ({ remaining }) => remaining > 0
    );
  }

  function calculateScore(ore) {
    // Step 1: Validate ore has valid pricing data
    if (!ore.unitPrice || ore.unitPrice <= 0) return null;

    // Step 2: Validate ore is not in the list of ores to be ignored
    if (oreIDsToBeIgnored.includes(ore.id)) return null;

    // Step 3: Calculate the cost per batch
    const batchSize = ore.batchSize || 1;
    const batchCost = batchSize * ore.unitPrice;

    // Step 4: Analyse mineral yield from this ore batch
    let acceptedMinerals = 0; // Minerals we actually need
    let surplusMinerals = 0; // Minerals we don't need (waste)

    for (const [mineralId, amountPerBatch] of Object.entries(
      ore.reprocessedMaterials
    )) {
      const stillNeeded = mineralRequirements[mineralId]?.remaining ?? 0;

      if (stillNeeded > 0) {
        // This mineral is still needed - count as accepted (up to what we need)
        acceptedMinerals += Math.min(stillNeeded, amountPerBatch);
      } else {
        // This mineral is not needed - count as surplus/waste
        surplusMinerals += amountPerBatch;
      }
    }

    // Step 5: Skip ores that don't provide any needed minerals
    if (acceptedMinerals === 0) return null;

    // Step 6: Calculate needed minerals per batch cost
    // Higher ratio = more needed minerals per cost of buying one batch
    const neededMineralsPerBatchCost = acceptedMinerals / batchCost;

    // Step 7: Apply waste penalty
    // Penalize ores that produce excess minerals we don't need
    const wastePenalty = (surplusMinerals / batchCost) * wastePenaltyMultiplier;

    // Step 8: Calculate base score (needed minerals per batch cost minus waste penalty)
    let score = neededMineralsPerBatchCost * valueMultiplier - wastePenalty;

    // Step 9: Apply compression bonus if enabled and ore is compressed
    if (preferCompressed && ore.name.toLowerCase().includes("compressed")) {
      // Logarithmic bonus that increases with the amount of accepted minerals
      const compressionBoost =
        Math.log2(1 + acceptedMinerals) * compressionBonusMultiplier;
      score *= 1 + compressionBoost;
    }

    return score;
  }

  while (areMineralsRemaining()) {
    const scoringOres = Object.values(ores)
      .map((ore) => ({
        ore,
        score: calculateScore(ore),
      }))
      .filter((entry) => entry.score !== null)
      .sort((a, b) => b.score - a.score);

    console.table(
      scoringOres.map(({ ore, score }) => ({
        name: ore.name,
        score: score,
      }))
    );

    const bestScore = scoringOres[0]?.ore;

    if (!bestScore) break;

    let maxBatches = Infinity;

    for (const [id, perBatchQty] of Object.entries(
      bestScore.reprocessedMaterials
    )) {
      const stillNeeded = mineralRequirements[id]?.remaining ?? 0;

      if (perBatchQty > 0 && stillNeeded > 0) {
        const batches = Math.ceil(stillNeeded / perBatchQty);
        maxBatches = Math.min(maxBatches, batches);
      }
    }

    if (maxBatches === Infinity || maxBatches === 0) break;

    const mineralsProvided = {};
    const totalUnits = maxBatches * bestScore.batchSize;

    for (const [id, perBatchQty] of Object.entries(
      bestScore.reprocessedMaterials
    )) {
      if (!mineralRequirements[id]) continue;
      const totalAmount = perBatchQty * maxBatches;
      mineralsProvided[id] = totalAmount;
      mineralRequirements[id].remaining = Math.max(
        0,
        (mineralRequirements[id]?.remaining ?? 0) - totalAmount
      );
    }

    bestScore.setTotalQuantity(totalUnits);
    plan.push(bestScore);
  }
  return plan;
}

export default oreSelector;
