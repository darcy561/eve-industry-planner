import useUsersStore from "../../Zustand/usersStore";
import { fetchJobDocumentsByIdsFromApi } from "../Endpoints/Private/jobDocuments.js";

/**
 * Loads job documents from the API for IDs not already in `jobArray`.
 *
 * @param {string|number|Array<string|number|object>|Set<string|number>} requestedJobIDs
 * @returns {Promise<Array>} Jobs fetched (also merged into Zustand via fetch helper)
 */
async function getMissingJobObjects(requestedJobIDs) {
  try {
    if (!requestedJobIDs) {
      throw new Error("Missing requested input");
    }

    if (!useUsersStore.getState().account.actions.getIsLoggedIn()) {
      return [];
    }

    /** @type {string[]} */
    const jobIDs = [];

    if (Array.isArray(requestedJobIDs) || requestedJobIDs instanceof Set) {
      (Array.isArray(requestedJobIDs)
        ? requestedJobIDs
        : Array.from(requestedJobIDs)
      ).forEach((item) => {
        if (typeof item === "string" || typeof item === "number") {
          jobIDs.push(String(item));
        } else if (
          typeof item === "object" &&
          item !== null &&
          "jobID" in item
        ) {
          jobIDs.push(String(item.jobID));
        } else {
          throw new Error(
            "Array or Set item must be a string, number, or an object with an 'jobID' property."
          );
        }
      });
    } else if (
      typeof requestedJobIDs === "string" ||
      typeof requestedJobIDs === "number"
    ) {
      jobIDs.push(String(requestedJobIDs));
    } else {
      throw new Error(
        "Invalid type for requestedJobIDs. Must be an array, Set, or a single ID."
      );
    }

    const uniqueRequested = [...new Set(jobIDs)];
    const jobArray = useUsersStore.getState().jobData.jobArray;
    const have = new Set(jobArray.map((j) => String(j.jobID)));
    const missingIds = uniqueRequested.filter((id) => !have.has(String(id)));

    return await fetchJobDocumentsByIdsFromApi(missingIds);
  } catch (err) {
    console.error("Error loading missing job objects:", err);
    return [];
  }
}

export default getMissingJobObjects;
