import { useEffect, useMemo } from "react";
import useLocationNames, {
  charactersByLocation,
} from "../../../Hooks/EveEsi/useLocationNames";
import jobLocationCharacters from "../../../Functions/IndustryJobs/jobLocationCharacters";
import useUsersStore from "../../../Zustand/usersStore";
import findIndustryJobsForItem from "../../../Functions/IndustryJobs/findIndustryJobsForItem";
import { asNumberIDSet } from "../../../Functions/Helper/ids";
import { updateLinkedJobData } from "../Edit Job Hooks/jobCommands";

/** Every place an industry job row can name. */
function jobLocationIds(jobs = []) {
  return asNumberIDSet(
    jobs.flatMap((job) => [job.location_id, job.facility_id, job.station_id]),
  );
}

export function useGatherJobMatchesAndUpdateExistingLinkedJobs(
  allIndustryJobs,
  itemID,
  industryJobs,
  linkedJobs,
  runsToLink,
  run,
) {
  // Derived while rendering rather than set from an effect: the matches are a function of the jobs
  // ESI reported and the job being edited, so an effect would paint one frame of the previous set.
  const { jobMatches, error } = useMemo(() => {
    if (!allIndustryJobs) return { jobMatches: [], error: null };
    try {
      return {
        jobMatches: findIndustryJobsForItem(
          allIndustryJobs,
          { itemID, industryJobs },
          {
            linkedAcrossAccount: linkedJobs,
            beingRemoved: runsToLink.remove,
          },
        ),
        error: null,
      };
    } catch (err) {
      return { jobMatches: [], error: err };
    }
  }, [allIndustryJobs, itemID, industryJobs, linkedJobs, runsToLink]);

  // The one thing here that is not a derivation: the job being edited takes the latest figures ESI
  // reported for the jobs already linked to it. Said as a command, because a change written into the
  // job this render is reading reaches nothing.
  useEffect(() => {
    if (allIndustryJobs) run(updateLinkedJobData(allIndustryJobs));
  }, [allIndustryJobs, run]);

  const characters = useUsersStore((state) => state.account.characters);
  const linkedJobRows = Object.values(industryJobs);
  const locationIds = useMemo(
    () => jobLocationIds([...jobMatches, ...linkedJobRows]),
    [jobMatches, linkedJobRows],
  );
  // The panels below resolve their own rows' names from the same per-id cache; this is here because
  // the page waits for them before it draws, rather than drawing rows that say nothing yet.
  const installers = useMemo(
    () =>
      charactersByLocation(
        jobLocationCharacters([...jobMatches, ...linkedJobRows], characters),
      ),
    [jobMatches, linkedJobRows, characters],
  );
  const { isLoading: isWorldDataLoading } = useLocationNames(
    locationIds,
    installers,
  );

  return {
    jobMatches,
    isWorldDataLoading,
    error,
  };
}
