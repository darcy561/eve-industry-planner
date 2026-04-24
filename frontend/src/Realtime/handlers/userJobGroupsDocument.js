/**
 * Change-stream handlers for `user_job_groups` collection.
 */

import Group from "../../Classes/group.js";
import useUsersStore from "../../Zustand/usersStore.js";
import { releaseJobsAfterGroupRemoved } from "../../Functions/Groups/releaseJobsAfterGroupRemoved.js";

/**
 * @param {{
 *   docID: string;
 *   docKey: string;
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 * }} ctx
 */
export async function handleUserJobGroupDelete(ctx) {
  const { docID, docKey, rs } = ctx;
  const { groupArray } = useUsersStore.getState().jobData;
  const actions = useUsersStore.getState().jobData.actions;
  const chosenGroup = groupArray.find((g) => g.groupID === docID);

  if (!chosenGroup) {
    // Group row may already be gone locally; jobs can still have this groupID — release by ID.
    await releaseJobsAfterGroupRemoved({ groupID: docID });
    actions.clearActiveGroupIfMatches(docID);
    window.dispatchEvent(
      new CustomEvent("eip-group-deleted-remotely", {
        detail: { groupID: docID },
      })
    );
    actions.clearPendingJobGroupWrites(docID);
    void import("../syncJobGroupWebSocketSubscriptions.js").then((m) =>
      m.syncJobGroupWebSocketSubscriptions()
    );
    rs.setCursorMs(docKey, Date.now());
    return;
  }

  await releaseJobsAfterGroupRemoved(chosenGroup);

  actions.clearActiveGroupIfMatches(docID);

  const next = groupArray.filter((g) => g.groupID !== docID);
  if (next.length === groupArray.length) {
    rs.setCursorMs(docKey, Date.now());
    return;
  }

  window.dispatchEvent(
    new CustomEvent("eip-group-deleted-remotely", {
      detail: { groupID: docID },
    })
  );

  actions.replaceGroupArray(next, { skipRealtimeResync: true });
  actions.clearPendingJobGroupWrites(docID);
  void import("../syncJobGroupWebSocketSubscriptions.js").then((m) =>
    m.syncJobGroupWebSocketSubscriptions()
  );
  rs.setCursorMs(docKey, Date.now());
}

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   docID: string;
 *   document: Record<string, unknown>;
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 *   remoteMs: number;
 * }} ctx
 */
export function handleUserJobGroupUpsert(ctx) {
  const { docID, docKey, document, rs, remoteMs } = ctx;
  const gid =
    typeof document.groupID === "string" && document.groupID
      ? document.groupID
      : docID;

  const merged = { ...document, groupID: gid };
  const instance = new Group(merged);

  const { groupArray } = useUsersStore.getState().jobData;
  const actions = useUsersStore.getState().jobData.actions;
  const idx = groupArray.findIndex((g) => g.groupID === gid);
  const copy = [...groupArray];
  const wasNew = idx < 0;
  if (idx >= 0) {
    copy[idx] = instance;
  } else {
    copy.push(instance);
  }
  actions.replaceGroupArray(copy, { skipRealtimeResync: true });
  if (wasNew) {
    void import("../syncJobGroupWebSocketSubscriptions.js").then((m) =>
      m.syncJobGroupWebSocketSubscriptions()
    );
  }
  actions.clearPendingJobGroupWrites(gid);
  rs.setCursorMs(docKey, remoteMs);
}
