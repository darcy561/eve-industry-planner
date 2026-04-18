import CloseIcon from "@mui/icons-material/Close";
import {
  Button,
  CircularProgress,
  Fab,
  IconButton,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import {
  FEEDBACK_DIALOG_EVENT,
  openFeedbackDialog,
} from "../../../Events/feedbackDialogEvents";
import { useFormStatus } from "react-dom";
import DOMPurify from "dompurify";
import submitFeedback from "../../../Functions/Endpoints/Public/feedback";
import { MAX_FEEDBACK_LENGTH } from "../../../Functions/Endpoints/Public/apiLimits.js";
import {
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  MAX_FEEDBACK_SCREENSHOT_COUNT,
} from "../../../Functions/Sentry/feedbackSentry.js";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../Events/snackbarEvents";
import GLOBAL_CONFIG from "../../../global-config-app";
import { buildScreenshotAdditions } from "./feedbackScreenshotHelpers.js";
import ContentDialog, {
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";

const { DEFAULT_DISCORD_INVITE } = GLOBAL_CONFIG;

export function FeedbackIcon() {
  const [messageData, , resetDialog] = useDialogEventState(
    FEEDBACK_DIALOG_EVENT,
    () => ({ isOpen: false }),
  );
  const [formKey, setFormKey] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [screenshots, setScreenshots] = useState([]);
  const screenshotsRef = useRef([]);
  screenshotsRef.current = screenshots;

  function clearScreenshots() {
    setScreenshots([]);
  }

  function handleClose() {
    resetDialog();
    setFeedbackText("");
    clearScreenshots();
  }

  async function feedbackFormAction(formData) {
    const inputText = String(formData.get("response") ?? "");
    const contactName = String(formData.get("contactName") ?? "").trim();
    const contactInfo = String(formData.get("contactInfo") ?? "").trim();
    const screenshotFiles = screenshotsRef.current.map((s) => s.file);

    if (!inputText.trim()) {
      showSnackbarError("Feedback content is required");
      return;
    }

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
        `Feedback must be at most ${MAX_FEEDBACK_LENGTH} characters`,
      );
      return;
    }

    for (const f of screenshotFiles) {
      if (f.size > MAX_FEEDBACK_SCREENSHOT_BYTES) {
        showSnackbarError(
          `Each screenshot must be at most ${MAX_FEEDBACK_SCREENSHOT_BYTES / (1024 * 1024)} MB`,
        );
        return;
      }
    }

    if (screenshotFiles.length > MAX_FEEDBACK_SCREENSHOT_COUNT) {
      showSnackbarError(
        `You can attach at most ${MAX_FEEDBACK_SCREENSHOT_COUNT} screenshots.`,
      );
      return;
    }

    const success = await submitFeedback({
      response: sanitizedContent,
      contactName,
      contactInfo,
      screenshotFiles,
    });

    if (success) {
      handleClose();
      showSnackbarSuccess("Feedback Submitted");
    } else {
      console.error("Failed to submit feedback");
      showSnackbarError("Could not submit feedback. Please try again.");
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
          setFormKey((k) => k + 1);
          setFeedbackText("");
          clearScreenshots();
          openFeedbackDialog();
        }}
      >
        Feedback
      </Fab>

      <ContentDialog
        open={messageData.isOpen}
        onClose={handleClose}
        title="Feedback"
        componentName="FeedbackDialog"
        maxWidth="sm"
        fullWidth
        formKey={formKey}
        formProps={{
          action: feedbackFormAction,
          noValidate: true,
        }}
        dialogContentSx={{ textAlign: "left" }}
        actions={
          <>
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
            <FeedbackSubmitButton />
          </>
        }
      >
        <Typography component="div" color="text.primary" sx={{ mb: 2, textAlign: "center" }}>
          As development continues, I would love to hear back from you with
          ideas or thoughts regarding this application.
          <br />
          <br />
          Are there features you would like to see or are you having trouble
          doing something in particular? Use the optional contact field below if
          you want a reply, or join the{" "}
          <Link href={DEFAULT_DISCORD_INVITE} underline="hover">
            Discord
          </Link>{" "}
          if you would like further assistance.
        </Typography>

        <Stack spacing={2} sx={{ width: "100%" }}>
          <TextField
            multiline
            minRows={5}
            fullWidth
            label="Your feedback"
            name="response"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            slotProps={{ htmlInput: { maxLength: MAX_FEEDBACK_LENGTH } }}
            helperText={`${feedbackText.length}/${MAX_FEEDBACK_LENGTH}`}
          />
          <TextField
            fullWidth
            label="Name (optional)"
            name="contactName"
            defaultValue=""
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            fullWidth
            multiline
            label="Contact (optional)"
            name="contactInfo"
            placeholder="E.g. in-game character name, Discord handle, or email"
            defaultValue=""
            helperText="If you want a follow-up, add how we can reach you (character name, Discord, email, etc.)."
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Stack spacing={1}>
            <Button
              variant="outlined"
              component="label"
              size="small"
              disabled={screenshots.length >= MAX_FEEDBACK_SCREENSHOT_COUNT}
            >
              Add screenshots (optional, max {MAX_FEEDBACK_SCREENSHOT_COUNT})
              <input
                type="file"
                hidden
                multiple
                accept="image/*"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  e.target.value = "";
                  if (picked.length === 0) {
                    return;
                  }
                  setScreenshots((prev) => {
                    const { entries, errorMessage } =
                      buildScreenshotAdditions(picked, prev.length);
                    if (errorMessage) {
                      queueMicrotask(() =>
                        showSnackbarError(errorMessage),
                      );
                    }
                    if (entries.length === 0) {
                      return prev;
                    }
                    return [...prev, ...entries];
                  });
                }}
              />
            </Button>
            {screenshots.length > 0 ? (
              <Stack spacing={0.5} sx={{ width: "100%" }}>
                {screenshots.map((row) => (
                  <Stack
                    key={row.id}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ minWidth: 0 }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row.file.name}
                    >
                      {row.file.name}
                    </Typography>
                    <IconButton
                      type="button"
                      size="small"
                      aria-label={`Remove ${row.file.name}`}
                      onClick={() =>
                        setScreenshots((prev) =>
                          prev.filter((s) => s.id !== row.id),
                        )
                      }
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Stack>
      </ContentDialog>
    </>
  );
}

function FeedbackSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      variant="contained"
      type="submit"
      disabled={pending}
      startIcon={
        pending ? (
          <CircularProgress size={16} color="inherit" aria-hidden />
        ) : undefined
      }
    >
      {pending ? "Submitting…" : "Submit"}
    </Button>
  );
}
