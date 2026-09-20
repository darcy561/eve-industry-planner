import {
  LOCATION_KIND,
  resolveLocationKind,
} from "../Assets/assetLocationConstants";
import { SALE_LOCATION_KIND, getSaleCitadels } from "./saleLocations";
import {
  brokerFeeAmount,
  brokerFeeRate,
  salesTaxAmount,
  salesTaxWorking,
} from "./sellingRates";
import { ensureSellingRateInputs } from "../../Hooks/React Query/Character/useSellingRateInputs";

/**
 * @typedef {object} SellingCharges
 * @property {number} brokerFee - What listing the order cost, in ISK
 * @property {number} salesTax - What the sale is expected to be taxed, in ISK.
 *   An estimate: the sale has not happened yet, and when it does the transaction
 *   carries the figure EVE actually charged
 */

/**
 * What listing and selling one market order costs.
 *
 * Both charges are worked out here because both are worked out from the same
 * character at the same moment, and the order is linked once. The broker fee has
 * to be calculated — multi-sell charges several orders in one journal entry, so
 * there is no per-order figure to read — while the tax is an estimate standing
 * in until the sale produces a transaction of its own.
 *
 * @param {object} marketOrder
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {number} citadelBrokersFee
 * @returns {Promise<SellingCharges>}
 */
/**
 * The broker fee a reader recorded for the citadel an order was placed at.
 *
 * @param {number} locationID - The order's in-game location
 * @returns {number|undefined} The saved rate, or nothing when none is saved
 */
function savedCitadelFee(locationID) {
  return getSaleCitadels().find(
    (citadel) => citadel.structureID === locationID,
  )?.brokerFee;
}

export default async function calcSellingCharges(
  marketOrder,
  queryClient,
  citadelBrokersFee,
) {
  const atStation =
    resolveLocationKind(marketOrder.location_id) === LOCATION_KIND.STATION;

  // A real order names where it was placed, so its location is turned into the
  // shape the shared rate function reads rather than the rate being worked out a
  // second way here.
  const saleLocation = atStation
    ? {
        kind: SALE_LOCATION_KIND.NPC_STATION,
        feeStationID: marketOrder.location_id,
        brokerFee: null,
      }
    : {
        kind: SALE_LOCATION_KIND.CITADEL,
        feeStationID: null,
        // The rate the reader recorded for this citadel, if they saved it. The
        // account default stands in for a citadel they have not, so the two
        // stages quote one figure wherever the citadel is known to both.
        brokerFee:
          savedCitadelFee(marketOrder.location_id) ?? citadelBrokersFee,
      };

  // Both figures are written to the job, so what they are worked out from has to
  // be there before they are — not left to whichever panel happened to
  // subscribe. An order can be linked from any character on the account,
  // including one nothing else on the page has asked about.
  //
  // Needed whatever the location: a structure sets its own broker fee, but the
  // tax comes from the seller's Accounting wherever the sale happens.
  await ensureSellingRateInputs(queryClient, marketOrder.CharacterHash);

  const value = marketOrder.price * marketOrder.volume_total;

  const rate = await brokerFeeRate(
    saleLocation,
    queryClient,
    marketOrder.CharacterHash,
  );

  return {
    brokerFee: brokerFeeAmount(rate, value),
    salesTax: salesTaxAmount(
      salesTaxWorking(queryClient, marketOrder.CharacterHash).rate,
      value,
    ),
  };
}
