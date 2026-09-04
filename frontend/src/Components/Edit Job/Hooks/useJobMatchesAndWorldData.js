import { useState, useEffect } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";

export function useGatherJobMatchesAndUpdateExistingLinkedJobs(
  allIndustryJobs,
  activeJob,
  linkedJobs,
  esiDataToLink
) {
  const [jobMatches, setJobMatches] = useState([]);
  const [isWorldDataLoading, setIsWorldDataLoading] = useState(false);
  const [error, setError] = useState(null);

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
        const alreadyLinkedToThisJob = activeJob.esiJobIDs;

        const matches = allIndustryJobs.filter((job) => {
          if (uniqueJobIds.has(job.job_id)) return false;
          uniqueJobIds.add(job.job_id);

          const isCorrectType = job.product_type_id === activeJob.itemID;
          const isNotInActiveApiJobs = !alreadyLinkedToThisJob.has(job.job_id);
          const isLinkedButBeingRemoved =
            linkedJobs.has(job.job_id) && removeSet.has(job.job_id);
          const isNotLinked = !linkedJobs.has(job.job_id);

          return (
            isCorrectType &&
            isNotInActiveApiJobs &&
            (isNotLinked || isLinkedButBeingRemoved)
          );
        });

        activeJob.updateLinkedJobData(allIndustryJobs);
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
            useUsersStore.getState().account.actions.getMainCharacter()
          );
          useUsersStore
            .getState()
            .worldData.actions.addUniverseIDs(locationNames);
        }

        setIsWorldDataLoading(false);
      } catch (err) {
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
