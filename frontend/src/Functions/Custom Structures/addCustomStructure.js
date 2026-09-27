import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { saveApplicationSettings } from "../Endpoints/Private/userDocument";
import getSystemIndexes from "../System Indexes/findSystemIndex";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import { fieldsForKind } from "./customStructure";

/**
 * Adds a custom structure to the application settings and updates system indexes.
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.structure - Structure to add
 * @param {Function} params.addCustomStructure - Function to add structure to store
 * @param {Function} params.setIsLoading - Function to set loading state
 * @returns {Promise<void>} Promise that resolves when structure is added
 */
export async function addCustomStructure({
  structure,
  addCustomStructure,
  setIsLoading,
}) {
  setIsLoading(true);
  try {
    // Only a kind that names a system has an index to fetch, and only the kinds
    // a job is installed in name one.
    const needsSystemIndex = Boolean(fieldsForKind(structure.jobType).systemID);

    let systemIndexResults = {};
    if (needsSystemIndex) {
      systemIndexResults = await getSystemIndexes(structure.systemID);
    }

    await saveApplicationSettings();

    addCustomStructure(structure);
    if (needsSystemIndex) {
      useUsersStore
        .getState()
        .worldData.actions.addSystemIndex(systemIndexResults);
    }

    trackAppEvent(AppEvent.ADD_CUSTOM_STRUCTURE);
    showSnackbarSuccess(`${structure.name} Added`);
  } catch (error) {
    console.error("Error adding structure:", error);
    throw error;
  } finally {
    setIsLoading(false);
  }
}
