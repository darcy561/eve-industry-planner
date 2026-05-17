import { Button } from "@mui/material";
import { trackNewJobsCreated } from "../../../../../../../analytics/trackNewJobsCreated";
import { finalizeCreatedChildJobs } from "../Helpers/finalizeCreatedChildJobs";
import { resolveMaterialChildJobStatus } from "../Helpers/materialChildJobs";
import { useActiveGroupReadOnly } from "../../../../../Edit Job Hooks/useActiveJobDocumentLock";
import {
  LockGatedTooltip,
  lockReasonText,
} from "../../../../../../DocumentLock/LockGatedTooltip";

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
  state,
  actions,
  childJobObjects,
  material,
}) {
  /**
   * Creating a child also enrolls the new job in the active job's group when
   * the active job is grouped, so the group lock cascade gates this addition.
   * The per-job lock on the active job is intentionally *not* gated here so
   * users can still scout creates while the parent is read-only.
   */
  const groupLockReadOnly = useActiveGroupReadOnly(state);

  return (
    <LockGatedTooltip
      readOnly={groupLockReadOnly}
      reason={lockReasonText({
        scope: "group",
        action: "new child jobs can't be added",
      })}
    >
      <Button
        size="small"
        disabled={groupLockReadOnly}
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
    </LockGatedTooltip>
  );
}
