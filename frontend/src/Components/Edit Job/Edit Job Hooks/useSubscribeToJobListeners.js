/**
 * Job Listeners Subscription Hook for EVE Industry Planner.
 * 
 * Custom React hook that manages Firebase listeners for job documents and their
 * related jobs. Automatically sets up listeners for the requested job and all
 * its related jobs, ensuring data synchronization and preventing duplicate listeners.
 * 
 * @fileoverview Hook for managing Firebase job document listeners
 * @author EVE Industry Planner Team
 */

import { useEffect } from "react";
import createFirebaseJobDocumentListener from "../../../Functions/Firebase/createJobListener";
import useUsersStore from "../../../Zustand/usersStore";

/**
 * Custom hook for subscribing to Firebase job document listeners.
 * 
 * Manages Firebase listeners for job documents, automatically setting up
 * listeners for the requested job and all related jobs. Handles listener
 * deduplication and cleanup, ensuring efficient data synchronization.
 * 
 * @param {string|null} requestedJobID - The job ID to subscribe to listeners for
 * @param {Function} onJobLoaded - Callback function called when job loading is complete
 * 
 * @example
 * function EditJobComponent({ jobID }) {
 *   const handleJobLoaded = () => {
 *     console.log('Job data loaded and listeners set up');
 *   };
 *   
 *   useSubscribeToJobListeners(jobID, handleJobLoaded);
 *   
 *   return <div>Edit Job Component</div>;
 * }
 */
function useSubscribeToJobListeners(requestedJobID, onJobLoaded) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const firebaseListeners = useUsersStore((state) => state.users.firebaseListeners);
  const { jobArray } = useUsersStore((state) => state.jobData);
  const { updateFirebaseListeners } = useUsersStore.getState().users.actions;
  const { findJobInUserJobSnapshotArray, findJobInJobArray } = useUsersStore.getState().jobData.actions;

  useEffect(() => {
    try {
      if (!isLoggedIn || !requestedJobID) {
        onJobLoaded();
        return;
      }

      const matchedObject =
        findJobInUserJobSnapshotArray(requestedJobID) ||
        findJobInJobArray(requestedJobID);

      const relatedJobs = matchedObject.getRelatedJobs();

      const requiredJobs = [...relatedJobs, requestedJobID];
      const existingListenerIds = new Set(
        firebaseListeners.map((listener) => listener.id)
      );
      const existingJobIds = new Set(jobArray.map((job) => job.jobID));

      const newListeners = [];
      requiredJobs.forEach((id) => {
        if (existingListenerIds.has(id) && existingJobIds.has(id)) return;
        const unsubscribe = createFirebaseJobDocumentListener(id);
        if (!unsubscribe) return;

        newListeners.push({ id, unsubscribe });
      });

      updateFirebaseListeners(newListeners);

      onJobLoaded();
    } catch (err) {
      console.error("Error setting up job listeners:", err);
    }
  }, [requestedJobID]);
}

export default useSubscribeToJobListeners;
