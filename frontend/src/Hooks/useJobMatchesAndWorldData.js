import { useState, useCallback, useEffect } from "react";
import useUsersStore from "../Zustand/usersStore";
import getWorldData from "../Functions/EveESI/World/getWorldData";

/**
 * Custom hook that gathers industry job matches and updates existing linked jobs with world data
 * 
 * This hook performs several key operations:
 * - Filters industry jobs to find matches for the active job's item type
 * - Excludes jobs that are already in the active API jobs or are being removed
 * - Updates the active job with linked job data
 * - Gathers world data (location names) for all relevant job locations
 * - Handles loading states and error management
 * 
 * @param {Array} allIndustryJobs - Array of all industry jobs from ESI
 * @param {Object} activeJob - The current active job to find matches for
 * @param {Set} linkedJobs - Set of currently linked job IDs
 * @param {Object} esiDataToLink - ESI data object containing jobs to remove
 * 
 * @returns {Object} Object containing:
 *   - jobMatches: Array of matching industry jobs found
 *   - isWorldDataLoading: Boolean indicating if world data is being loaded
 *   - error: Error object if an error occurred during processing
 * 
 * @example
 * const { jobMatches, isWorldDataLoading, error } = 
 *   useGatherJobMatchesAndUpdateExistingLinkedJobs(
 *     allIndustryJobs, 
 *     activeJob, 
 *     linkedJobs, 
 *     esiDataToLink
 *   );
 */
export function useGatherJobMatchesAndUpdateExistingLinkedJobs(
  allIndustryJobs,
  activeJob,
  linkedJobs,
  esiDataToLink
) {
  const [jobMatches, setJobMatches] = useState([]);
  const [isWorldDataLoading, setIsWorldDataLoading] = useState(false);
  const [error, setError] = useState(null);

  const parentUser = useUsersStore((state) =>
    state.users.actions.findParentUser()
  );

  useEffect(() => {
    async function processGatherJobMatchesAndUpdateExistingLinkedJobs() {
      if (!allIndustryJobs) {
        setJobMatches([]);
        setError(null);
        return;
      }

      try {
        setIsWorldDataLoading(true);
        setError(null);

        const uniqueJobIds = new Set();
        const removeSet = new Set(esiDataToLink.industryJobs.remove);

        const matches = allIndustryJobs.filter((job) => {
          if (uniqueJobIds.has(job.job_id)) return false;
          uniqueJobIds.add(job.job_id);

          const isCorrectType = job.product_type_id === activeJob.itemID;
          const isNotInActiveApiJobs = !activeJob.apiJobs.has(job.job_id);
          const isLinkedButBeingRemoved =
            linkedJobs.has(job.job_id) && removeSet.has(job.job_id);
          const isNotLinked = !linkedJobs.has(job.job_id);

          return (
            isCorrectType &&
            isNotInActiveApiJobs &&
            (isNotLinked || isLinkedButBeingRemoved)
          );
        });

        activeJob.updateLinkedJobData(matches);

        setJobMatches(matches);

        const allLocationIDs = new Set();

        matches.forEach((job) => {
          if (job.location_id) allLocationIDs.add(job.location_id);
          if (job.facility_id) allLocationIDs.add(job.facility_id);
          if (job.station_id) allLocationIDs.add(job.station_id);
        });

        if (activeJob.build.costs.linkedJobs.length > 0) {
          activeJob.build.costs.linkedJobs.forEach((job) => {
            if (job.location_id) allLocationIDs.add(job.location_id);
            if (job.facility_id) allLocationIDs.add(job.facility_id);
            if (job.station_id) allLocationIDs.add(job.station_id);
          });
        }

        if (allLocationIDs.size > 0) {
          const locationNames = await getWorldData(
            allLocationIDs,
            parentUser
          );
          useUsersStore
            .getState()
            .worldData.actions.addUniverseIDs(locationNames);
        }

        setIsWorldDataLoading(false);
      } catch (err) {
        console.error("Error in processGatherJobMatchesAndUpdateExistingLinkedJobs:", err);
        setError(err);
        setIsWorldDataLoading(false);
      }
    }

    processGatherJobMatchesAndUpdateExistingLinkedJobs();
  }, [allIndustryJobs, linkedJobs, esiDataToLink]);

  return {
    jobMatches,
    isWorldDataLoading,
    error,
  };
}
