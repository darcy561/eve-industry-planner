import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import Job from "../../Classes/jobConstructor";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Creates a Firebase real-time listener for a job document.
 * Listens for changes to the job document and updates the local job array accordingly.
 * Handles document deletion and updates the UI in real-time.
 * 
 * @param {string|number} documentID - Job document ID to listen to
 * @returns {Function|null} Unsubscribe function or null if creation fails
 * 
 * @throws {Error} Throws error if documentID is missing or user is not authenticated
 * 
 * @example
 * const unsubscribe = createFirebaseJobDocumentListener("job_123");
 * // Later: unsubscribe(); // Stop listening
 */
function createFirebaseJobDocumentListener(documentID) {
  const removeFirebaseListeners = useUsersStore.getState().users.actions.removeFirebaseListeners;
  const removeJobsFromJobArray = useUsersStore.getState().jobData.actions.removeJobsFromJobArray;
  const updateOrAddJobsToJobArray = useUsersStore.getState().jobData.actions.updateOrAddJobsToJobArray;

  try {
    if (!documentID) {
      throw new Error("Missing Inputs");
    }

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    const unsubscribe = onSnapshot(
      doc(firestore, `Users/${uid}/Jobs`, documentID.toString()),
      (docSnapshot) => {
        if (!docSnapshot.exists()) {
          removeJobsFromJobArray(documentID);
          removeFirebaseListeners(documentID);
          unsubscribe();
          return;
        }

        const jobData = docSnapshot.data();

        if (!jobData) {
          console.error(`Document with ID ${documentID} has no data.`);
          return;
        }

        const job = new Job(jobData);

        if (docSnapshot.metadata.fromCache) return;

        updateOrAddJobsToJobArray(job);
      },
      (error) => {
        console.error("Error in snapshot listener:", error);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error("Error creating job document listener:", err);
    return null;
  }
}

export default createFirebaseJobDocumentListener;
