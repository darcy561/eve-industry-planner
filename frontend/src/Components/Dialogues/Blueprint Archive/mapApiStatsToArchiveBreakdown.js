/**
 * Maps a lifetime totals row onto the four blocks the archive dialogue shows.
 *
 * The API serves `breakdown` alongside the headline figures, splitting a type's
 * totals across the three archive segments. A job belongs to exactly one of them,
 * so the segments partition the row rather than overlapping it.
 *
 * `scope` is carried through unused so a corporation view can supply the same
 * shape from its own row later; the segment field names are already shared
 * between the two collections.
 *
 * @param {object|null|undefined} data - one row from `GET /api/v1/statistics/account/totals`
 * @returns {object|null} Blocks for `ArchiveStatsBreakdown`, or null when the row carries no breakdown
 */
export function mapApiStatsToArchiveBreakdown(data) {
  if (!data?.breakdown) {
    return null;
  }
  const segments = data.breakdown;

  const segment = (source) => ({
    totalJobs: Number(source?.totalJobs ?? 0),
    itemBuildCount: Number(source?.itemBuildCount ?? 0),
    jobCostTotal: Number(source?.jobCostTotal ?? 0),
    totalSoldQuantity: Number(source?.totalSoldQuantity ?? 0),
    salesTotal: Number(source?.salesTotal ?? 0),
    brokersFeeTotal: Number(source?.brokersFeeTotal ?? 0),
    transactionFeeTotal: Number(source?.transactionFeeTotal ?? 0),
    profitLoss: Number(source?.profitLoss ?? 0),
    jobType: data.jobType ?? 0,
    typeID: data.typeID ?? 0,
  });

  const productionChain = segment(segments.productionChain);
  const retainedFullStock = segment(segments.retainedStock);
  const standaloneWithRecordedSale = segment(segments.standaloneRecordedSale);

  return {
    productionChain,
    retainedFullStock,
    standaloneWithRecordedSale,
    combined: combineSegments(
      [productionChain, retainedFullStock, standaloneWithRecordedSale],
      data,
    ),
  };
}

/**
 * Sums the three segments into the Combined block.
 *
 * Every field is summed, `profitLoss` included. It is deliberately not recomputed
 * from the summed money fields: `jobCostTotal` already contains both fee totals,
 * so `sales − brokers − transaction − jobCost` would subtract the fees a second
 * time and report a loss against profitable builds. The server applies that
 * definition once, per job, and summing its answers keeps Combined agreeing with
 * the blocks beneath it.
 *
 * @param {object[]} segments
 * @param {object} data - the source row, for the type identifiers only
 */
function combineSegments(segments, data) {
  const sum = (field) =>
    segments.reduce((total, segment) => total + Number(segment[field] ?? 0), 0);

  return {
    totalJobs: sum("totalJobs"),
    itemBuildCount: sum("itemBuildCount"),
    jobCostTotal: sum("jobCostTotal"),
    totalSoldQuantity: sum("totalSoldQuantity"),
    salesTotal: sum("salesTotal"),
    brokersFeeTotal: sum("brokersFeeTotal"),
    transactionFeeTotal: sum("transactionFeeTotal"),
    profitLoss: sum("profitLoss"),
    jobType: data.jobType ?? 0,
    typeID: data.typeID ?? 0,
  };
}
