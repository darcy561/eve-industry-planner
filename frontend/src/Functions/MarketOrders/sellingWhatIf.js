import { brokerFeeRates, salesTaxRates } from "../../Context/defaultValues";
import { brokerFeeAmount, salesTaxAmount } from "./sellingRates";
import { SALE_LOCATION_KIND } from "./saleLocations";

/**
 * What training a market skill would be worth on this job.
 *
 * Answers the only question a training decision actually asks — is it worth it
 * for what I build — without needing the build cost. A market skill moves the
 * charges and nothing else, so the net return improves by exactly what the
 * charges fall by, and break-even falls by that over the units sold.
 *
 * Recomputed from the working the rate already came with rather than fetched
 * again: the standings are the same character's whatever level is imagined.
 */

/**
 * @typedef {object} WhatIfCharge
 * @property {number} rate - Percentage at the imagined level
 * @property {number} amount - ISK at that rate
 * @property {number} saved - ISK less than today; negative where it is more
 */

/**
 * @typedef {object} SellingWhatIf
 * @property {WhatIfCharge} brokerFee
 * @property {WhatIfCharge} salesTax
 * @property {number} saved - What both charges together come to less
 * @property {number|null} breakEvenPerUnit - How much less each unit must fetch
 * @property {boolean} brokerFeeApplies - False at a structure, where the level
 *   changes nothing
 */

/**
 * @param {object} params
 * @param {import("./sellingRates").BrokerFeeWorking} params.brokerFee - Today's working
 * @param {{base: number, accounting: number, rate: number}} params.salesTax - Today's
 * @param {number} params.listedValue - ISK the listing is worth
 * @param {number} params.quantity - Units being sold
 * @param {{brokerRelations: number, accounting: number}} params.proposed - Imagined levels
 * @returns {SellingWhatIf}
 */
export function sellingWhatIf({
  brokerFee,
  salesTax,
  listedValue = 0,
  quantity = 0,
  proposed,
}) {
  const atStructure = brokerFee?.kind === SALE_LOCATION_KIND.CITADEL;

  const feeRate = atStructure
    ? brokerFee.rate
    : rateWithBrokerRelations(brokerFee, proposed?.brokerRelations ?? 0);
  const taxRate = rateWithAccounting(proposed?.accounting ?? 0);

  const feeNow = brokerFeeAmount(brokerFee?.rate ?? 0, listedValue);
  const taxNow = salesTaxAmount(salesTax?.rate ?? 0, listedValue);
  const feeThen = brokerFeeAmount(feeRate, listedValue);
  const taxThen = salesTaxAmount(taxRate, listedValue);

  const saved = feeNow - feeThen + (taxNow - taxThen);

  return {
    brokerFee: { rate: feeRate, amount: feeThen, saved: feeNow - feeThen },
    salesTax: { rate: taxRate, amount: taxThen, saved: taxNow - taxThen },
    saved,
    // A market skill leaves the build cost alone, so the whole saving lands on
    // the return, and break-even falls by its share of one unit.
    breakEvenPerUnit: quantity > 0 ? saved / quantity : null,
    brokerFeeApplies: !atStructure,
  };
}

/**
 * The station rate at an imagined Broker Relations level, keeping the standings
 * the working already resolved.
 *
 * @param {import("./sellingRates").BrokerFeeWorking} working
 * @param {number} level
 * @returns {number} Percentage
 */
function rateWithBrokerRelations(working, level) {
  const standings = (working?.terms ?? [])
    .filter((term) => term.id !== "brokerRelations")
    .reduce((total, term) => total + term.amount, 0);

  return (
    (working?.base ?? brokerFeeRates.base) -
    brokerFeeRates.brokerRelations * level -
    standings
  );
}

/**
 * @param {number} level
 * @returns {number} Percentage
 */
function rateWithAccounting(level) {
  return salesTaxRates.base * (1 - salesTaxRates.accounting * level);
}
