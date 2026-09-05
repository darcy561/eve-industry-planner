import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { saveApplicationSettings } from "../Endpoints/Private/userDocument";
import getSystemIndexes from "../../Functions/System Indexes/findSystemIndex";
import { jobTypes } from "../../Context/defaultValues";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Adds a custom structure to the application settings and updates system indexes.
 * Handles both reprocessing and non-reprocessing structures differently.
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.structure - Structure object to add
 * @param {Function} params.addCustomStructure - Function to add structure to store
 * @param {number} params.selectedJobType - Selected job type for analytics
 * @param {Function} params.setIsLoading - Function to set loading state
 * @returns {Promise<void>} Promise that resolves when structure is added
 */
export async function addCustomStructure({
  structure,
  addCustomStructure,
  selectedJobType,
  setIsLoading,
}) {
  setIsLoading(true);
  try {
    // Get system indexes for non-reprocessing structures
    let systemIndexResults = {};
    if (structure.jobType !== jobTypes.reprocessing) {
      systemIndexResults = await getSystemIndexes(structure.systemID);
    }

    await saveApplicationSettings();

    addCustomStructure(structure);
    // Update system index data for non-reprocessing structures
    if (structure.jobType !== jobTypes.reprocessing) {
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
