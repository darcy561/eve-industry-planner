/**
 * Brings a job's linked market orders up to date with what ESI last returned.
 *
 * A corporation order is reported by every character holding the role, and the
 * corporation's own reading is the one that owns it.
 *
 * Each row decides for itself whether the update is worth taking, so an order
 * that has not moved — and one that has already finished — leaves the job
 * untouched rather than marking it modified.
 *
 * @param {import("../../Classes/job").default} job
 * @param {Array<Object>} latestESIOrders - Market orders as ESI last returned them
 * @returns {boolean} Whether any row took an update
 */
export default function applyLatestOrderData(job, latestESIOrders) {
  if (!job || !latestESIOrders?.length) return false;

  let changed = false;
  for (const order of job.build.sale.marketOrders) {
    const reported = latestESIOrders.filter(
      (candidate) => candidate.order_id === order.order_id
    );
    if (reported.length === 0) continue;

    const latest = reported.find((o) => o.is_corporation) || reported[0];
    if (order.applyLatest(latest)) {
      changed = true;
    }
  }
  return changed;
}
