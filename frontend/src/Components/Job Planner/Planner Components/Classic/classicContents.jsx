import { Grid } from "@mui/material";
import { JobCardFrame } from "./ClassicJobCardFrame";
import { ClassicGroupJobCard } from "./ClassicGroupJobCard";
import { PlannerClassicJobSkeletonGrid } from "../../../../Styled Components/PlannerAccordionJobSkeletons/PlannerAccordionJobSkeletons";
import { useJobPlannerStageSkeletonCount } from "../../../../Hooks/Planner/usePlannerInboundSkeletonCount";
import { useJobPlannerAccordionJobs } from "../../Hooks/useJobPlannerAccordionJobs";

export function ClassicAccordionContents({
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
    <Grid container spacing={2} sx={{ height: "100%" }} size={12}>
      {filteredGroups.map((group) => (
        <ClassicGroupJobCard key={group.groupID} group={group} />
      ))}
      {filteredAndSortedJobs.map((job) => (
        <JobCardFrame key={job.jobID} job={job} />
      ))}
      {skeletonCount > 0 && (
        <PlannerClassicJobSkeletonGrid count={skeletonCount} />
      )}
    </Grid>
  );
}
