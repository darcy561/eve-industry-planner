import useUsersStore from "../../../../../Zustand/usersStore";

function findJobsToHighlight(startingJob) {
  const jobArray = useUsersStore.getState().jobData.jobArray;

  if (!startingJob) {
    return new Set();
  }

  const processingQueue = [startingJob];
  const processedJobs = new Set();
  const matchedJobIDs = new Set();

  while (processingQueue.length > 0) {
    const currentJob = processingQueue.shift();

    try {
      if (processedJobs.has(currentJob.jobID)) continue;

      processedJobs.add(currentJob.jobID);
      matchedJobIDs.add(currentJob.jobID);

      Object.values(currentJob.build.childJobs)
        .flat()
        .forEach((jobID) => {
          const childJob = jobArray.find((i) => i.jobID === jobID);
          try {
            if (childJob && !processedJobs.has(childJob.jobID)) {
              processingQueue.push(childJob);
            }
          } catch (childError) {
            console.error("error processing child job:", childError);
          }
        });
    } catch (parentError) {
      console.error("error processing job:", parentError);
    }
  }

  return matchedJobIDs;
}

export default findJobsToHighlight;
