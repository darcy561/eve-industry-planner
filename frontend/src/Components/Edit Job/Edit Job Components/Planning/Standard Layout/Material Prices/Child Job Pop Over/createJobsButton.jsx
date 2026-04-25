import { Button } from "@mui/material";
import { trackNewJobsCreated } from "../../../../../../../analytics/trackNewJobsCreated";
import { finalizeCreatedChildJobs } from "../Helpers/finalizeCreatedChildJobs";
import { resolveMaterialChildJobStatus } from "../Helpers/materialChildJobs";

export function CancelCreateChildJobButton_ChildJobPopoverFrame({
  state,
  actions,
  material,
}) {
  const { tempJob } = resolveMaterialChildJobStatus({
    state,
    materialTypeID: material.typeID,
  });

  return (
    <Button
      size="small"
      onClick={() => {
        if (!tempJob) return;
        actions.markChildJobsForRemoval(tempJob);
      }}
    >
      Cancel Creation
    </Button>
  );
}
export function CreateChildJobButton_ChildJobPopoverFrame({
  actions,
  childJobObjects,
  material,
}) {
  return (
    <Button
      size="small"
      onClick={async () => {
        const job = childJobObjects.find((j) => j.itemID === material.typeID);
        if (!job) {
          return;
        }
        await finalizeCreatedChildJobs({
          jobsForMissingDataAndRecalc: job,
          jobsToMarkForAddition: job,
          actions,
        });
        trackNewJobsCreated(job);
      }}
    >
      Mark For Creation
    </Button>
  );
}
