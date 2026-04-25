import getAllRelatedJobs from "../../../Functions/Helper/getAllRelatedJobs";

/**
 * Resolves the same data the edit job page would pass to
 * `openJobDependencyTreeDialog` — pool (group or planner), `getAllRelatedJobs`,
 * and edit-navigation hints — so callers can send only a job id + search hints.
 *
 * @param {string|number|undefined} jobId
 * @param {string|null|undefined} searchActiveGroup
 * @param {import("../../../Classes/job").default[]} jobArray
 * @param {(g: string) => object | null | undefined} getGroupObject
 * @returns {null | { jobIds: string[]; depTreeGroupId: string | null; initialFocusJobId: string; activeGroupForEdit: string | null }}
 */
export function resolveEditJobLinkTreePayload(
  jobId,
  searchActiveGroup,
  jobArray,
  getGroupObject
) {
  if (jobId == null || jobId === "" || !jobArray.length) {
    return null;
  }
  const jid = String(jobId);
  const byId = new Map(jobArray.map((j) => [String(j.jobID), j]));
  const me = byId.get(jid);
  if (!me) {
    return null;
  }

  let depTreePool = jobArray;
  let depTreeGroupId = null;
  const gidFromSearch =
    searchActiveGroup != null && String(searchActiveGroup) !== ""
      ? String(searchActiveGroup)
      : null;
  const gidFromJob =
    me.groupID && String(me.groupID) !== "" ? String(me.groupID) : null;
  const gid = gidFromSearch ?? gidFromJob;

  if (gid) {
    const g = getGroupObject(gid);
    if (g) {
      const inGroup = [...g.includedJobIDs]
        .map((id) => byId.get(String(id)))
        .filter(Boolean);
      if (inGroup.some((j) => String(j.jobID) === jid)) {
        depTreePool = inGroup;
        depTreeGroupId = gid;
      }
    }
  }

  const poolSet = new Set(depTreePool.map((j) => String(j.jobID)));
  const allRelated = getAllRelatedJobs(jid);
  let jobIds = [
    ...new Set(
      allRelated
        .map((j) => String(j.jobID))
        .filter((id) => poolSet.has(id))
    ),
  ];
  if (jobIds.length === 0 && poolSet.has(jid)) {
    jobIds = [jid];
  }

  const activeGroupForEdit = gidFromSearch ?? gidFromJob;

  return {
    jobIds,
    depTreeGroupId,
    initialFocusJobId: jid,
    activeGroupForEdit: activeGroupForEdit ?? null,
  };
}
