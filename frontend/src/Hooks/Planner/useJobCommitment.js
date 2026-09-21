import { useMemo } from "react";

import {
  parentCommitment,
  resolveParentRequirements,
} from "../../Functions/Groups/parentRequirements";
import useUsersStore from "../../Zustand/usersStore";
import {
  useJobDraft,
  useParentJobIDs,
} from "../../Components/Edit Job/Edit Job Hooks/useJobDraft";
import { quantityProduced } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * How much of a job's output is owed to the jobs above it, and how much is left
 * to sell.
 *
 * Read through one hook because three panels on the Planning stage act on it and
 * must agree: Returns prices the surplus, Cost Breakdown charges fee and tax on
 * it, and Skills only asks what selling costs when there is something to sell.
 * Two of them deriving it separately is how they come to disagree.
 *
 * @returns {import("../../Functions/Groups/parentRequirements").ParentCommitment}
 */
export function useJobCommitment() {
  const findJobInJobArray = useUsersStore(
    (store) => store.jobData.actions.findJobInJobArray,
  );
  const setups = useJobDraft((job) => job.build.setup);
  const itemsProducedPerRun = useJobDraft((job) => job.itemsProducedPerRun);
  const jobID = useJobDraft((job) => job.jobID);
  const itemID = useJobDraft((job) => job.itemID);
  const parentJobIDs = useParentJobIDs();
  const parentKey = parentJobIDs.join(",");

  return useMemo(
    () =>
      parentCommitment({
        produced: quantityProduced(setups, itemsProducedPerRun),
        jobID,
        hasParents: parentJobIDs.length > 0,
        requirements: resolveParentRequirements({
          parentJobIDs,
          findJobInJobArray,
          itemID,
          jobID,
        }),
      }),
    // The ids are a string because the list is rebuilt on every read of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setups, itemsProducedPerRun, jobID, itemID, findJobInJobArray, parentKey],
  );
}
