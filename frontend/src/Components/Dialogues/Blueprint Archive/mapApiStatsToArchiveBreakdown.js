/**
 * Map Mongo build-stats row JSON (`breakdown` + headline totals) to the shape
 * expected by `ArchiveStatsBreakdown`. Personal and corp rows use the same
 * `breakdown` field names when present.
 *
 * **Combined** is the sum of the three breakdown segments (chain + stock + market), not
 * the headline row alone, so sales/fees/job cost — including unsold and chain builds —
 * stay one consistent roll-up. Net profit is recomputed from those combined totals.
 *
 * @param {object|null|undefined} data - `GET .../build-stats` or `.../corp-build-stats` JSON
 * @returns {object|null}
 */
export function mapApiStatsToArchiveBreakdown(data) {
  if (!data || !data.breakdown) {
    return null;
  }
  const b = data.breakdown;

  const seg = (s) => ({
    totalJobs: Number(s?.totalJobs ?? 0),
    itemBuildCount: Number(s?.itemBuildCount ?? 0),
    jobCostTotal: Number(s?.jobCostTotal ?? 0),
    totalSoldQuantity: Number(s?.totalSoldQuantity ?? 0),
    salesTotal: Number(s?.salesTotal ?? 0),
    brokersFeeTotal: Number(s?.brokersFeeTotal ?? 0),
    transactionFeeTotal: Number(s?.transactionFeeTotal ?? 0),
    profitLoss: Number(s?.profitLoss ?? 0),
    jobType: data.jobType ?? 0,
    typeID: data.typeID ?? 0,
  });

  const productionChain = seg(b.productionChain);
  const retainedFullStock = seg(b.retainedStock);
  const standaloneWithRecordedSale = seg(b.standaloneRecordedSale);

  return {
    productionChain,
    retainedFullStock,
    standaloneWithRecordedSale,
    combined: combinedFromSegmentBuckets(
      productionChain,
      retainedFullStock,
      standaloneWithRecordedSale,
      data,
    ),
  };
}

/**
 * @param {object} chain
 * @param {object} stock
 * @param {object} market
 * @param {object} data - original API row (jobType / typeID only)
 */
function combinedFromSegmentBuckets(chain, stock, market, data) {
  const n = (x) => Number(x ?? 0);
  const totalJobs = n(chain.totalJobs) + n(stock.totalJobs) + n(market.totalJobs);
  const itemBuildCount =
    n(chain.itemBuildCount) + n(stock.itemBuildCount) + n(market.itemBuildCount);
  const jobCostTotal =
    n(chain.jobCostTotal) + n(stock.jobCostTotal) + n(market.jobCostTotal);
  const totalSoldQuantity =
    n(chain.totalSoldQuantity) +
    n(stock.totalSoldQuantity) +
    n(market.totalSoldQuantity);
  const salesTotal =
    n(chain.salesTotal) + n(stock.salesTotal) + n(market.salesTotal);
  const brokersFeeTotal =
    n(chain.brokersFeeTotal) +
    n(stock.brokersFeeTotal) +
    n(market.brokersFeeTotal);
  const transactionFeeTotal =
    n(chain.transactionFeeTotal) +
    n(stock.transactionFeeTotal) +
    n(market.transactionFeeTotal);
  const profitLoss =
    salesTotal - brokersFeeTotal - transactionFeeTotal - jobCostTotal;

  return {
    totalJobs,
    itemBuildCount,
    jobCostTotal,
    totalSoldQuantity,
    salesTotal,
    brokersFeeTotal,
    transactionFeeTotal,
    profitLoss,
    jobType: data.jobType ?? 0,
    typeID: data.typeID ?? 0,
  };
}
