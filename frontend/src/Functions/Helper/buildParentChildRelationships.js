/**
 * Builds parent-child relationships between jobs based on material dependencies.
 * Establishes connections between jobs where one job's output is another job's input.
 * 
 * @param {Array} inputJobArray - Array of job objects to establish relationships for
 * @returns {void}
 * 
 * @example
 * const jobs = [job1, job2, job3];
 * buildParentChildRelationships(jobs);
 * // Jobs now have parentJobs and childJobs relationships established
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
      job.build.materials.forEach((material) => {
        const relatedJobs = typesMap[material.typeID];
        if (relatedJobs) {
          job.addChildJob(material.typeID, relatedJobs);

          relatedJobs.forEach((id) => {
            const matchingJob = jobIDMap[id];
            matchingJob.addParentJob(job.jobID);
          });
        }
      });
    }
  });
}

export default buildParentChildRelationships
