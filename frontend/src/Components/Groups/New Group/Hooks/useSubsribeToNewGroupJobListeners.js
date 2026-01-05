import { useEffect } from "react";
import createFirebaseJobDocumentListener from "../../../../Functions/Firebase/createJobListener";
import useUsersStore from "../../../../Zustand/usersStore";

function useSubscribeToNewGroupListeners(requestedJobIDs, onJobLoaded) {
  const { jobArray } = useUsersStore((state) => state.jobData);
  const { firebaseListeners } = useUsersStore((state) => state.users);
  const { updateFirebaseListeners } = useUsersStore.getState().users.actions;
  const { findJobInUserJobSnapshotArray } = useUsersStore.getState().jobData.actions;

  useEffect(() => {
    try {
      if (!requestedJobIDs || !requestedJobIDs.length) {
        onJobLoaded();
        return;
      }
      let combinedJobIDs = new Set();
      const newListeners = [];
      for (let id of requestedJobIDs) {
        const matchedJobSnapshot = findJobInUserJobSnapshotArray(id);
        if (!matchedJobSnapshot) continue;
        const relatedJobs = matchedJobSnapshot.getRelatedJobs();
        combinedJobIDs.add(id);
        relatedJobs.forEach((jobId) => combinedJobIDs.add(jobId));
      }

      const existingListenerIds = new Set(
        firebaseListeners.map((listener) => listener.id)
      );
      const existingJobIds = new Set(jobArray.map((job) => job.jobID));

      combinedJobIDs.forEach((id) => {
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
  }, [
    requestedJobIDs,
    firebaseListeners,
    jobArray
  ]);
}

export default useSubscribeToNewGroupListeners;
