import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { clearOrphanedCustomStructureOnSetups } from "../../../Functions/Helper/customStructureSetup";
import Job from "../../../Classes/job";
import { prefetchAccountTotalsQuery } from "../../../Hooks/React Query/Backend/statisticsTotals";
import getMissingESIData from "../../../Functions/Shared/getMissingESIData";
import { loadAllRelatedJobs } from "../../../Functions/Helper/getAllRelatedJobs";
import useUsersStore from "../../../Zustand/usersStore";

export function useEditJobInitialState({
  jobID,
  currentActiveJobID,
  actions,
  backupJobRef,
  setActiveJobID,
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });

  useEffect(() => {
    async function setInitialState() {
      if (jobID === currentActiveJobID) return;

      // The route's loader will not render this page without the job.
      const matchedJob = useUsersStore
        .getState()
        .jobData.actions.findJobInJobArray(jobID);

      try {
        // The whole chain, not the jobs one step away: what a material costs is
        // walked all the way down, so a job further along that nothing has been
        // fetched for drops its install cost out of every figure above it.
        const linkedJobs = await loadAllRelatedJobs(jobID);

        if (useUsersStore.getState().account.isLoggedIn) {
          await prefetchAccountTotalsQuery(queryClient, matchedJob.itemID);
        }

        const { requestedSystemIndexes } = await getMissingESIData(linkedJobs);

        const getCustomStructureWithID =
          useUsersStore.getState().applicationSettings.actions
            .getCustomStructureWithID;
        clearOrphanedCustomStructureOnSetups(
          matchedJob.build.setup,
          getCustomStructureWithID,
        );

        if (!matchedJob.layout.setupToEdit) {
          matchedJob.layout.setupToEdit =
            Object.keys(matchedJob.build.setup)[0] || null;
        }
        useUsersStore
          .getState()
          .worldData.actions.addSystemIndex(requestedSystemIndexes);

        backupJobRef.current = new Job(matchedJob);

        const activeJobObject = new Job(matchedJob);

        actions.setActiveJob(activeJobObject);
        setActiveJobID(activeJobObject.jobID);
        actions.setIsLoading(false);
      } catch (err) {
        console.error("Error importing job data:", err);
        navigate({ to: "/jobplanner" });
      }
    }

    setInitialState();
  }, [
    actions,
    backupJobRef,
    currentActiveJobID,
    jobID,
    navigate,
    queryClient,
    setActiveJobID,
  ]);
}
