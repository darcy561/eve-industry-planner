/**
 * Serialise the jobs of a group into a v1 group-template payload (+ POST metadata).
 */

/**
 * @param {import("../../Classes/jobSetup").default} setup
 * @returns {object}
 */
export function setupToPresetRow(setup) {
  return {
    runCount: setup.runCount,
    jobCount: setup.jobCount,
    ME: setup.ME,
    TE: setup.TE,
    rigID: setup.rigID,
    structureID: setup.structureID,
    systemTypeID: setup.systemTypeID,
    systemID: setup.systemID,
    taxValue: setup.taxValue,
    customStructureID: setup.customStructureID ?? "",
    ...(setup.selectedCharacter
      ? { characterToUse: setup.selectedCharacter }
      : {}),
  };
}

/**
 * Sum of (runCount * jobCount) * itemsProducedPerRun across setups on the job.
 *
 * @param {import("../../Classes/job").default} job
 * @returns {number}
 */
export function expectedTotalFromSetups(job) {
  const perRun = job.itemsProducedPerRun || 0;
  let sum = 0;
  for (const s of Object.values(job.build?.setup || {})) {
    sum += (s.runCount || 0) * (s.jobCount || 0) * perRun;
  }
  return sum;
}

/**
 * @param {import("../../Classes/job.js").default} job
 * @param {Map<string, string>} jobIdToTemplateId
 * @returns {string[]}
 */
function mapParentIdsForJob(job, jobIdToTemplateId) {
  const inGroup = new Set(jobIdToTemplateId.keys());
  const out = [];
  for (const pid of job.parentJobs || []) {
    if (!inGroup.has(pid)) continue;
    const tid = jobIdToTemplateId.get(pid);
    if (tid) out.push(tid);
  }
  return out;
}

/**
 * @param {import("../../Classes/job").default} job
 * @param {Map<string, string>} jobIdToTemplateId
 * @returns {Record<string, string[]>}
 */
function mapChildLinks(job, jobIdToTemplateId) {
  const inGroup = new Set(jobIdToTemplateId.keys());
  /** @type {Record<string, string[]>} */
  const out = {};
  const childJobs = job.build?.childJobs || {};
  for (const [matKey, childArr] of Object.entries(childJobs)) {
    const mapped = (childArr || [])
      .filter((cid) => inGroup.has(cid))
      .map((cid) => jobIdToTemplateId.get(cid))
      .filter(Boolean);
    if (mapped.length) {
      out[String(matKey)] = mapped;
    }
  }
  return out;
}

/**
 * Detect cycle in parent graph (template ids).
 *
 * @param {Map<string, string[]>} templateIdToParents — templateJobId -> parent template ids
 */
export function hasParentCycle(templateIdToParents) {
  const visiting = new Set();
  const visited = new Set();

  function dfs(id) {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const p of templateIdToParents.get(id) || []) {
      if (dfs(p)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const id of templateIdToParents.keys()) {
    if (dfs(id)) return true;
  }
  return false;
}

/**
 * @param {object} input
 * @param {string} input.groupID
 * @param {import("../../Classes/job").default[]} input.jobs — jobs belonging to `groupID` (same as group.includedJobIDs)
 * @param {string} [input.name]
 * @param {string} [input.description]
 * @returns {{ name: string, description: string, payload: { source?: object, jobs: object[] } }}
 */
export function serialiseGroupToTemplatePayload({
  groupID,
  jobs,
  name = "Untitled template",
  description = "",
}) {
  if (!groupID || !jobs?.length) {
    throw new Error("Group must include at least one job to save as a template.");
  }

  const jobIds = jobs.map((j) => j.jobID);
  const jobIdSet = new Set(jobIds);

  for (const j of jobs) {
    for (const pid of j.parentJobs || []) {
      if (pid && !jobIdSet.has(pid)) {
        throw new Error(
          `Job ${j.jobID} references a parent outside this group; remove or include that job first.`
        );
      }
    }
    const cj = j.build?.childJobs || {};
    for (const ids of Object.values(cj)) {
      for (const cid of ids || []) {
        if (cid && !jobIdSet.has(cid)) {
          throw new Error(
            `Job ${j.jobID} references a child outside this group; remove or include that job first.`
          );
        }
      }
    }
  }

  const jobIdToTemplateId = new Map(
    jobIds.map((id, i) => [id, `tj-${String(i + 1).padStart(3, "0")}`])
  );

  const templateIdToParents = new Map();
  const nodes = [];

  for (const job of jobs) {
    const templateJobId = jobIdToTemplateId.get(job.jobID);
    const parentTemplateJobIds = mapParentIdsForJob(job, jobIdToTemplateId);
    templateIdToParents.set(templateJobId, parentTemplateJobIds);

    const setups = Object.values(job.build?.setup || {}).map(setupToPresetRow);
    if (!setups.length) {
      throw new Error(`Job ${job.name || job.jobID} has no setups to capture.`);
    }

    const persistedTotal = Math.round(job.build?.products?.totalQuantity ?? 0);
    const fromSetups = Math.round(expectedTotalFromSetups(job));
    if (fromSetups !== persistedTotal) {
      throw new Error(
        `Quantity mismatch for "${job.name}": setups imply ${fromSetups} but job total is ${persistedTotal}. Adjust setups before saving.`
      );
    }

    nodes.push({
      templateJobId,
      itemID: job.itemID,
      jobType: job.jobType,
      name: job.name || "",
      desiredTotalQuantity: persistedTotal,
      parentTemplateJobIds,
      childLinksByMaterialTypeId: mapChildLinks(job, jobIdToTemplateId),
      presetSetups: setups,
    });
  }

  if (hasParentCycle(templateIdToParents)) {
    throw new Error("Circular parent links detected in this group.");
  }

  return {
    name,
    description,
    payload: {
      source: {
        groupID,
        capturedAt: new Date().toISOString(),
      },
      jobs: nodes,
    },
  };
}
