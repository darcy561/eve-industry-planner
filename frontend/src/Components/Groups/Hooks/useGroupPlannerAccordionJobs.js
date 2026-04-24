import { useMemo } from "react";

import useUsersStore from "../../../Zustand/usersStore";
import { filterJobsVisibleInActiveGroup } from "../../../Functions/JobPlanner/plannerAccordionJobFilters";
import { sortJobsForPlannerStage } from "../../../Functions/JobPlanner/plannerStageJobSort";

/**
 * Sorted, visibility-filtered jobs for one workflow stage on the group planner accordion.
 *
 * @param {object[]} plannerJobs — jobs in the active group for this stage
 * @param {number|string} statusId
 * @returns {object[]}
 */
export function useGroupPlannerAccordionJobs(plannerJobs, statusId) {
  const activeGroupObject = useUsersStore((s) => {
    const id = s.jobData.activeGroupID;
    return s.jobData.groupArray?.find((g) => g.groupID === id) ?? null;
  });

  return useMemo(() => {
    const visible = filterJobsVisibleInActiveGroup(
      plannerJobs,
      activeGroupObject
    );
    return sortJobsForPlannerStage(visible, Number(statusId));
  }, [plannerJobs, activeGroupObject, statusId]);
}
