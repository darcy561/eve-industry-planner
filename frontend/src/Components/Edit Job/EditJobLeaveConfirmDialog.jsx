import { Box, Button, Tooltip, Typography } from "@mui/material";
import ContentDialog from "../../Styled Components/Dialog/ContentDialog";
import { lockReasonText } from "../DocumentLock/LockGatedTooltip";

/**
 * Confirmation dialog shared between two flows:
 *
 *   - `navigation` (default): user is leaving the edit page with unsaved
 *     changes. Save/discard advance to the next route; cancel stays.
 *   - `release_request`: another session has requested edit access while we
 *     hold the lock. Save/discard hand over; cancel keeps the lock and is
 *     treated as a denial of the request.
 *
 * Mode-specific copy is selected here so the dialog reads naturally; action
 * semantics live in the caller (`useEditJobLeaveConfirm`).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onDiscard
 * @param {() => void | Promise<void>} props.onSave
 * @param {boolean} props.leaveSaving
 * @param {string} props.currentJobName
 * @param {string|null} props.nextJobName
 * @param {"navigation" | "release_request"} [props.mode]
 * @param {boolean} [props.saveDisabled] - Hides the Save affordance when the
 *   active job is read-only (another session holds the lock). Discard / cancel
 *   stay available so the user can still leave or drop their local edits.
 */
export default function EditJobLeaveConfirmDialog({
  open,
  onClose,
  onDiscard,
  onSave,
  leaveSaving,
  currentJobName,
  nextJobName,
  mode = "navigation",
  saveDisabled = false,
}) {
  const isReleaseRequest = mode === "release_request";
  const title = isReleaseRequest ? "Hand over edit access" : "Unsaved changes";
  const helper = isReleaseRequest ? (
    <Box sx={{ px: 2 }}>
      <Typography variant="body2" color="text.secondary" component="div">
        Another session has requested edit access to{" "}
        <strong>{currentJobName}</strong>. Save or discard your changes to hand
        over editing. Closing this dialog keeps your edit access and treats the
        request as denied.
      </Typography>
    </Box>
  ) : (
    <Box sx={{ px: 2 }}>
      <Typography variant="body2" color="text.secondary" component="div">
        {saveDisabled ? (
          <>
            <strong>{currentJobName}</strong> is being edited in another session
            — saving is disabled. Discard your local edits to leave, or cancel
            to stay on this job in read-only view.
          </>
        ) : (
          <>
            Save changes to <strong>{currentJobName}</strong> before opening
            another job, or discard and lose unsaved edits on this job.
          </>
        )}
      </Typography>
      {nextJobName ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {`Next job: "${nextJobName}".`}
        </Typography>
      ) : null}
    </Box>
  );

  const saveButtonDisabled = leaveSaving || saveDisabled;
  const saveButton = (
    <Button
      variant="contained"
      onClick={() => {
        if (saveDisabled) return;
        void onSave();
      }}
      disabled={saveButtonDisabled}
    >
      {leaveSaving ? "Saving…" : "Save"}
    </Button>
  );

  return (
    <ContentDialog
      open={open}
      onClose={onClose}
      title={title}
      componentName="EditJobLeaveConfirm"
      maxWidth="sm"
      fullWidth
      dialogSx={{ zIndex: (theme) => theme.zIndex.modal + 400 }}
      helperArea={helper}
      actions={
        <>
          <Button onClick={onClose} disabled={leaveSaving}>
            Cancel
          </Button>
          <Button
            color="warning"
            variant="outlined"
            onClick={onDiscard}
            disabled={leaveSaving}
          >
            {"Don't save"}
          </Button>
          {saveDisabled ? (
            <Tooltip
              title={lockReasonText({ action: "saving is disabled" })}
              arrow
            >
              <span>{saveButton}</span>
            </Tooltip>
          ) : (
            saveButton
          )}
        </>
      }
      dialogActionsProps={{
        sx: { justifyContent: "flex-end", px: 2, pb: 2 },
      }}
    />
  );
}
