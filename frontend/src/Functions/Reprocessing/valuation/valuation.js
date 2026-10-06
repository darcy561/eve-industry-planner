import { shippingModes } from "../../../Context/defaultValues";
import { isPriced } from "../../MarketData/prices/isPriced";
import { volumeOf } from "../../Static/reprocessing";
import {
  combinedValueRange,
  randomOutputValue,
} from "../engine/randomOutputValue";

/**
 * Every figure the To minerals answers show, from a `reprocess` result, prices and rates: per item and
 * in total, reprocessed against sold as they are, the value by output, cost as the ore, and hauling.
 *
 * @param {ReturnType<import("../engine/reprocess").reprocess>} result
 * @param {(typeID: string) => number|undefined} priceOf - one unit's price; undefined when unpriced
 * @param {{feePercent?: number, taxPercent?: number}} [rates] - selling fees, and reprocessing tax
 *   charged on the outputs' market value
 * @returns {{items: Array<Object>, totals: Object, shareByOutput: Array<{typeID: string,
 *   value: number, share: number}>, hauling: {asIs: number, reprocessed: number},
 *   unpriced: Array<string>, withoutVolume: Array<string>}}
 */
export function valueReprocessing(result, priceOf, rates = {}) {
  const keep = 1 - (rates.feePercent ?? 0) / 100;
  const tax = (rates.taxPercent ?? 0) / 100;
  const price = pricer(priceOf);
  const volume = volumeReader();
  const outputValues = {};
  const ranged = [];
  let rangedFixed = 0;

  const items = result.items.map((item) => {
    const orePrice = price(item.typeID);
    const marketValue = valueOf(item.outputs, price);
    const keptBackValue = item.keptBack * orePrice * keep;
    const asIs = item.quantity * orePrice * keep;
    for (const [typeID, units] of Object.entries(item.outputs)) {
      outputValues[typeID] =
        (outputValues[typeID] ?? 0) + units * price(typeID);
    }

    const valued = {
      typeID: item.typeID,
      name: item.name,
      asIs,
      keptBackValue,
      marketValue,
      fees: marketValue * (1 - keep),
      tax: marketValue * tax,
      reprocessed: marketValue * (keep - tax) + keptBackValue,
      costAsThisOre: costAsThisOre(item, orePrice, price),
    };

    if (item.randomizedMaterials) {
      valued.range = afterFeesAndTax(
        randomOutputValue(item, (typeID) => price(typeID)),
        keep - tax,
        keptBackValue,
      );
      valued.reprocessed = valued.range.expected;
      ranged.push(valued.range);
    } else {
      rangedFixed += valued.reprocessed;
    }

    valued.difference = valued.reprocessed - asIs;
    valued.differencePercent =
      asIs > 0 ? (valued.difference / asIs) * 100 : null;
    return valued;
  });

  const sum = (field) => items.reduce((total, item) => total + item[field], 0);
  const totals = {
    marketValue: sum("marketValue"),
    fees: sum("fees"),
    tax: sum("tax"),
    keptBackValue: sum("keptBackValue"),
    reprocessed: sum("reprocessed"),
    asIs: sum("asIs"),
  };
  totals.difference = totals.reprocessed - totals.asIs;
  totals.differencePercent =
    totals.asIs > 0 ? (totals.difference / totals.asIs) * 100 : null;
  totals.differenceWithoutTax = totals.difference + totals.tax;
  if (ranged.length > 0) {
    totals.range = combinedValueRange(rangedFixed, ranged);
  }

  const marketTotal = Object.values(outputValues).reduce((a, b) => a + b, 0);
  const shareByOutput = Object.entries(outputValues)
    .map(([typeID, value]) => ({
      typeID,
      value,
      share: marketTotal > 0 ? value / marketTotal : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const hauling = { asIs: 0, reprocessed: 0 };
  for (const item of result.items) {
    hauling.asIs += item.quantity * volume(item.typeID);
    hauling.reprocessed += item.keptBack * volume(item.typeID);
    for (const [typeID, units] of Object.entries(item.outputs)) {
      hauling.reprocessed += units * volume(typeID);
    }
  }

  return {
    items,
    totals,
    shareByOutput,
    hauling,
    unpriced: price.missing(),
    withoutVolume: volume.missing(),
  };
}

/**
 * Every figure the From minerals answers show for an ore plan: what the ore costs delivered against
 * buying the needed minerals outright, and what the leftovers are worth.
 *
 * @param {ReturnType<import("../engine/reprocess").reprocess>} result - the planned ore, reprocessed
 * @param {Object<string, number>} needs - units wanted, keyed by mineral type id
 * @param {(typeID: string) => number|undefined} priceOf - one unit's price; undefined when unpriced
 * @param {{feePercent?: number, taxPercent?: number, shipping?: {mode: "perVolume"|"fixed",
 *   amount: number}, leftoverPriceOf?: (typeID: string) => number|undefined}} [options]
 * @returns {{ores: Array<Object>, oreCost: number, tax: number, shipping: number, volume: number,
 *   delivered: number, outright: {cost: number, shipping: number, volume: number,
 *   delivered: number}, leftovers: Array<Object>, leftoversValue: number,
 *   leftoversAfterFees: number, net: number, unpriced: Array<string>, withoutVolume: Array<string>}}
 */
export function valueOrePlan(result, needs, priceOf, options = {}) {
  const keep = 1 - (options.feePercent ?? 0) / 100;
  const tax = (options.taxPercent ?? 0) / 100;
  const shipping = options.shipping ?? {
    mode: shippingModes.perVolume,
    amount: 0,
  };
  const price = pricer(priceOf);
  const leftoverPrice = options.leftoverPriceOf
    ? pricer(options.leftoverPriceOf)
    : price;
  const volume = volumeReader();
  const shippingFor = (cubicMetres, anything) =>
    shipping.mode === shippingModes.fixed
      ? anything
        ? shipping.amount
        : 0
      : cubicMetres * shipping.amount;

  const ores = result.items.map((item) => {
    const oreVolume = item.quantity * volume(item.typeID);
    return {
      typeID: item.typeID,
      name: item.name,
      quantity: item.quantity,
      price: price(item.typeID),
      cost: item.quantity * price(item.typeID),
      volume: oreVolume,
      shipping:
        shipping.mode === shippingModes.perVolume
          ? oreVolume * shipping.amount
          : 0,
      gives: item.outputs,
    };
  });
  const oreCost = ores.reduce((total, ore) => total + ore.cost, 0);
  const oreVolume = ores.reduce((total, ore) => total + ore.volume, 0);
  const oreTax = valueOf(result.outputs, price) * tax;
  const oreShipping = shippingFor(oreVolume, ores.length > 0);

  let outrightCost = 0;
  let outrightVolume = 0;
  for (const [typeID, units] of Object.entries(needs)) {
    outrightCost += units * price(typeID);
    outrightVolume += units * volume(typeID);
  }
  const outrightShipping = shippingFor(
    outrightVolume,
    Object.keys(needs).length > 0,
  );

  const leftovers = Object.entries(result.outputs)
    .map(([typeID, units]) => {
      const left = units - (needs[typeID] ?? 0);
      return left > 0
        ? { typeID, units: left, value: left * leftoverPrice(typeID) }
        : null;
    })
    .filter(Boolean);
  const leftoversValue = leftovers.reduce(
    (total, left) => total + left.value,
    0,
  );
  const delivered = oreCost + oreTax + oreShipping;

  return {
    ores,
    oreCost,
    tax: oreTax,
    shipping: oreShipping,
    volume: oreVolume,
    delivered,
    outright: {
      cost: outrightCost,
      shipping: outrightShipping,
      volume: outrightVolume,
      delivered: outrightCost + outrightShipping,
    },
    leftovers,
    leftoversValue,
    leftoversAfterFees: leftoversValue * keep,
    net: delivered - leftoversValue * keep,
    unpriced: [...new Set([...price.missing(), ...leftoverPrice.missing()])],
    withoutVolume: volume.missing(),
  };
}

/**
 * What each output costs when bought as this ore: the cost of the units reprocessed, shared across
 * the outputs by market value.
 *
 * @param {Object} item - a `reprocess` result item
 * @param {number} orePrice
 * @param {(typeID: string) => number} price
 * @returns {Object<string, number|null>}
 */
function costAsThisOre(item, orePrice, price) {
  const oreCost = (item.quantity - item.keptBack) * orePrice;
  const marketValue = valueOf(item.outputs, price);
  const costs = {};
  for (const [typeID, units] of Object.entries(item.outputs)) {
    costs[typeID] =
      units > 0 && marketValue > 0
        ? (oreCost * ((units * price(typeID)) / marketValue)) / units
        : null;
  }
  return costs;
}

/**
 * A run's market-value range carried through fees and tax, with the kept-back units added.
 *
 * @param {ReturnType<typeof randomOutputValue>} value
 * @param {number} scale - what is kept of each ISK of market value
 * @param {number} keptBackValue
 * @returns {ReturnType<typeof randomOutputValue>}
 */
function afterFeesAndTax(value, scale, keptBackValue) {
  const carry = (amount) => amount * scale + keptBackValue;
  const ends = ({ low, high }) => {
    const [a, b] = [carry(low), carry(high)];
    return { low: Math.min(a, b), high: Math.max(a, b) };
  };
  return {
    expected: carry(value.expected),
    spread: value.spread * Math.abs(scale),
    likely: ends(value.likely),
    bounds: ends(value.bounds),
    shareAbove: (amount) => {
      if (scale === 0) return Number(keptBackValue > amount);
      const share = value.shareAbove((amount - keptBackValue) / scale);
      return scale > 0 ? share : 1 - share;
    },
  };
}

/**
 * The market value of a set of units keyed by type id.
 *
 * @param {Object<string, number>} units
 * @param {(typeID: string) => number} price
 * @returns {number}
 */
function valueOf(units, price) {
  return Object.entries(units).reduce(
    (total, [typeID, count]) => total + count * price(typeID),
    0,
  );
}

/**
 * A price reader that answers 0 for a type with no price — a market with no orders reads 0 — and
 * remembers which types those were.
 *
 * @param {(typeID: string) => number|undefined} priceOf
 * @returns {((typeID: string) => number) & {missing: () => Array<string>}}
 */
function pricer(priceOf) {
  const missing = new Set();
  const read = (typeID) => {
    const found = priceOf(String(typeID));
    if (!isPriced(found)) {
      missing.add(String(typeID));
      return 0;
    }
    return found;
  };
  read.missing = () => [...missing];
  return read;
}

/**
 * A volume reader over the reprocessing file that answers 0 for a type it holds no volume for and
 * remembers which those were.
 *
 * @returns {((typeID: string) => number) & {missing: () => Array<string>}}
 */
function volumeReader() {
  const missing = new Set();
  const read = (typeID) => {
    const found = volumeOf(typeID);
    if (found === undefined) {
      missing.add(String(typeID));
      return 0;
    }
    return found;
  };
  read.missing = () => [...missing];
  return read;
}
