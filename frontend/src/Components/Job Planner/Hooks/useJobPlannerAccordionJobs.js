import { useMemo } from "react";

import useUsersStore from "../../../Zustand/usersStore";
import {
  filterGroupsForJobPlannerStage,
  filterJobsForJobPlannerStage,
} from "../../../Functions/JobPlanner/plannerAccordionJobFilters";
import { sortJobsForPlannerStage } from "../../../Functions/JobPlanner/plannerStageJobSort";

/**
 * Resolved rows for one workflow stage on the job planner accordion (groups + planner jobs).
 *
 * @param {{ id: number|string }} status - Stage from `useJobStatuses`
 * @returns {{ filteredGroups: object[], filteredAndSortedJobs: object[] }}
 */
export function useJobPlannerAccordionJobs(status) {
  const { groupArray, jobArray } = useUsersStore((state) => state.jobData);

  const filteredAndSortedJobs = useMemo(() => {
    const plannerJobs = filterJobsForJobPlannerStage(jobArray, status.id);
    return sortJobsForPlannerStage(plannerJobs, Number(status.id));
  }, [jobArray, status.id]);

  const filteredGroups = useMemo(
    () => filterGroupsForJobPlannerStage(groupArray, status.id),
    [groupArray, status.id]
  );

  return { filteredGroups, filteredAndSortedJobs };
}
