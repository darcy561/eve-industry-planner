import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import checkJobTypeIsBuildable from "../../../../../../../Functions/Helper/checkJobTypeIsBuildable";
import { findMaterialJobInGroup } from "../../../../../../../Functions/Groups/findMaterialJobInGroup.js";
import { buildChildJobs, hydrateChildJobsWithMissingData } from "../Helpers/childJobBuildPipeline";
import { finaliseCreatedChildJobs } from "../Helpers/finaliseCreatedChildJobs";

export function useChildJobBuildActions({ state, actions }) {
  const queryClient = useQueryClient();

  const buildAllChildJobs = useCallback(async () => {
    const buildRequestArray = [];
    const groupJobsToLink = new Map();

    state.activeJob.build.materials.forEach(({ jobType, typeID, quantity }) => {
      if (!checkJobTypeIsBuildable(jobType)) return;
      const childJobLocation = state.activeJob.build.childJobs[typeID];
      const tempChildJob = state.temporaryChildJobs[typeID];
      if (groupJobCheck(typeID, state.activeJob.groupID, groupJobsToLink))
        return;

      if (childJobLocation.length > 0 || tempChildJob) return;

      buildRequestArray.push({
        itemID: typeID,
        itemQty: quantity,
        groupID: state.activeJob.groupID,
        parentJobs: [state.activeJob.jobID],
      });

      function groupJobCheck(requestedTypeID, requestedGroupID, outputMap) {
        if (!state.activeJob.includedInGroup) return false;
        const matchedGroupJob = findMaterialJobInGroup(
          requestedTypeID,
          requestedGroupID
        );
        if (!matchedGroupJob || childJobLocation.length > 0 || tempChildJob)
          return false;

        outputMap.set(requestedTypeID, matchedGroupJob);
        return true;
      }
    });

    const newJobs = await buildChildJobs(buildRequestArray, { queryClient });
    const allJobsToAdd = [...newJobs, ...groupJobsToLink.values()];
    if (allJobsToAdd.length === 0) return;

    await finaliseCreatedChildJobs({
      jobsForMissingDataAndRecalc: newJobs,
      jobsToMarkForAddition: allJobsToAdd,
      actions,
    });
  }, [actions, queryClient, state.activeJob, state.temporaryChildJobs]);

  const buildSingleChildJobPreview = useCallback(
    async ({ material }) => {
      const builtJobs = await buildChildJobs(
        {
          itemID: material.typeID,
          itemQty: material.quantity,
          parentJobs: [state.activeJob.jobID],
          groupID: state.activeJob.groupID,
          systemID:
            state.activeJob.build.setup[state.activeJob.layout.setupToEdit]
              .systemID,
          skipJobCreateAnalytics: true,
        },
        { queryClient }
      );

      const newJob = builtJobs[0];
      if (!newJob) return null;

      await hydrateChildJobsWithMissingData([newJob]);
      return newJob;
    },
    [queryClient, state.activeJob]
  );

  return {
    buildAllChildJobs,
    buildSingleChildJobPreview,
  };
}
