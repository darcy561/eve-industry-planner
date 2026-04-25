/**
 * Shared helpers for job step navigation rules.
 */

/**
 * Returns the last step index for a step list length.
 *
 * @param {number} stepCount
 * @returns {number}
 */
export function getLastStepIndex(stepCount) {
  return Math.max(Number(stepCount) - 1, 0);
}

/**
 * Whether this job should be blocked from entering the final stage.
 *
 * @param {Object} job
 * @returns {boolean}
 */
export function isFinalStepLockedForJob(job) {
  return Boolean(job?.includedInGroup && !job?.isReadyToSell);
}

/**
 * Whether a job can move backward.
 *
 * @param {Object} job
 * @returns {boolean}
 */
export function canMoveJobBackward(job) {
  return Boolean(job && Number(job.jobStatus) > 0);
}

/**
 * Whether a job can move forward.
 *
 * @param {Object} job
 * @param {Object} [options]
 * @param {number} [options.lastStepIndex=4]
 * @param {boolean} [options.lockFinalStep=false]
 * @returns {boolean}
 */
export function canMoveJobForward(
  job,
  { lastStepIndex = 4, lockFinalStep = false } = {}
) {
  if (!job) return false;
  const currentStep = Number(job.jobStatus) || 0;
  if (currentStep >= lastStepIndex) return false;
  if (lockFinalStep && currentStep >= lastStepIndex - 1) return false;
  return true;
}

/**
 * Whether a jump-to-step action is allowed.
 *
 * @param {Object} job
 * @param {number} targetStep
 * @param {Object} [options]
 * @param {number} [options.lastStepIndex=4]
 * @param {boolean} [options.lockFinalStep=false]
 * @returns {boolean}
 */
export function canJumpToJobStep(
  job,
  targetStep,
  { lastStepIndex = 4, lockFinalStep = false } = {}
) {
  if (!job) return false;
  const currentStep = Number(job.jobStatus) || 0;
  if (targetStep === currentStep) return false;
  if (targetStep < 0 || targetStep > lastStepIndex) return false;
  if (lockFinalStep && targetStep === lastStepIndex) return false;
  return true;
}
