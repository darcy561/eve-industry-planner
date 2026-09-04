import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const ARCHIVED_JOBS_PATH = "/api/v1/archived-jobs";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 350;

/**
 * Reads a private archived-jobs endpoint and returns its parsed body.
 *
 * Returns `null` on failure, matching the other private endpoint modules: these
 * feed views that render an empty state rather than surfacing an error.
 *
 * @param {string} url
 * @param {string} requestName
 */
async function readArchive(url, requestName) {
  try {
    const response = await requestWithPrivateHeaders(
      url,
      { method: "GET" },
      {
        requestName,
        retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `${requestName}: ${response.status} ${response.statusText}`,
        errorText,
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`${requestName}:`, error);
    return null;
  }
}

/**
 * A page of the account's archived jobs.
 *
 * GET `/api/v1/archived-jobs` (private; the account comes from the session).
 *
 * Either range bound may be given alone, unlike the statistics views: the range
 * narrows the archive rather than defining the window a view is built over.
 *
 * @param {{from?: string, to?: string, typeID?: number, groupID?: string,
 *          search?: string, sort?: string, order?: string, limit?: number,
 *          offset?: number}} [options]
 * @returns {Promise<{filters: Object, paging: Object, jobs: Object[]}|null>}
 */
export async function getArchivedJobs(options = {}) {
  const params = new URLSearchParams();
  for (const key of [
    "from",
    "to",
    "typeID",
    "groupID",
    "search",
    "sort",
    "order",
    "limit",
    "offset",
  ]) {
    const value = options[key];
    if (value != null && value !== "") params.set(key, String(value));
  }

  const query = params.toString();
  return readArchive(
    query ? `${ARCHIVED_JOBS_PATH}?${query}` : ARCHIVED_JOBS_PATH,
    "getArchivedJobs",
  );
}

/**
 * One archived job in full.
 *
 * GET `/api/v1/archived-jobs/{jobID}`. A job owned by another account reads as
 * not found rather than forbidden.
 *
 * @param {string} jobID
 * @returns {Promise<{job: Object}|null>}
 */
export async function getArchivedJob(jobID) {
  if (!jobID) return null;
  return readArchive(
    `${ARCHIVED_JOBS_PATH}/${encodeURIComponent(jobID)}`,
    "getArchivedJob",
  );
}

/** What a restore can address. */
export const RESTORE_SCOPES = {
  JOB: "job",
  GROUP: "group",
  RELATED: "related",
};

/**
 * The path of one action against a job, a group, or a related set.
 *
 * Restore and filing address the same three selections, and the server routes
 * them the same way, so the shape is written once: a set names its container,
 * and a job names itself.
 *
 * @param {"job"|"group"|"related"} scope
 * @param {string} id
 * @param {"restore"|"filing"} action
 */
function archivedJobsActionPath(scope, id, action) {
  const encoded = encodeURIComponent(id);
  if (scope === RESTORE_SCOPES.GROUP) {
    return `${ARCHIVED_JOBS_PATH}/groups/${encoded}/${action}`;
  }
  if (scope === RESTORE_SCOPES.RELATED) {
    return `${ARCHIVED_JOBS_PATH}/related/${encoded}/${action}`;
  }
  return `${ARCHIVED_JOBS_PATH}/${encoded}/${action}`;
}

/**
 * Returns archived jobs to the planner.
 *
 * POST, because it creates planner documents and deletes archived ones. The
 * whole sequence runs server-side, so a failure leaves the archive intact rather
 * than a job stranded between the two.
 *
 * Not retried: the call is not idempotent from a caller's point of view, and a
 * second attempt after a timeout could restore a job the first attempt already
 * returned.
 *
 * @param {"job"|"group"|"related"} scope
 * @param {string} id - job id, or group id for the group scope
 * @returns {Promise<{restoredJobIDs: string[], conflicts?: Object[],
 *                    group?: Object, unresolved?: string[]}|null>}
 */
export async function restoreArchivedJobs(scope, id) {
  if (!id) return null;

  try {
    const response = await requestWithPrivateHeaders(
      archivedJobsActionPath(scope, id, "restore"),
      { method: "POST" },
      { requestName: "restoreArchivedJobs" },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `restoreArchivedJobs: ${response.status} ${response.statusText}`,
        errorText,
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("restoreArchivedJobs:", error);
    return null;
  }
}

/**
 * Files archived figures under months of the user's choosing: one job, or every
 * job in a group or related set.
 *
 * PATCH `/api/v1/archived-jobs/…/filing`. A month is `YYYY-MM`; `null` returns
 * that side to what the server derives, and an omitted field leaves it as it was.
 *
 * Income the market recorded is not movable. Naming one such job is refused with
 * 409; naming a set files what it can and reports `salesLockedByMarket`, because
 * refusing a whole group over one market sale would make bulk filing useless.
 *
 * @param {"job"|"group"|"related"} scope
 * @param {string} id - job id, or the group or related set id
 * @param {{costMonth?: string|null, salesMonth?: string|null}} months
 * @returns {Promise<{jobIDs: string[], salesLockedByMarket?: number}|{error: string}|null>}
 */
export async function fileArchivedJobMonths(scope, id, months) {
  if (!id) return null;

  try {
    const response = await requestWithPrivateHeaders(
      archivedJobsActionPath(scope, id, "filing"),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(months ?? {}),
      },
      { requestName: "fileArchivedJobMonths" },
    );

    if (response.status === 409) {
      return { error: "This job's sales came from the market, so their month cannot be changed." };
    }
    if (!response.ok) {
      console.error(
        `fileArchivedJobMonths: ${response.status} ${response.statusText}`,
        await response.text(),
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("fileArchivedJobMonths:", error);
    return null;
  }
}
