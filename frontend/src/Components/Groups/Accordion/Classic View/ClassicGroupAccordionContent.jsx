import { Grid } from "@mui/material";

import { ClassicGroupJobCardFrame } from "./ClassicGroupJobCardFrame";
import { PlannerClassicJobSkeletonGrid } from "../../../../Styled Components/PlannerAccordionJobSkeletons/PlannerAccordionJobSkeletons";
import { useGroupPlannerStageSkeletonCount } from "../../../../Hooks/Planner/usePlannerInboundSkeletonCount";
import { useGroupPlannerAccordionJobs } from "../../Hooks/useGroupPlannerAccordionJobs";

export function ClassicGroupAccordionContent({
  status,
  plannerJobs,
  skeletonElementsToDisplay,
  highlightedItems,
  groupReadOnly = false,
}) {
  const sortedJobs = useGroupPlannerAccordionJobs(plannerJobs, status.id);
  const { skeletonCount } = useGroupPlannerStageSkeletonCount(
    status,
    skeletonElementsToDisplay
  );

  return (
    <Grid container spacing={2} sx={{ height: "100%" }} size={12}>
      {sortedJobs.map((job) => (
        <ClassicGroupJobCardFrame
          key={job.jobID}
          job={job}
          highlightedItems={highlightedItems}
          groupReadOnly={groupReadOnly}
        />
      ))}
      {skeletonCount > 0 && (
        <PlannerClassicJobSkeletonGrid count={skeletonCount} />
      )}
    </Grid>
  );
}
