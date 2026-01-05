import useUsersStore from "../../Zustand/usersStore";
import { jobTypeMapping } from "../../Context/defaultValues";

/**
 * Finds the system index value for a specific job type in a given system.
 * 
 * This function retrieves the system index value by checking multiple sources in order:
 * 1. Alternative system index value (if explicitly provided)
 * 2. Predefined system index from application settings
 * 3. System index from world data (with optional alternative location)
 * 4. Default value of 0 if none found
 * 
 * @param {number} systemID - The ID of the system to get the index value for
 * @param {string} jobType - The type of job (will be mapped using jobTypeMapping)
 * @param {boolean} [useAlternativeSystemIndexValue=false] - Whether to use the alternative system index value
 * @param {number} [alternativeSystemIndexValue=0] - The alternative system index value to use if enabled
 * @param {Object} [alternativeLocation={}] - Alternative location data to pass to the world data lookup
 * @returns {number} The system index value for the specified job type, or 0 if not found
 */
export default function findSystemIndexForJob(systemID, jobType, useAlternativeSystemIndexValue = false, alternativeSystemIndexValue = 0, alternativeLocation = {}) {
    if (useAlternativeSystemIndexValue) {
        return alternativeSystemIndexValue;
    }
    if (useUsersStore.getState().applicationSettings.actions.findPredefinedSystemIndex(systemID)?.[jobTypeMapping[jobType]]) {
        return useUsersStore.getState().applicationSettings.actions.findPredefinedSystemIndex(systemID)?.[jobTypeMapping[jobType]];
    }

    if (useUsersStore.getState().worldData.actions.findSystemIndex(systemID, alternativeLocation)?.[jobTypeMapping[jobType]]) {
        return useUsersStore.getState().worldData.actions.findSystemIndex(systemID, alternativeLocation)?.[jobTypeMapping[jobType]];
    }

    return 0;
}