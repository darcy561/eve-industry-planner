import { Button, Typography } from "@mui/material";
import ContentDialogue, {
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";

export default function GeneralDialogue() {
  const [messageData, , resetDialogue] = useDialogueEventState(
    "notificationDialogue",
    () => ({
      isOpen: false,
      title: "",
      body: "",
      buttonText: "",
      id: "",
    }),
  );

  const handleClose = () => {
    resetDialogue();
  };

  if (!messageData.isOpen) return null;

  return (
    <ContentDialogue
      key={messageData.id}
      open={messageData.isOpen}
      onClose={handleClose}
      title={messageData.title ? messageData.title : undefined}
      dialogueTitleProps={{ id: "GeneralNotificationDialogue" }}
      componentName="GeneralDialogue"
      maxWidth="sm"
      fullWidth
      actions={
        <Button onClick={handleClose} autoFocus>
          {messageData.buttonText}
        </Button>
      }
      dialogueContentSx={{
        paddingTop: 1,
        paddingBottom: 2,
      }}
    >
      <Typography color="text.secondary" variant="body2" component="div">
        {messageData.body}
      </Typography>
    </ContentDialogue>
  );
}
