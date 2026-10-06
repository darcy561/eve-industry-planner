import { solve } from "yalps";

import {
  compressedOreChoices,
  reprocessingItemTypes,
  shippingModes,
} from "../../../Context/defaultValues";
import { isPriced } from "../../MarketData/prices/isPriced";
import {
  producibleByReprocessing,
  readReprocessingItems,
  selectableItems,
  volumeOf,
} from "../../Static/reprocessing";
import { reprocessedQuantity } from "../engine/reprocess";
import { yieldFor } from "../engine/reprocessingSetup";

/** How much cheaper compressed ore looks to the solver when it is preferred; never in a reported figure. */
export const PREFER_COMPRESSED_BIAS = 0.05;

const COMPRESSED_NAME = /\bCompressed\b/;

/**
 * The cheapest ore, delivered, that covers the needs ore can produce, in whole batches; with what is
 * bought outright, what no ore gives, and the exact fractional optimum the plan is measured against.
 *
 * @param {Object<string, number>} needs - units wanted, keyed by type id; any material
 * @param {ReturnType<import("../engine/reprocessingSetup").reprocessingSetupFrom>} setup
 * @param {{compressedOre?: "prefer"|"allow"|"avoid", buyOutright?: boolean,
 *   neverChoose?: Array<string|number>, shipping?: {mode: "perVolume"|"fixed", amount: number}}} options
 * @param {(typeID: string) => number|undefined} priceOf - one unit's price
 * @returns {{ores: Array<{typeID: string, name: string, batches: number, quantity: number,
 *   chosenFor: string|null}>, outright: Array<{typeID: string, quantity: number}>,
 *   notProducible: Array<{typeID: string, quantity: number}>,
 *   uncovered: Array<{typeID: string, quantity: number}>, bound: number|null, cost: number}}
 */
export function oreToBuy(needs, setup, options = {}, priceOf) {
  const wanted = {};
  const notProducible = [];
  for (const [typeID, quantity] of Object.entries(needs)) {
    if (!(quantity > 0)) continue;
    if (producibleByReprocessing(typeID)) wanted[String(typeID)] = quantity;
    else notProducible.push({ typeID: String(typeID), quantity });
  }

  const candidates = [
    ...oreCandidates(wanted, setup, options, priceOf),
    ...(options.buyOutright
      ? outrightCandidates(wanted, options, priceOf)
      : []),
  ];
  const coverable = new Set(candidates.flatMap((c) => Object.keys(c.gives)));
  const uncovered = Object.entries(wanted)
    .filter(([typeID]) => !coverable.has(typeID))
    .map(([typeID, quantity]) => ({ typeID, quantity }));
  for (const { typeID } of uncovered) delete wanted[typeID];

  if (Object.keys(wanted).length === 0) {
    return {
      ores: [],
      outright: [],
      notProducible,
      uncovered,
      bound: 0,
      cost: 0,
    };
  }

  const solution = solve({
    direction: "minimize",
    objective: "cost",
    constraints: Object.fromEntries(
      Object.entries(wanted).map(([typeID, quantity]) => [
        typeID,
        { min: quantity },
      ]),
    ),
    variables: Object.fromEntries(
      candidates.map((c) => [c.key, { cost: c.solverCost, ...c.gives }]),
    ),
  });
  if (solution.status !== "optimal") {
    return {
      ores: [],
      outright: [],
      notProducible,
      uncovered: [
        ...uncovered,
        ...Object.entries(wanted).map(([typeID, quantity]) => ({
          typeID,
          quantity,
        })),
      ],
      bound: null,
      cost: 0,
    };
  }

  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const counts = new Map(
    solution.variables.map(([key, amount]) => [key, Math.ceil(amount - 1e-9)]),
  );
  trim(counts, byKey, wanted);

  const covered = {};
  for (const [key, count] of counts) {
    for (const [typeID, perBatch] of Object.entries(byKey.get(key).gives)) {
      covered[typeID] = (covered[typeID] ?? 0) + perBatch * count;
    }
  }

  const ores = [];
  const outright = [];
  let cost = 0;
  for (const [key, count] of counts) {
    if (count <= 0) continue;
    const candidate = byKey.get(key);
    cost += count * candidate.cost;
    if (candidate.outright) {
      outright.push({ typeID: candidate.typeID, quantity: count });
    } else {
      ores.push({
        typeID: candidate.typeID,
        name: candidate.name,
        batches: count,
        quantity: count * candidate.batchSize,
        chosenFor: chosenFor(candidate, wanted, covered),
      });
    }
  }

  return {
    ores,
    outright,
    notProducible,
    uncovered,
    bound: boundAtRealPrices(solution, byKey),
    cost,
  };
}

/**
 * Every reprocessing file entry the solver may choose from before any setting narrows it: selectable
 * ore, moon ore and ice, and unrefined minerals.
 *
 * @returns {Array<Object>}
 */
export function choosableOre() {
  return [
    ...selectableItems(),
    ...Object.values(readReprocessingItems() ?? {}).filter(
      (entry) => entry.itemType === reprocessingItemTypes.unrefinedMineral,
    ),
  ];
}

