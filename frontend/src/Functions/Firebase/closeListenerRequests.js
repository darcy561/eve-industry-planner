import useUsersStore from "../../Zustand/usersStore"

/**
 * Closes Firebase listeners for specified job objects.
 * Unsubscribes from real-time listeners and removes them from the listeners array.
 * 
 * @param {Array<Object>} inputJobs - Array of job objects to close listeners for
 * @returns {void}
 * 
 * @example
 * const jobs = [job1, job2, job3];
 * closeFirebaseListeners(jobs);
 * console.log("Listeners closed for jobs");
 */
function closeFirebaseListeners(
  inputJobs
) {
  const firebaseListeners = useUsersStore.getState().users.firebaseListeners;
  const removeFirebaseListeners = useUsersStore.getState().users.actions.removeFirebaseListeners;
  if (
    !Array.isArray(inputJobs)
  ) {
    console.error("Invalid inputs");
    return;
  }

  for (let job of inputJobs) {
    const listener = firebaseListeners.find((i) => i.id === job.jobID);
    if (!listener) continue;
    listener.unsubscribe();
  }

  removeFirebaseListeners(inputJobs.map((job) => job.jobID));
}
export default closeFirebaseListeners;
