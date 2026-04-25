import { Box, Button, Typography } from "@mui/material";
import ContentDialog from "../../Styled Components/Dialog/ContentDialog";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onDiscard
 * @param {() => void | Promise<void>} props.onSave
 * @param {boolean} props.leaveSaving
 * @param {string} props.currentJobName
 * @param {string|null} props.nextJobName
 */
export default function EditJobLeaveConfirmDialog({
  open,
  onClose,
  onDiscard,
  onSave,
  leaveSaving,
  currentJobName,
  nextJobName,
}) {
  return (
    <ContentDialog
      open={open}
      onClose={onClose}
      title="Unsaved changes"
      componentName="EditJobLeaveConfirm"
      maxWidth="sm"
      fullWidth
      dialogSx={{ zIndex: (theme) => theme.zIndex.modal + 400 }}
      helperArea={
        <Box sx={{ px: 2 }}>
          <Typography variant="body2" color="text.secondary" component="div">
            Save changes to <strong>{currentJobName}</strong> before opening another job, or
            discard and lose unsaved edits on this job.
          </Typography>
          {nextJobName ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {`Next job: "${nextJobName}".`}
            </Typography>
          ) : null}
        </Box>
      }
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
          <Button
            variant="contained"
            onClick={() => {
              void onSave();
            }}
            disabled={leaveSaving}
          >
            {leaveSaving ? "Saving…" : "Save"}
          </Button>
        </>
      }
      dialogActionsProps={{
        sx: { justifyContent: "flex-end", px: 2, pb: 2 },
      }}
    />
  );
}
