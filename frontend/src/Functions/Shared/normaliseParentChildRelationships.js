import {
  addChildJob,
  addParentJob,
  applyCommands,
  removeChildJob,
  removeParentJob,
} from "../../Components/Edit Job/Edit Job Hooks/jobCommands";

/**
 * Normalises the parent and child links between the jobs given, leaving a link to
 * a job that is not among them alone.
 *
 * @param {Array<object>} jobs
 * @returns {Set<string>}
 */
export default function normaliseParentChildRelationships(jobs = []) {
  const modifiedJobIDs = new Set();
  const jobMap = new Map(
    jobs.map((job) => [job?.jobID, job]).filter(([id]) => !!id),
  );

  for (const job of jobs) {
    if (!job?.jobID) continue;

    const parentIDs = [...(job.parentJobs ?? [])];
    for (const parentID of parentIDs) {
      const parentJob = jobMap.get(parentID);
      if (!parentJob) continue;

      const parentMaterials = Object.values(parentJob.build?.materials ?? {});
      const canBuildChildType = parentMaterials.some(
        (material) => material.typeID === job.itemID,
      );

      if (!canBuildChildType) {
        applyCommands(job, removeParentJob(parentID));
        modifiedJobIDs.add(job.jobID);
        continue;
      }

      const parentChildList = parentJob.build?.childJobs?.[job.itemID] ?? [];
      if (!parentChildList.includes(job.jobID)) {
        applyCommands(parentJob, addChildJob(job.itemID, job.jobID));
        modifiedJobIDs.add(parentJob.jobID);
      }
    }

    const materials = Object.values(job.build?.materials ?? {});
    for (const material of materials) {
      const materialTypeID = material.typeID;
      const childIDs = [...(job.build?.childJobs?.[materialTypeID] ?? [])];

      for (const childID of childIDs) {
        const childJob = jobMap.get(childID);
        if (!childJob) continue;

        if (childJob.itemID !== materialTypeID) {
          applyCommands(job, removeChildJob(materialTypeID, childID));
          modifiedJobIDs.add(job.jobID);

          if (childJob.parentJobs?.includes(job.jobID)) {
            applyCommands(childJob, removeParentJob(job.jobID));
            modifiedJobIDs.add(childJob.jobID);
          }
          continue;
        }

        if (!childJob.parentJobs?.includes(job.jobID)) {
          applyCommands(childJob, addParentJob(job.jobID));
          modifiedJobIDs.add(childJob.jobID);
        }
      }
    }
  }

  return modifiedJobIDs;
}
