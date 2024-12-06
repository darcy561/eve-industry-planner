import { firestore } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";

async function archiveJobInFirebase(inputJob) {
  try {
    if (!inputJob) {
      throw new Error("Input Job is null or undefined");
    }

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }
    inputJob.archived = true;

    setDoc(
      doc(firestore, `Users/${uid}/ArchivedJobs`, inputJob.jobID.toString()),
      inputJob.toDocument()
    );
  } catch (err) {
    console.error(`Error archiving job in Firebase: ${err}`);
  }
}

export default archiveJobInFirebase;
