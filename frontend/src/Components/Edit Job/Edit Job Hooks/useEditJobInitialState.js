import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { clearOrphanedCustomStructureOnSetups } from "../../../Functions/Custom Structures/customStructureSetup";
import {
  jobFromDocument,
  toDocument,
} from "../../../Functions/JobDocuments/jobDocument";
import { prefetchAccountTotalsQuery } from "../../../Hooks/React Query/Backend/statisticsTotals";
import getMissingESIData from "../../../Functions/Shared/getMissingESIData";
import { loadAllRelatedJobs } from "../../../Functions/Helper/getAllRelatedJobs";
import useUsersStore from "../../../Zustand/usersStore";

export function useEditJobInitialState({ jobID, currentActiveJobID, actions }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });

  useEffect(() => {
    let open = true;

    async function setInitialState() {
      if (jobID === currentActiveJobID) return;

      const matchedJob = useUsersStore
        .getState()
        .jobData.actions.findJobInJobArray(jobID);

      try {
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

        if (!open) return;

        actions.openJob(
          matchedJob.jobID,
          toDocument(jobFromDocument(matchedJob)),
        );
      } catch (err) {
        console.error("Error importing job data:", err);
        navigate({ to: "/jobplanner" });
      }
    }

    setInitialState();

    return () => {
      open = false;
    };
  }, [actions, currentActiveJobID, jobID, navigate, queryClient]);
}
