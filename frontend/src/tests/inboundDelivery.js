import { vi } from "vitest";

/**
 * A websocketSync slice that keeps the positions it is given, so a test replaying
 * deliveries sees a redelivery recognised the way the store recognises one.
 *
 * @param {Record<string, number>} [positions]
 * @returns {object}
 */
export function keptPositions(positions = {}) {
  return {
    positions,
    actions: {
      getPosition: (docKey) => positions[docKey] ?? 0,
      getHighestPosition: () => Math.max(0, ...Object.values(positions)),
      setPosition: vi.fn((docKey, position) => {
        positions[docKey] = position;
      }),
      setPositionBatch: vi.fn((entries) => {
        for (const [docKey, position] of entries) positions[docKey] = position;
      }),
      forgetCollection: vi.fn(),
      reset: vi.fn(),
    },
  };
}

/**
 * A jobData slice that holds jobs in memory, so what an inbound change applied can
 * be read back as the store would hold it.
 *
 * @param {{jobs: object[]}} held - Replaced in place as jobs are applied or removed
 * @returns {object}
 */
export function heldJobs(held) {
  return {
    jobArray: [],
    pendingJobDocumentWrites: {},
    actions: {
      updateOrAddJobsToJobArray: vi.fn((jobs) => {
        for (const job of jobs) {
          held.jobs = [
            ...held.jobs.filter((one) => one.jobID !== job.jobID),
            job,
          ];
        }
      }),
      removeJobsFromJobArray: vi.fn((jobIDs) => {
        held.jobs = held.jobs.filter((job) => !jobIDs.includes(job.jobID));
      }),
      findJobInJobArray: (jobID) =>
        held.jobs.find((job) => job.jobID === jobID),
      addPendingInboundNewJobSkeleton: vi.fn(),
      removePendingInboundNewJobSkeletons: vi.fn(),
      clearPendingJobDocumentWrites: vi.fn(),
    },
  };
}

/**
 * Stubs for every document handler that is not about jobs, so a test of the job
 * path through the document dispatch reaches nothing else.
 *
 * @returns {Record<string, Function>}
 */
export function otherDocumentHandlers() {
  return {
    handleUserJobGroupUpsert: vi.fn(),
    handleUserJobGroupDelete: vi.fn(),
    handleApplicationSettingsDocumentUpsert: vi.fn(),
    handleApplicationSettingsDocumentDelete: vi.fn(),
    handleUsersDocumentUpsert: vi.fn(),
    handleUsersDocumentDelete: vi.fn(),
    handleWatchlistDeprecatedUpsert: vi.fn(),
    handleWatchlistDeprecatedDelete: vi.fn(),
    handlePlannerSettingsUpsert: vi.fn(),
    handlePlannerSettingsDelete: vi.fn(),
  };
}
