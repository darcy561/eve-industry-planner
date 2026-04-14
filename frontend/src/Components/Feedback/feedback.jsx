import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  Link,
  TextField,
} from "@mui/material";
import { useState } from "react";
import DOMPurify from "dompurify";
import submitFeedback from "../../Functions/Endpoints/Public/feedback";
import { MAX_FEEDBACK_LENGTH } from "../../Functions/Endpoints/Public/apiLimits.js";
import { showSnackbarSuccess, showSnackbarError } from "../../Events/snackbarEvents";

export function FeedbackIcon() {
  const [open, setOpen] = useState(false);
  const [inputText, updateInputText] = useState("");

  async function handleSubmit() {
    if (!inputText || inputText.trim().length === 0) {
      showSnackbarError("Feedback content is required");
      return;
    }

    // Sanitize the feedback content using DOMPurify
    const sanitizedContent = DOMPurify.sanitize(inputText, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });

    if (!sanitizedContent || sanitizedContent.trim().length === 0) {
      console.error("Feedback content is empty after sanitization");
      showSnackbarError("Feedback content is required");
      return;
    }

    if (sanitizedContent.length > MAX_FEEDBACK_LENGTH) {
      showSnackbarError(
        `Feedback must be at most ${MAX_FEEDBACK_LENGTH} characters`
      );
      return;
    }

    const success = await submitFeedback(sanitizedContent);
    
    if (success) {
      setOpen(false);
      updateInputText(""); // Clear the input
      showSnackbarSuccess("Feedback Submitted");
    } else {
      // Error handling is done in submitFeedback, but we could show an error snackbar here if needed
      console.error("Failed to submit feedback");
    }
  }

  return (
    <>
      <Fab
        color="primary"
        size="small"
        variant="extended"
        sx={{
          position: "fixed",
          bottom: "10px ",
          right: "5px",
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
        onClick={() => {
          setOpen(true);
        }}
      >
        Feedback
      </Fab>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          updateInputText(""); // Clear input when dialog closes
        }}
      >
        <DialogTitle color="primary" align="center">
          Feedback
        </DialogTitle>
        <DialogContent align="center">
          As development continues, I would love to hear back from you with
          ideas or thoughts regarding this application.{<br />}
          {<br />}Are there features you would like to see or are you having
          trouble doing something in particular, include any contact details or
          join the{" "}
          <Link href="https://discord.gg/KGSa8gh37z" underline="hover">
            Discord
          </Link>{" "}
          if you would like further assistance.
        </DialogContent>
        <DialogActions>
          <TextField
            multiline
            minRows={5}
            fullWidth
            value={inputText}
            inputProps={{ maxLength: MAX_FEEDBACK_LENGTH }}
            helperText={`${inputText.length}/${MAX_FEEDBACK_LENGTH}`}
            onChange={(e) => {
              updateInputText(e.target.value);
            }}
          />
        </DialogActions>
        <DialogActions>
          <Button
            onClick={() => {
              setOpen(false);
              updateInputText(""); // Clear input when closing
            }}
          >
            Close
          </Button>
          <Button variant="contained" onClick={handleSubmit}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
