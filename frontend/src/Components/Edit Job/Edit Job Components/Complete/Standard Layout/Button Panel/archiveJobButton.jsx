import { Button, Tooltip } from "@mui/material";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { markJobsArchivedInGroups } from "../../../../../../Functions/Groups/markJobsArchivedInGroups.js";
import {
  archiveJobsOnServer,
  releaseEsiLinksOf,
} from "../../../../../../Functions/Job/changes/jobChange.js";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { invalidateArchiveQueries } from "../../../../../../Hooks/React Query/Backend/archivedJobsList";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import { yieldEditJobDocumentLocksOnLeave } from "../../../../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { jobDraftNow } from "../../../../Edit Job Hooks/useJobDraft";

export function ArchiveJobButton() {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { removeJobsFromJobArray } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });
  const queryClient = useQueryClient();
  const jobLockReadOnly = useActiveJobReadOnly();

  const archiveJobProcess = async () => {
    if (jobLockReadOnly) return;
    const job = jobDraftNow();
    const { jobData } = useUsersStore.getState();
    const wasQueued = job.jobID in (jobData.pendingJobDocumentWrites ?? {});
    const owed = jobData.actions.takeQueuedJobDocumentWrites([job.jobID]);

    if (!(await archiveJobsOnServer([job]))) {
      const held = jobData.actions.findJobInJobArray(job.jobID);
      if (wasQueued && held) {
        jobData.actions.queueJobDocumentWritesFromJobs([held], owed);
      }
      return;
    }

    invalidateArchiveQueries(queryClient);
    await markJobsArchivedInGroups([job]);
    showSnackbarSuccess(`${job.name} Archived`);

    await releaseEsiLinksOf([job], "archived");
    removeJobsFromJobArray(job.jobID);
    await yieldEditJobDocumentLocksOnLeave({ jobID });
    navigate({ to: "/jobplanner" });
  };

  if (!isLoggedIn || activeGroupID) {
    return null;
  }

  return (
    <Tooltip
      arrow
      title={
        jobLockReadOnly
          ? lockReasonText({ action: "archiving is disabled" })
          : "Removes the job from your planner but stores the data for later use in reporting and cost calculations. If you do not wish to store this job data then simply delete the job."
      }
    >
      <span>
        <Button
          color="primary"
          variant="contained"
          size="small"
          onClick={archiveJobProcess}
          disabled={jobLockReadOnly}
          sx={{ margin: 1 }}
        >
          Archive Job
        </Button>
      </span>
    </Tooltip>
  );
}
