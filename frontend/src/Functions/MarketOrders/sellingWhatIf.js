import { brokerFeeRates } from "../../Context/defaultValues";
import {
  brokerFeeAmount,
  salesTaxAmount,
  salesTaxRateAt,
} from "./sellingRates";
import { SALE_LOCATION_KIND } from "./saleLocations";

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
 * What a market skill at an imagined level would be worth: each charge at that level, and what it
 * saves against today, re-derived from the working the rates already came with.
 *
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
  const taxRate = salesTaxRateAt(proposed?.accounting ?? 0);

  const feeNow = brokerFeeAmount(brokerFee?.rate ?? 0, listedValue);
  const taxNow = salesTaxAmount(salesTax?.rate ?? 0, listedValue);
  const feeThen = brokerFeeAmount(feeRate, listedValue);
  const taxThen = salesTaxAmount(taxRate, listedValue);

  const saved = feeNow - feeThen + (taxNow - taxThen);

  return {
    brokerFee: { rate: feeRate, amount: feeThen, saved: feeNow - feeThen },
    salesTax: { rate: taxRate, amount: taxThen, saved: taxNow - taxThen },
    saved,
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
