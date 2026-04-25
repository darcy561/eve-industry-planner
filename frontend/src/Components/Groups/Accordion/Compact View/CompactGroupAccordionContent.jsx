import { Grid } from "@mui/material";

import { CompactGroupJobCardFrame } from "./CompactGroupJobCardFrame";
import { PlannerCompactJobSkeletonList } from "../../../../Styled Components/PlannerAccordionJobSkeletons/PlannerAccordionJobSkeletons";
import { useGroupPlannerStageSkeletonCount } from "../../../../Hooks/Planner/usePlannerInboundSkeletonCount";
import { useGroupPlannerAccordionJobs } from "../../Hooks/useGroupPlannerAccordionJobs";

export function CompactGroupAccordionContent({
  status,
  plannerJobs,
  skeletonElementsToDisplay,
  highlightedItems,
  groupReadOnly = false,
  editReturnPageView,
}) {
  const sortedJobs = useGroupPlannerAccordionJobs(plannerJobs, status.id);
  const { skeletonCount } = useGroupPlannerStageSkeletonCount(
    status,
    skeletonElementsToDisplay
  );

  return (
    <Grid container>
      <Grid size={12}>
        {sortedJobs.map((job) => (
          <CompactGroupJobCardFrame
            key={job.jobID}
            job={job}
            skeletonElementsToDisplay={skeletonElementsToDisplay}
            highlightedItems={highlightedItems}
            groupReadOnly={groupReadOnly}
            editReturnPageView={editReturnPageView}
          />
        ))}
        {skeletonCount > 0 && (
          <PlannerCompactJobSkeletonList count={skeletonCount} />
        )}
      </Grid>
    </Grid>
  );
}
