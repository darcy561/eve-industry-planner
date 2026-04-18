import { submitFrontendAnalyticsEvent } from "../Functions/Endpoints/Public/frontendAnalytics.js";
import { AppEvent } from "./appEventNames";

/**
 * Records job creations for Grafana (`web.frontend_job_creates_total` by `type_id` = job output itemID).
 * Called from `useJobBuild` / `buildJob` for each built job unless the request set `skipJobCreateAnalytics`.
 *
 * @param {Array<{ itemID?: number }> | { itemID?: number }} jobs - One job or array from `buildJob`
 */
export function trackNewJobsCreated(jobs) {
  const list = Array.isArray(jobs) ? jobs : jobs != null ? [jobs] : [];
  if (list.length === 0) {
    return;
  }
  const byType = {};
  for (const job of list) {
    const id = job?.itemID;
    if (typeof id !== "number" || !Number.isFinite(id) || id < 1) {
      continue;
    }
    const k = String(Math.floor(id));
    byType[k] = (byType[k] || 0) + 1;
  }
  if (Object.keys(byType).length === 0) {
    return;
  }
  void submitFrontendAnalyticsEvent(AppEvent.NEW_JOB, 1, { byType });
}
