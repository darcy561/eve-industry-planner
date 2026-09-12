import { LOGIN_STEPS } from "../../Events/loginEvents";
import { bootstrapJobDocumentsLoginStep } from "../../Components/Auth/bootstrapJobDocumentsLoginStep.js";
import { bootstrapJobGroupsLoginStep } from "../../Components/Auth/bootstrapJobGroupsLoginStep.js";
import { bootstrapWatchlistLoginStep } from "../../Components/Auth/bootstrapWatchlistLoginStep.js";

/**
 * The steps a failed login can re-run on their own.
 *
 * A step reports completion by emitting, and `whenLoginComplete()` resolves once all
 * four have — so re-running the one that failed is what releases a route guard still
 * awaiting the login, without re-fetching what the other steps already have.
 *
 * `CHARACTER_DATA` is absent deliberately: `runPostLoginAccountSync` is driven by the
 * `user_document` and `linked_characters` of the login response, which nothing outside
 * that response holds. Retrying it means signing in again, so it keeps the reload.
 */
const RETRYABLE = {
  [LOGIN_STEPS.JOB_PLANNER]: bootstrapJobDocumentsLoginStep,
  [LOGIN_STEPS.GROUP_DATA]: bootstrapJobGroupsLoginStep,
  [LOGIN_STEPS.WATCHLIST_DATA]: bootstrapWatchlistLoginStep,
};

/**
 * @param {string} step - A {@link LOGIN_STEPS} value.
 * @returns {boolean} Whether {@link retryLoginStep} can re-run it.
 */
export function canRetryLoginStep(step) {
  return Object.hasOwn(RETRYABLE, step);
}

/**
 * Re-runs one failed login step.
 *
 * The step owns its own error handling, so this resolves either way; what says whether
 * it worked is the progress state it publishes.
 *
 * @param {string} step - A {@link LOGIN_STEPS} value.
 * @returns {Promise<void>}
 */
export async function retryLoginStep(step) {
  const run = RETRYABLE[step];
  if (!run) return;
  await run();
}
