import getCurrentFirebaseUser from "./currentFirebaseUser";
import createFirebaseJobDocumentListener from "./createJobListener";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Manages Firebase listener requests for job documents.
 * Creates listeners for job IDs that don't already have active listeners.
 * Handles various input types and filters out existing listeners.
 * 
 * @param {string|number|Array<string|number|Object>|Set<string|number|Object>} inputJobIDs - Job ID(s) to create listeners for
 * @returns {void}
 * 
 * @throws {Error} Throws error if inputJobIDs is missing or invalid type
 * 
 * @example
 * manageListenerRequests("job_123");
 * 
 * @example
 * manageListenerRequests(["job_123", "job_456"]);
 */
function manageListenerRequests(inputJobIDs) {
  const { isLoggedIn } = useUsersStore.getState().account;
  const { firebaseListeners } = useUsersStore.getState().users;
  const { updateFirebaseListeners } = useUsersStore.getState().users.actions;

  try {
    if (
      !inputJobIDs
    ) {
      throw new Error(
        "Missing required input: requestedJobID, updateJobArray, updateFirebaseListeners, firebaseListeners, or isLoggedIn"
      );
    }

    if (!isLoggedIn) return;

    const jobIDs = [];

    if (Array.isArray(inputJobIDs) || inputJobIDs instanceof Set) {
      (Array.isArray(inputJobIDs)
        ? inputJobIDs
        : Array.from(inputJobIDs)
      ).forEach((item) => {
        if (typeof item === "string" || typeof item === "number") {
          jobIDs.push(item);
        } else if (
          typeof item === "object" &&
          item !== null &&
          "jobID" in item
        ) {
          jobIDs.push(item.jobID);
        } else {
          throw new Error(
            "Array or Set item must be a string, number, or an object with an 'jobID' property."
          );
        }
      });
    } else if (
      typeof inputJobIDs === "string" ||
      typeof inputJobIDs === "number"
    ) {
      jobIDs.push(inputJobIDs);
    } else {
      throw new Error(
        "Invalid type for inputJobIDs. Must be an array, Set, or a single ID."
      );
    }

    const idsToListen = jobIDs.filter(
      (id) => !firebaseListeners.some((listener) => listener.id === id)
    );

    if (idsToListen.length === 0) return;

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    const newListeners = idsToListen.map((requestedJobID) => {
      const unsubscribe = createFirebaseJobDocumentListener(requestedJobID);

      return { id: requestedJobID, unsubscribe };
    });

    updateFirebaseListeners(newListeners);
  } catch (err) {
    console.error("Error setting up job document listener:", err);
  }
}

export default manageListenerRequests;
