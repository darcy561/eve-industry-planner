import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { calculateInstallCostfromSetup } from "../../../Functions/Installation Costs/installCosts";
import { clearOrphanedCustomStructureOnSetups } from "../../../Functions/Helper/customStructureSetup";
import Job from "../../../Classes/job";
import { prefetchAccountTotalsQuery } from "../../../Hooks/React Query/Backend/statisticsTotals";
import getMissingESIData from "../../../Functions/Shared/getMissingESIData";
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

      const matchedJob = useUsersStore
        .getState()
        .jobData.actions.findJobInJobArray(jobID);

      if (!matchedJob) {
        console.error("Unable to find job document");
        navigate({ to: "/jobplanner" });
        return;
      }

      try {
        const linkedJobs = await useUsersStore
          .getState()
          .jobData.actions.jobsFromIdsOrObjects([
            ...matchedJob.relatedJobIDs,
            jobID,
          ]);

        if (useUsersStore.getState().account.isLoggedIn) {
          await prefetchAccountTotalsQuery(queryClient, matchedJob.itemID);
        }

        const { requestedMarketData, requestedSystemIndexes } =
          await getMissingESIData(linkedJobs);

        const getCustomStructureWithID =
          useUsersStore.getState().applicationSettings.actions
            .getCustomStructureWithID;
        clearOrphanedCustomStructureOnSetups(
          matchedJob.build.setup,
          getCustomStructureWithID
        );

        for (const setup of Object.values(matchedJob.build.setup)) {
          setup.estimatedInstallCost = calculateInstallCostfromSetup(
            setup,
            requestedMarketData,
            requestedSystemIndexes
          );
        }

        if (!matchedJob.layout.setupToEdit) {
          matchedJob.layout.setupToEdit =
            Object.keys(matchedJob.build.setup)[0] || null;
        }

        useUsersStore
          .getState()
          .worldData.actions.addMarketData(requestedMarketData);
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
