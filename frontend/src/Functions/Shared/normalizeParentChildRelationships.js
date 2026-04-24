/**
 * Normalizes parent/child links across the provided jobs and returns modified job IDs.
 *
 * Rules:
 * - If A lists B as parent, ensure B lists A as child on A.itemID.
 * - If A lists B as child on material type T, ensure B.itemID===T and B lists A as parent.
 * - If a parent link references a provided job that cannot produce the child type, remove it.
 * - If a child link references a provided job with mismatched type, remove both sides.
 *
 * Only relationships between jobs present in `jobs` are normalized.
 *
 * @param {Array<object>} jobs
 * @returns {Set<string>}
 */
export default function normalizeParentChildRelationships(jobs = []) {
  const modifiedJobIDs = new Set();
  const jobMap = new Map(jobs.map((job) => [job?.jobID, job]).filter(([id]) => !!id));

  for (const job of jobs) {
    if (!job?.jobID) continue;

    const parentIDs = [...(job.parentJobs ?? [])];
    for (const parentID of parentIDs) {
      const parentJob = jobMap.get(parentID);
      if (!parentJob) continue;

      const parentMaterials = parentJob.build?.materials ?? [];
      const canBuildChildType = parentMaterials.some(
        (material) => material.typeID === job.itemID
      );

      if (!canBuildChildType) {
        job.removeParentJob(parentID);
        modifiedJobIDs.add(job.jobID);
        continue;
      }

      const parentChildList = parentJob.build?.childJobs?.[job.itemID] ?? [];
      if (!parentChildList.includes(job.jobID)) {
        parentJob.addChildJob(job.itemID, job.jobID);
        modifiedJobIDs.add(parentJob.jobID);
      }
    }

    const materials = job.build?.materials ?? [];
    for (const material of materials) {
      const materialTypeID = material.typeID;
      const childIDs = [...(job.build?.childJobs?.[materialTypeID] ?? [])];

      for (const childID of childIDs) {
        const childJob = jobMap.get(childID);
        if (!childJob) continue;

        if (childJob.itemID !== materialTypeID) {
          job.removeChildJob(materialTypeID, childID);
          modifiedJobIDs.add(job.jobID);

          if (childJob.parentJobs?.includes(job.jobID)) {
            childJob.removeParentJob(job.jobID);
            modifiedJobIDs.add(childJob.jobID);
          }
          continue;
        }

        if (!childJob.parentJobs?.includes(job.jobID)) {
          childJob.addParentJob(job.jobID);
          modifiedJobIDs.add(childJob.jobID);
        }
      }
    }
  }

  return modifiedJobIDs;
}
