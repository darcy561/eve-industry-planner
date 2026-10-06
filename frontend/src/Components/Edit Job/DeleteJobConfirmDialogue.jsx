import { useTransition } from "react";
import { Button, Typography } from "@mui/material";
import ContentDialogue from "../../Styled Components/Dialogue/ContentDialogue";
import { useJobCommitment } from "../../Hooks/Planner/useJobCommitment";
import { useJobDraft, useParentJobIDs } from "./Edit Job Hooks/useJobDraft";

function WhatIsLost() {
  const parentCount = useParentJobIDs().length;
  const { committed } = useJobCommitment();

  return (
    <Typography variant="body2" color="text.secondary">
      {parentCount > 0 ? (
        <>
          It is linked to{" "}
          <strong>
            {parentCount} parent job{parentCount === 1 ? "" : "s"}
          </strong>
          {committed > 0
            ? `, which will lose the ${committed.toLocaleString()} units it was covering`
            : ""}
          .{" "}
        </>
      ) : null}
      This cannot be undone.
    </Typography>
  );
}

/**
 * Asks before the open job is deleted, naming it and what its parent jobs lose.
 *
 * @param {{open: boolean, onClose: () => void, onDelete: () => Promise<void>}} props
 */
export default function DeleteJobConfirmDialogue({ open, onClose, onDelete }) {
  const name = useJobDraft((job) => job.name);
  const [isDeleting, startDeleting] = useTransition();

  return (
    <ContentDialogue
      open={open}
      onClose={isDeleting ? undefined : onClose}
      title={`Delete ${name}?`}
      componentName="DeleteJobConfirm"
      useAppShellDesign
      maxWidth="xs"
      fullWidth
      actions={
        <>
          <Button onClick={onClose} disabled={isDeleting}>
            Keep it
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={isDeleting}
            onClick={() => startDeleting(onDelete)}
          >
            {isDeleting ? "Deleting…" : "Delete the job"}
          </Button>
        </>
      }
    >
      <WhatIsLost />
    </ContentDialogue>
  );
}
