import { useJobDraft } from "./useJobDraft";
import {
  averageSalePriceOf,
  brokersFeesOf,
  salesOf,
  taxOutstandingOn,
  transactionFeesOf,
} from "./jobSelectors";

/**
 * What selling the job has come to: what the listings and the sales were
 * charged, what is still expected, and what came in.
 *
 * The orders and the sales are named on their own, so a change to the build is
 * nothing to a panel reading these.
 *
 * @returns {{brokersFees: number, transactionFees: number,
 *   taxOutstanding: number, sales: number, averageSalePrice: number}}
 */
export function useSellingTotals() {
  const marketOrders = useJobDraft((job) => job.esi.marketOrders);
  const transactions = useJobDraft((job) => job.esi.transactions);
  return {
    brokersFees: brokersFeesOf(marketOrders),
    transactionFees: transactionFeesOf(transactions),
    taxOutstanding: taxOutstandingOn(marketOrders, transactions),
    sales: salesOf(transactions),
    averageSalePrice: averageSalePriceOf(transactions),
  };
}