/**
 * Every ore that may be chosen for the needs: choosable ore, unrefined minerals at their least, less
 * what the reader excluded, unpriced ore, and compressed ore when it is not to be used.
 *
 * @returns {Array<Object>}
 */
function oreCandidates(wanted, setup, options, priceOf) {
  const neverChoose = new Set((options.neverChoose ?? []).map(String));
  const candidates = [];
  for (const entry of choosableOre()) {
    const typeID = String(entry.id);
    const compressed = COMPRESSED_NAME.test(entry.name ?? "");
    if (neverChoose.has(typeID)) continue;
    if (compressed && options.compressedOre === compressedOreChoices.avoid)
      continue;
    const price = priceOf(typeID);
    if (!isPriced(price)) continue;

    const yieldPercent = yieldFor(setup, entry);
    const gives = batchGives(entry, yieldPercent, wanted);
    if (Object.keys(gives).length === 0) continue;

    const cost =
      entry.batchSize * (price + perVolume(options) * (volumeOf(typeID) ?? 0));
    const bias =
      compressed && options.compressedOre === compressedOreChoices.prefer
        ? 1 - PREFER_COMPRESSED_BIAS
        : 1;
    candidates.push({
      key: `ore:${typeID}`,
      typeID,
      name: entry.name,
      batchSize: entry.batchSize,
      gives,
      cost,
      solverCost: cost * bias,
    });
  }
  return candidates;
}

/**
 * Each needed material bought as it is, one unit for one unit, where it has a price.
 *
 * @returns {Array<Object>}
 */
function outrightCandidates(wanted, options, priceOf) {
  return Object.keys(wanted)
    .map((typeID) => {
      const price = priceOf(typeID);
      if (!isPriced(price)) return null;
      const cost = price + perVolume(options) * (volumeOf(typeID) ?? 0);
      return {
        key: `outright:${typeID}`,
        typeID,
        outright: true,
        batchSize: 1,
        gives: { [typeID]: 1 },
        cost,
        solverCost: cost,
      };
    })
    .filter(Boolean);
}

/**
 * What one batch of an item gives of the wanted materials at a yield: its fixed outputs, or an
 * unrefined mineral's least amount, which is all it is sure to give.
 *
 * @returns {Object<string, number>}
 */
function batchGives(entry, yieldPercent, wanted) {
  const base =
    entry.itemType === reprocessingItemTypes.unrefinedMineral
      ? Object.fromEntries(
          Object.entries(entry.randomizedMaterials ?? {}).map(
            ([typeID, { quantityMin }]) => [typeID, quantityMin],
          ),
        )
      : (entry.materials ?? {});
  const gives = {};
  for (const [typeID, quantity] of Object.entries(base)) {
    if (!(typeID in wanted)) continue;
    const given = reprocessedQuantity(
      quantity,
      1,
      yieldPercent,
      entry.itemType,
    );
    if (given > 0) gives[typeID] = given;
  }
  return gives;
}

/**
 * Takes whole batches off the dearest choices first while every need stays covered, until no
 * choice can lose one.
 */
function trim(counts, byKey, wanted) {
  const covered = (typeID) => {
    let total = 0;
    for (const [key, count] of counts) {
      total += count * (byKey.get(key).gives[typeID] ?? 0);
    }
    return total;
  };
  const order = [...counts.keys()].sort(
    (a, b) => byKey.get(b).cost - byKey.get(a).cost,
  );
  let reduced = true;
  while (reduced) {
    reduced = false;
    for (const key of order) {
      if ((counts.get(key) ?? 0) <= 0) continue;
      const { gives } = byKey.get(key);
      const stillCovered = Object.entries(wanted).every(
        ([typeID, need]) => covered(typeID) - (gives[typeID] ?? 0) >= need,
      );
      if (stillCovered) {
        counts.set(key, counts.get(key) - 1);
        reduced = true;
      }
    }
  }
}

/**
 * The need a chosen ore was chosen for: of those it gives, the one the whole plan covers with the
 * least to spare against the need, which is the need it is tight on.
 *
 * @returns {string|null}
 */
function chosenFor(candidate, wanted, covered) {
  let best = null;
  let leastSpare = Infinity;
  for (const typeID of Object.keys(candidate.gives)) {
    const spare = (covered[typeID] - wanted[typeID]) / wanted[typeID];
    if (spare < leastSpare) {
      best = typeID;
      leastSpare = spare;
    }
  }
  return best;
}

/**
 * The fractional optimum's cost at real prices, the bound a whole-batch plan is measured against.
 *
 * @returns {number}
 */
function boundAtRealPrices(solution, byKey) {
  return solution.variables.reduce(
    (total, [key, amount]) => total + amount * byKey.get(key).cost,
    0,
  );
}

/**
 * The shipping charged per m³, which moves the choice; a fixed amount is added after and does not.
 *
 * @returns {number}
 */
function perVolume(options) {
  return options.shipping?.mode === shippingModes.perVolume
    ? options.shipping.amount
    : 0;
}
