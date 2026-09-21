import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import checkJobTypeIsBuildable from "../../../../../../../Functions/Helper/checkJobTypeIsBuildable";
import { findMaterialJobInGroup } from "../../../../../../../Functions/Groups/findMaterialJobInGroup.js";
import {
  buildChildJobs,
  hydrateChildJobsWithMissingData,
} from "../Helpers/childJobBuildPipeline";
import {
  useJobActions,
  useJobDraft,
} from "../../../../../Edit Job Hooks/useJobDraft";
import {
  materialRequirementOf,
  selectedSetupOf,
} from "../../../../../Edit Job Hooks/jobSelectors";
import useUsersStore from "../../../../../../../Zustand/usersStore";

/**
 * Building a child job for a material, either one row at a time or every
 * buildable row at once.
 *
 * @returns {{buildSingleChildJobPreview: function, buildSpeculativeChildJobs: function}}
 */
export function useChildJobBuildActions() {
  const queryClient = useQueryClient();
  const actions = useJobActions();
  const jobID = useJobDraft((job) => job.jobID);
  const groupID = useJobDraft((job) => job.groupID);
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const materials = useJobDraft((job) => job.build.materials);
  const childJobs = useJobDraft((job) => job.build.childJobs);
  const setups = useJobDraft((job) => job.build.setup);
  const setupToEdit = useJobDraft((job) => job.layout.setupToEdit);
  const temporaryChildJobs = useUsersStore(
    (store) => store.editSession.temporaryChildJobs,
  );
  const speculativeChildJobs = useUsersStore(
    (store) => store.editSession.speculativeChildJobs,
  );
  const systemID = selectedSetupOf(setups, setupToEdit)?.systemID;

  const buildSingleChildJobPreview = useCallback(
    async ({ material }) => {
      const builtJobs = await buildChildJobs(
        {
          itemID: material.typeID,
          itemQty: materialRequirementOf(setups, material.typeID),
          parentJobs: [jobID],
          groupID,
          systemID,
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
    [actions, queryClient, jobID, groupID, systemID, setups],
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
    const uncosted = Object.values(materials).filter(({ jobType, typeID }) => {
      if (!checkJobTypeIsBuildable(jobType)) return false;
      // A row with something already linked or marked has a real build cost
      // and does not need a guess beside it.
      if ((childJobs[typeID] ?? []).length > 0) return false;
      if (temporaryChildJobs[typeID]) return false;
      return !speculativeChildJobs?.[typeID];
    });

    // A group that already builds this material answers the question without
    // being asked again: its job is what confirming would link to, so pricing a
    // fresh one instead would quote a figure the plan would never use.
    const seeded = [];
    const requests = [];
    for (const { typeID } of uncosted) {
      const groupJob = includedInGroup
        ? findMaterialJobInGroup(typeID, groupID)
        : null;

      if (groupJob) {
        seeded.push(groupJob);
        continue;
      }

      requests.push({
        itemID: typeID,
        itemQty: materialRequirementOf(setups, typeID),
        parentJobs: [jobID],
        groupID,
        systemID,
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
    jobID,
    groupID,
    includedInGroup,
    materials,
    childJobs,
    setups,
    systemID,
    speculativeChildJobs,
    temporaryChildJobs,
  ]);

  return {
    buildSingleChildJobPreview,
    buildSpeculativeChildJobs,
  };
}
