import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import Job from "../../Classes/jobConstructor";

function createFirebaseJobDocumentListener(
  documentID,
  updateJobArray,
  updateFirebaseListeners
) {
  try {
    if (!documentID || !updateJobArray) {
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
          updateJobArray((prev) => prev.filter((i) => i.jobID !== documentID));
          updateFirebaseListeners((prev) =>
            prev.filter((i) => i.id !== documentID)
          );
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

        updateJobArray((prev) => {
          const jobExists = prev.some((doc) => doc.jobID === documentID);

          if (jobExists) {
            return prev.map((existingJob) =>
              existingJob.jobID === documentID ? job : existingJob
            );
          } else {
            return [...prev, job];
          }
        });
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
