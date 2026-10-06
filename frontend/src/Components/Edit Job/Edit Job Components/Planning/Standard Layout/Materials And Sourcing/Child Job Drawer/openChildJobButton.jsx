import { useState } from "react";
import { Button } from "@mui/material";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { leaveEditedJobWhereItStands } from "../../../../../../../Functions/Job/editing/editSessionLifetime.js";
import EditJobLeaveConfirmDialogue from "../../../../../EditJobLeaveConfirmDialogue";
import { yieldEditJobDocumentLocksOnLeave } from "../../../../../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { useActiveJobPersistGate } from "../../../../../Edit Job Hooks/useActiveJobDocumentLock";
import {
  useJobDraft,
  useJobModified,
} from "../../../../../Edit Job Hooks/useJobDraft";
import { saveOpenJob } from "../../../../../Edit Job Hooks/saveOpenJob";
import { useOpenJob } from "../../../../../Edit Job Hooks/useOpenJob";

export function OpenChildJobButton({ childJobObjects, jobDisplay }) {
  const jobName = useJobDraft((job) => job.name);
  const jobModified = useJobModified();
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const openJob = useOpenJob();
  const { jobID: routeJobID } = useParams({ from: "/editjob/$jobID" });
  const queryClient = useQueryClient();
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const persist = useActiveJobPersistGate();

  const closeFallbackDialogue = () => {
    if (leaveSaving) return;
    setFallbackOpen(false);
    setPendingNav(null);
  };

  const navigateToPendingJob = async () => {
    if (!pendingNav) return;
    await yieldEditJobDocumentLocksOnLeave({ jobID: routeJobID });
    navigate({
      to: "/editjob/$jobID",
      params: { jobID: pendingNav.jobID },
      search: pendingNav.search,
    });
    setFallbackOpen(false);
    setPendingNav(null);
  };

  return (
    <>
      <Button
        size="small"
        onClick={() => {
          const childID = childJobObjects[jobDisplay].jobID;
          openJob(childID, {
            onUnhandled: jobModified
              ? (search) => {
                  setPendingNav({ jobID: childID, search });
                  setFallbackOpen(true);
                }
              : undefined,
          });
        }}
      >
        Open Child Job
      </Button>
      <EditJobLeaveConfirmDialogue
        open={fallbackOpen}
        onClose={closeFallbackDialogue}
        onDiscard={async () => {
          leaveEditedJobWhereItStands();
          await navigateToPendingJob();
        }}
        saveDisabled={!persist.canPersist}
        onSave={async () => {
          if (!pendingNav || !persist.canPersist) return;
          setLeaveSaving(true);
          try {
            if ((await saveOpenJob(queryClient)) === "kept-open") {
              closeFallbackDialogue();
              return;
            }
            navigateToPendingJob();
          } finally {
            setLeaveSaving(false);
          }
        }}
        leaveSaving={leaveSaving}
        currentJobName={jobName ?? ""}
        nextJobName={childJobObjects[jobDisplay]?.name ?? null}
      />
    </>
  );
}
