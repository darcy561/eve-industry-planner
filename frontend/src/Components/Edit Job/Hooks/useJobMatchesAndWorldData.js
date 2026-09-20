import { useEffect, useMemo } from "react";
import useLocationNames from "../../../Hooks/EveEsi/useLocationNames";
import findIndustryJobsForItem from "../../../Functions/IndustryJobs/findIndustryJobsForItem";
import { asNumberIDSet } from "../../../Functions/Helper/ids";

/** Every place an industry job row can name. */
function jobLocationIds(jobs = []) {
  return asNumberIDSet(
    jobs.flatMap((job) => [job.location_id, job.facility_id, job.station_id]),
  );
}

export function useGatherJobMatchesAndUpdateExistingLinkedJobs(
  allIndustryJobs,
  activeJob,
  linkedJobs,
  esiDataToLink,
) {
  // Derived while rendering rather than set from an effect: the matches are a function of the jobs
  // ESI reported and the job being edited, so an effect would paint one frame of the previous set.
  const { jobMatches, error } = useMemo(() => {
    if (!allIndustryJobs) return { jobMatches: [], error: null };
    try {
      return {
        jobMatches: findIndustryJobsForItem(allIndustryJobs, activeJob, {
          linkedAcrossAccount: linkedJobs,
          beingRemoved: esiDataToLink.industryJobs.remove,
        }),
        error: null,
      };
    } catch (err) {
      return { jobMatches: [], error: err };
    }
  }, [allIndustryJobs, activeJob, linkedJobs, esiDataToLink]);

  // The one thing here that is not a derivation: the job being edited takes the latest figures ESI
  // reported for the jobs already linked to it.
  useEffect(() => {
    if (allIndustryJobs) activeJob.updateLinkedJobData(allIndustryJobs);
  }, [allIndustryJobs, activeJob]);

  const linkedJobRows = Object.values(activeJob.esi.industryJobs);
  const locationIds = useMemo(
    () => jobLocationIds([...jobMatches, ...linkedJobRows]),
    [jobMatches, linkedJobRows],
  );
  // The panels below resolve their own rows' names from the same per-id cache; this is here because
  // the page waits for them before it draws, rather than drawing rows that say nothing yet.
  const { isLoading: isWorldDataLoading } = useLocationNames(locationIds);

  return {
    jobMatches,
    isWorldDataLoading,
    error,
  };
}
