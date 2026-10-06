import { brokerFeeRates, maxSkillLevel } from "../../../Context/defaultValues";
import { SALE_LOCATION_KIND } from "../../MarketOrders/saleLocations";
import { sellingWhatIf } from "../../MarketOrders/sellingWhatIf";

/**
 * The selling fees valuation charges, from a broker fee and a sales tax as percentages: the two
 * apart, and together as `feePercent`.
 *
 * @param {{brokerFee: number, salesTax: number}} rates
 * @returns {{brokerFee: number, salesTax: number, feePercent: number}}
 */
export function sellingFeesFrom({ brokerFee, salesTax }) {
  return { brokerFee, salesTax, feePercent: brokerFee + salesTax };
}

/**
 * What a reader with no character pays to sell at a location: every market skill at its highest
 * level and no standings, or a citadel owner's own rate.
 *
 * @param {import("../../MarketOrders/saleLocations").SaleLocation|null} saleLocation
 * @returns {{brokerFee: number, salesTax: number, feePercent: number}}
 */
export function signedOutSellingFees(saleLocation) {
  const working =
    saleLocation?.kind === SALE_LOCATION_KIND.CITADEL
      ? {
          kind: SALE_LOCATION_KIND.CITADEL,
          base: null,
          terms: [],
          rate: saleLocation.brokerFee ?? 0,
        }
      : {
          kind: SALE_LOCATION_KIND.NPC_STATION,
          base: brokerFeeRates.base,
          terms: [],
          rate: brokerFeeRates.base,
        };
  const { brokerFee, salesTax } = sellingWhatIf({
    brokerFee: working,
    salesTax: null,
    proposed: { brokerRelations: maxSkillLevel, accounting: maxSkillLevel },
  });
  return sellingFeesFrom({
    brokerFee: brokerFee.rate,
    salesTax: salesTax.rate,
  });
}
