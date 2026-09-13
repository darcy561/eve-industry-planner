import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import checkJobTypeIsBuildable from "../../../../../../../Functions/Helper/checkJobTypeIsBuildable";
import { findMaterialJobInGroup } from "../../../../../../../Functions/Groups/findMaterialJobInGroup.js";
import {
  buildChildJobs,
  hydrateChildJobsWithMissingData,
} from "../Helpers/childJobBuildPipeline";

export function useChildJobBuildActions({ state, actions }) {
  const queryClient = useQueryClient();

  const buildSingleChildJobPreview = useCallback(
    async ({ material }) => {
      const builtJobs = await buildChildJobs(
        {
          itemID: material.typeID,
          itemQty: material.quantity,
          parentJobs: [state.activeJob.jobID],
          groupID: state.activeJob.groupID,
          systemID: state.activeJob.selectedSetup.systemID,
          skipJobCreateAnalytics: true,
        },
        { queryClient },
      );

      const newJob = builtJobs[0];
      if (!newJob) return null;

      await hydrateChildJobsWithMissingData([newJob]);

      // Recorded beside the bulk-costed jobs rather than kept inside the drawer
      // that asked for it. The row's own Build control acts on this job, and a
      // price only the open drawer could see is what made confirming a material
      // mean expanding its row first.
      actions.recordSpeculativeChildJobs(newJob);

      return newJob;
    },
    [actions, queryClient, state.activeJob],
  );

  /**
   * Prices every buildable row that has nothing linked to it yet, by building a
   * speculative job for each and keeping them apart from the committed ones.
   *
   * Costs two batched requests whatever the row count — recipes come from the
   * cached file, and hydration asks for every job's market data and system
   * indexes in one go — and writes nothing outside the page, so the panel runs
   * it on arrival rather than offering it.
   *
   * @returns {Promise<number>} How many rows were costed
   */
  const buildSpeculativeChildJobs = useCallback(async () => {
    const uncosted = state.activeJob.build.materials.filter(
      ({ jobType, typeID }) => {
        if (!checkJobTypeIsBuildable(jobType)) return false;
        // A row with something already linked or marked has a real build cost
        // and does not need a guess beside it.
        if ((state.activeJob.build.childJobs[typeID] ?? []).length > 0)
          return false;
        if (state.temporaryChildJobs[typeID]) return false;
        return !state.speculativeChildJobs?.[typeID];
      },
    );

    // A group that already builds this material answers the question without
    // being asked again: its job is what confirming would link to, so pricing a
    // fresh one instead would quote a figure the plan would never use.
    const seeded = [];
    const requests = [];
    for (const { typeID, quantity } of uncosted) {
      const groupJob = state.activeJob.includedInGroup
        ? findMaterialJobInGroup(typeID, state.activeJob.groupID)
        : null;

      if (groupJob) {
        seeded.push(groupJob);
        continue;
      }

      requests.push({
        itemID: typeID,
        itemQty: quantity,
        parentJobs: [state.activeJob.jobID],
        groupID: state.activeJob.groupID,
        systemID: state.activeJob.selectedSetup?.systemID,
        skipJobCreateAnalytics: true,
      });
    }

    const built = requests.length
      ? await buildChildJobs(requests, { queryClient })
      : [];
    if (built.length === 0 && seeded.length === 0) return 0;

    if (built.length > 0) await hydrateChildJobsWithMissingData(built);

    actions.recordSpeculativeChildJobs([...seeded, ...built]);

    return seeded.length + built.length;
  }, [
    actions,
    queryClient,
    state.activeJob,
    state.speculativeChildJobs,
    state.temporaryChildJobs,
  ]);

  return {
    buildSingleChildJobPreview,
    buildSpeculativeChildJobs,
  };
}
