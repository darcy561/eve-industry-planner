import {
  addChildJob,
  addParentJob,
  applyCommands,
} from "../../Components/Edit Job/Edit Job Hooks/jobCommands";

/**
 * Links jobs whose output another job is built from, in both directions.
 *
 * @param {Array} inputJobArray - Array of job objects to establish relationships for
 * @returns {void}
 */
function buildParentChildRelationships(inputJobArray) {
  const typesMap = {};
  const jobIDMap = {};

  inputJobArray.forEach((job) => {
    if (!typesMap[job.itemID]) {
      typesMap[job.itemID] = new Set();
    }
    typesMap[job.itemID].add(job.jobID);
    jobIDMap[job.jobID] = job;
  });

  inputJobArray.forEach((job) => {
    if (job.build && job.build.materials) {
      Object.values(job.build.materials).forEach((material) => {
        const relatedJobs = typesMap[material.typeID];
        if (relatedJobs) {
          applyCommands(job, addChildJob(material.typeID, relatedJobs));

          relatedJobs.forEach((id) => {
            const matchingJob = jobIDMap[id];
            applyCommands(matchingJob, addParentJob(job.jobID));
          });
        }
      });
    }
  });
}

export default buildParentChildRelationships;
