export const BLUEPRINT_JOB_STATE = Object.freeze({
  RUNNING: "running",
  RUNS_OUT: "runsOut",
});

/**
 * The industry jobs running now, keyed by the blueprint each runs on.
 *
 * @param {Array<Object>} [esiJobs]
 * @returns {Map<number, Object>}
 */
export function activeJobsByBlueprint(esiJobs = []) {
  const active = new Map();
  for (const job of esiJobs) {
    if (job?.status === "active") active.set(job.blueprint_id, job);
  }
  return active;
}

/**
 * What a running job is doing to a blueprint: nothing without one, and a copy the job will use up
 * runs out rather than merely being in use.
 *
 * @param {{isCopy: boolean, runs: number}} blueprint
 * @param {Object|null|undefined} esiJob - the active job on it, if any
 * @returns {string|null} One of BLUEPRINT_JOB_STATE
 */
export function blueprintJobState(blueprint, esiJob) {
  if (!esiJob) return null;
  if (blueprint.isCopy && blueprint.runs <= esiJob.runs) {
    return BLUEPRINT_JOB_STATE.RUNS_OUT;
  }
  return BLUEPRINT_JOB_STATE.RUNNING;
}
