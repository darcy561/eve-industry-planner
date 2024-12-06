import { useContext, useEffect } from "react";
import { JobArrayContext } from "../../../Context/JobContext";
import {
  FirebaseListenersContext,
  IsLoggedInContext,
  UserJobSnapshotContext,
} from "../../../Context/AuthContext";
import createFirebaseJobDocumentListener from "../../../Functions/Firebase/createJobListener";

function useSubscribeToJobListeners(requestedJobID, onJobLoaded) {
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { jobArray, updateJobArray } = useContext(JobArrayContext);
  const { userJobSnapshot } = useContext(UserJobSnapshotContext);
  const { firebaseListeners, updateFirebaseListeners } = useContext(
    FirebaseListenersContext
  );

  useEffect(() => {
    try {
      if (!isLoggedIn || !requestedJobID) {
        onJobLoaded();
        return;
      }

      const matchedObject =
        userJobSnapshot.find(({ jobID }) => jobID === requestedJobID) ||
        jobArray.find((i) => i.jobID === requestedJobID);

      const relatedJobs = matchedObject.getRelatedJobs();

      const requiredJobs = [...relatedJobs, requestedJobID];
      const existingListenerIds = new Set(
        firebaseListeners.map((listener) => listener.id)
      );
      const existingJobIds = new Set(jobArray.map((job) => job.jobID));

      requiredJobs.forEach((id) => {
        if (existingListenerIds.has(id) && existingJobIds.has(id)) return;
        const unsubscribe = createFirebaseJobDocumentListener(
          id,
          updateJobArray,
          updateFirebaseListeners
        );
        if (!unsubscribe) return;

        updateFirebaseListeners((prev) => {
          const updatedListeners = prev.map((listener) =>
            listener.id === id ? { id, unsubscribe } : listener
          );
          if (!prev.some((listener) => listener.id === id)) {
            updatedListeners.push({ id, unsubscribe });
          }
          return updatedListeners;
        });
      });

      onJobLoaded();
    } catch (err) {
      console.error("Error setting up job listeners:", err);
    }
  }, [requestedJobID, ]);
}

export default useSubscribeToJobListeners;
