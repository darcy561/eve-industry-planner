import { Button, Typography } from "@mui/material";
import ContentDialog, {
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";

export default function GeneralDialog() {
  const [messageData, , resetDialog] = useDialogEventState(
    "notificationDialog",
    () => ({
      isOpen: false,
      title: "",
      body: "",
      buttonText: "",
      id: "",
    }),
  );

  const handleClose = () => {
    resetDialog();
  };

  if (!messageData.isOpen) return null;

  return (
    <ContentDialog
      key={messageData.id}
      open={messageData.isOpen}
      onClose={handleClose}
      title={messageData.title ? messageData.title : undefined}
      dialogTitleProps={{ id: "GeneralNotificationDialog" }}
      componentName="GeneralDialog"
      maxWidth="sm"
      fullWidth
      actions={
        <Button onClick={handleClose} autoFocus>
          {messageData.buttonText}
        </Button>
      }
      dialogContentSx={{
        paddingTop: 1,
        paddingBottom: 2,
      }}
    >
      <Typography color="text.secondary" variant="body2" component="div">
        {messageData.body}
      </Typography>
    </ContentDialog>
  );
}
