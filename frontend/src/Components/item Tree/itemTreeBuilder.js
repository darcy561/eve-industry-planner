import { buildJob } from "../../Functions/JobPlanner/buildJob";
import buildParentChildRelationships from "../../Functions/Helper/buildParentChildRelationships";
import checkJobTypeIsBuildable from "../../Functions/Helper/checkJobTypeIsBuildable";

function resetJobRelationships(jobs) {
  for (const job of jobs) {
    job.parentJobs = [];
    if (job?.build?.childJobs && typeof job.build.childJobs === "object") {
      for (const key of Object.keys(job.build.childJobs)) {
        job.build.childJobs[key] = [];
      }
    }
  }
}

function collectBuildRequests(frontierJobs, existingTypeIds) {
  const requestsByType = new Map();
  for (const parent of frontierJobs) {
    const mats = Array.isArray(parent?.build?.materials) ? parent.build.materials : [];
    for (const mat of mats) {
      if (!checkJobTypeIsBuildable(mat?.jobType)) continue;
      const typeID = mat?.typeID;
      if (!typeID || existingTypeIds.has(typeID)) continue;
      const existing = requestsByType.get(typeID);
      if (existing) {
        existing.itemQty += Number(mat.quantity || 0);
        existing.parentJobs.add(String(parent.jobID));
      } else {
        requestsByType.set(typeID, {
          itemID: typeID,
          itemQty: Number(mat.quantity || 0) || 1,
          parentJobs: new Set([String(parent.jobID)]),
          skipJobCreateAnalytics: true,
        });
      }
    }
  }
  return [...requestsByType.values()].map((r) => ({
    ...r,
    parentJobs: [...r.parentJobs],
  }));
}

export async function buildItemTreeLocally({
  jobs,
  queryClient,
  buildFullTree = false,
  maxDepth = 30,
}) {
  const allJobs = [...jobs];
  let frontier = [...jobs];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const existingTypeIds = new Set(allJobs.map((j) => j.itemID));
    const requests = collectBuildRequests(frontier, existingTypeIds);
    if (requests.length === 0) break;

    const newJobs = await buildJob(requests, { queryClient });
    if (!Array.isArray(newJobs) || newJobs.length === 0) break;

    allJobs.push(...newJobs);
    if (!buildFullTree) break;
    frontier = newJobs;
    depth += 1;
  }

  resetJobRelationships(allJobs);
  buildParentChildRelationships(allJobs);
  return allJobs;
}
