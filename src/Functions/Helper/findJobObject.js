import getJobDocumentFromFirebase from "../Firebase/getJobDocument";
import isUserLoggedIn from "../Firebase/isUserLoggedIn";

async function findOrGetJobObject(
  requestedJobID,
  jobArray,
  alternativeJobStore = []
) {
  try {
    if (!requestedJobID || !jobArray) {
      throw new Error("Missing requested input or job array");
    }

    const matchedJob =
      jobArray.find(({ jobID }) => jobID === requestedJobID) ||
      alternativeJobStore.find(({ jobID }) => jobID === requestedJobID);

    
    if (matchedJob) {
      return matchedJob;
    } else if (isUserLoggedIn()) {
      const retrievedJob = await getJobDocumentFromFirebase(requestedJobID);

      if (!retrievedJob) {
        return null
      }

      alternativeJobStore.push(retrievedJob);

      return retrievedJob;
    } else return null;
  } catch (err) {
    console.error("Error finding job object:", err);
    return null;
  }
}

export default findOrGetJobObject;
