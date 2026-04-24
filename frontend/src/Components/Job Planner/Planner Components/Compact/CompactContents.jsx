import { Grid } from "@mui/material";

import { CompactGroupJobCard } from "./CompactGroupJobCard";
import { CompactJobCardFrame } from "./CompactJobCardFrame";
import { PlannerCompactJobSkeletonList } from "../../../../Styled Components/PlannerAccordionJobSkeletons/PlannerAccordionJobSkeletons";
import { useJobPlannerStageSkeletonCount } from "../../../../Hooks/Planner/usePlannerInboundSkeletonCount";
import { useJobPlannerAccordionJobs } from "../../Hooks/useJobPlannerAccordionJobs";

export function CompactAccordionContents({
  status,
  skeletonElementsToDisplay,
}) {
  const { filteredGroups, filteredAndSortedJobs } =
    useJobPlannerAccordionJobs(status);
  const { skeletonCount } = useJobPlannerStageSkeletonCount(
    status,
    skeletonElementsToDisplay
  );

  return (
    <Grid container>
      <Grid size={12}>
        {filteredGroups.map((group) => (
          <CompactGroupJobCard key={group.groupID} group={group} />
        ))}
        {filteredAndSortedJobs.map((job) => (
          <CompactJobCardFrame key={job.jobID} job={job} />
        ))}
        {skeletonCount > 0 && (
          <PlannerCompactJobSkeletonList count={skeletonCount} />
        )}
      </Grid>
    </Grid>
  );
}
