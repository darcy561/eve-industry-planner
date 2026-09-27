import MarketOrder from "../../Classes/marketOrder";

/**
 * Brings a job's linked market orders up to date with what ESI last returned.
 *
 * @param {object} job
 * @param {Array<Object>} latestESIOrders - Market orders as ESI last returned them
 * @returns {boolean} Whether any row took an update
 */
export default function applyLatestOrderData(job, latestESIOrders) {
  if (!job || !latestESIOrders?.length) return false;

  let changed = false;
  for (const [id, row] of Object.entries(job.esi.marketOrders)) {
    const reported = latestESIOrders.filter(
      (candidate) => candidate.order_id === row.order_id,
    );
    if (reported.length === 0) continue;

    const latest = reported.find((o) => o.is_corporation) || reported[0];
    const order = new MarketOrder(row);
    if (order.applyLatest(latest)) {
      job.esi.marketOrders[id] = order.toDocument();
      changed = true;
    }
  }
  return changed;
}
