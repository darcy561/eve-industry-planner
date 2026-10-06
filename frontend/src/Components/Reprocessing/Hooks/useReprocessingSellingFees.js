import { useMemo } from "react";

import { useSellingRates } from "../../../Hooks/React Query/Character/useSellingRates";
import { resolveSaleLocation } from "../../../Functions/MarketOrders/saleLocations";
import {
  sellingFeesFrom,
  signedOutSellingFees,
} from "../../../Functions/Reprocessing/valuation/sellingFees";

/**
 * The selling fees the page values outputs at: the seller's own rates where there is a seller, and
 * typed rates — defaulting to every skill at its highest — where there is not.
 *
 * @param {string} marketID - the market the page prices against, where the outputs are sold
 * @param {string|null} sellerHash - the seller character, chosen apart from the reprocessing one
 * @param {{brokerFee: number, salesTax: number}|null} [typedRates] - what a signed-out reader typed
 * @returns {{brokerFee: number, salesTax: number, feePercent: number, typed: boolean,
 *   isLoading: boolean}}
 */
export function useReprocessingSellingFees(marketID, sellerHash, typedRates) {
  const saleLocation = useMemo(
    () => resolveSaleLocation(null, marketID),
    [marketID],
  );
  const { data: rates, isError } = useSellingRates(
    sellerHash ? saleLocation : null,
    sellerHash ?? null,
  );
  const isLoading = Boolean(sellerHash && saleLocation && !rates && !isError);

  return useMemo(() => {
    if (!sellerHash) {
      return {
        ...(typedRates
          ? sellingFeesFrom(typedRates)
          : signedOutSellingFees(saleLocation)),
        typed: true,
        isLoading: false,
      };
    }
    if (!rates) {
      return {
        ...signedOutSellingFees(saleLocation),
        typed: false,
        isLoading,
      };
    }
    return {
      ...sellingFeesFrom({
        brokerFee: rates.brokerFee.rate,
        salesTax: rates.salesTax.rate,
      }),
      typed: false,
      isLoading: false,
    };
  }, [sellerHash, typedRates, saleLocation, rates, isLoading]);
}
