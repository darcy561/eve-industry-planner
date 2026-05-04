import { submitFrontendAnalyticsEvent } from "../Functions/Endpoints/Public/frontendAnalytics.js";

/**
 * Records one product event as server-side OTel metrics (fire-and-forget).
 * GA4 usage (page views only) is handled in `./googleAnalytics.js` + `index.jsx` (subscribe before mount).
 *
 * @param {string} eventKey - Value from `./appEventNames` (`AppEvent`)
 * @param {number} [count=1] - Optional increment (e.g. batch size); ignored for `new_job` (handled inside `buildJob`)
 * @param {{ byType?: Record<string, number> }} [options] - e.g. reserved for events that accept extra fields
 */
export function trackAppEvent(eventKey, count = 1, options) {
  void submitFrontendAnalyticsEvent(eventKey, count, options ?? {});
}
