/**
 * Job groups: `account_job_groups` collection (private API).
 */
import Group from "../../../Classes/group.js";
import useUsersStore from "../../../Zustand/usersStore.js";
import {
  requestWithPrivateHeaders,
  privateBatchRetryConfig,
} from "./applyPrivateHeaders.js";

/** Must match `mongocore.CollectionUserJobGroups` / changestream `collection` field. */
export const USER_JOB_GROUPS_COLLECTION = "account_job_groups";

/** Kept in sync with Go `PutGroupsHandler` (`maxBatchSize`). */
const MAX_PUT_JOB_GROUPS_BATCH = 100;

/** Kept in sync with Go `DeleteGroupsHandler` (`maxBatchSize`). */
const MAX_DELETE_JOB_GROUPS_BATCH = 200;

/**
 * Fetches all job groups for the account and replaces `jobData.groupArray`.
 */
export async function fetchJobGroupsFromApi() {
  const url = new URL("/api/v1/groups", window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    { requestName: "getJobGroups" }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /api/v1/groups failed: ${res.status} ${text || res.statusText}`
    );
  }
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  const groupArray = rows.map((row) => new Group(normalizeGroupApiRow(row)));
  useUsersStore
    .getState()
    .jobData.actions.replaceGroupArray(groupArray, { fromServer: true });

  const newLinkedOrderIDs = new Set();
  const newLinkedJobIDs = new Set();
  const newLinkedTransIDs = new Set();
  for (const g of groupArray) {
    g.linkedJobIDs?.forEach((id) => newLinkedJobIDs.add(id));
    g.linkedOrderIDs?.forEach((id) => newLinkedOrderIDs.add(id));
    g.linkedTransIDs?.forEach((id) => newLinkedTransIDs.add(id));
  }
  useUsersStore.getState().account.actions.addLinkedEsiData({
    ordersToAdd: newLinkedOrderIDs,
    jobsToAdd: newLinkedJobIDs,
    transactionsToAdd: newLinkedTransIDs,
  });
}

/**
 * Normalises Mongo/API JSON into the shape {@link Group} expects.
 * @param {Record<string, unknown>} row
 */
export function normalizeGroupApiRow(row) {
  if (!row || typeof row !== "object") return {};
  const meta = /** @type {Record<string, unknown>|undefined} */ (row._meta);
  const out = { ...row };
  if (meta && typeof meta === "object") {
    const cleaned = { ...meta };
    delete cleaned.buildVer;
    out._meta = cleaned;
  }
  return out;
}

/**
 * Deletes job group documents (`DELETE /api/v1/groups`).
 * Sends `X-WS-Client-ID` when connected so the server can allow deletes when this session holds the lock.
 *
 * @param {string[]} groupIDs
 */
export async function deleteJobGroupsFromApi(groupIDs) {
  const ids = [...new Set(groupIDs.filter(Boolean))];
  if (ids.length === 0) return;

  await requestWithPrivateHeaders(
    "/api/v1/groups",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupIDs: ids }),
    },
    {
      requestName: "deleteJobGroups",
      retry: privateBatchRetryConfig,
      batch: {
        size: MAX_DELETE_JOB_GROUPS_BATCH,
        arrayKey: "groupIDs",
        failure: "first",
      },
    }
  );
}

/**
 * Batch upsert groups (`PUT /api/v1/groups`).
 * @param {unknown[]} groupsPayload
 */
export async function putJobGroupsBatch(groupsPayload) {
  if (!groupsPayload || groupsPayload.length === 0) return;

  await requestWithPrivateHeaders(
    "/api/v1/groups",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: groupsPayload }),
    },
    {
      requestName: "putJobGroups",
      retry: privateBatchRetryConfig,
      batch: {
        size: MAX_PUT_JOB_GROUPS_BATCH,
        arrayKey: "groups",
        errorLabel: "PUT /api/v1/groups",
      },
    }
  );
}
