import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import DOMPurify from "dompurify";
import { captureFeedback } from "@sentry/react";
import { OPEN_SENTRY_CRASH_REPORT } from "../../../Events/crashReportEvents";
import ContentDialogue, {
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../Events/snackbarEvents";
import { MAX_FEEDBACK_LENGTH } from "../../../Functions/Endpoints/Public/apiLimits.js";
import {
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  MAX_FEEDBACK_SCREENSHOT_COUNT,
} from "../../../Functions/Sentry/feedbackSentry.js";
import { buildScreenshotAdditions } from "../Feedback/feedbackScreenshotHelpers.js";
import GLOBAL_CONFIG from "../../../global-config-app";

const { DEFAULT_DISCORD_INVITE } = GLOBAL_CONFIG;

/** Single-line email only; otherwise contact is appended to the message body. */
function parseContactEmail(contactInfo) {
  const t = String(contactInfo ?? "").trim();
  if (!t || t.includes("\n") || t.includes("\r")) {
    return null;
  }
  return /^\S+@\S+\.\S+$/.test(t) ? t : null;
}

function CrashReportSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="contained"
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

/**
 * Full dialogue + form; mounted only when a crash session is active.
 *
 * @param {{ eventId: string, hint: string, onDismiss: () => void }} props
 */
function CrashReportSession({ eventId, hint, onDismiss }) {
  const [feedbackText, setFeedbackText] = useState("");
  const [screenshots, setScreenshots] = useState([]);
  const screenshotsRef = useRef([]);
  screenshotsRef.current = screenshots;

  const [formError, formAction, isPending] = useActionState(
    async (_prevState, formData) => {
      const inputText = String(formData.get("response") ?? "");
      const contactName = String(formData.get("contactName") ?? "").trim();
      const contactInfo = String(formData.get("contactInfo") ?? "").trim();
      const screenshotFiles = screenshotsRef.current.map((s) => s.file);

      if (!inputText.trim()) {
        return "Feedback content is required";
      }

      const sanitizedContent = DOMPurify.sanitize(inputText, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      }).trim();

      if (!sanitizedContent) {
        return "Feedback content is required";
      }

      if (sanitizedContent.length > MAX_FEEDBACK_LENGTH) {
        return `Feedback must be at most ${MAX_FEEDBACK_LENGTH} characters`;
      }

      for (const f of screenshotFiles) {
        if (f.size > MAX_FEEDBACK_SCREENSHOT_BYTES) {
          return `Each screenshot must be at most ${MAX_FEEDBACK_SCREENSHOT_BYTES / (1024 * 1024)} MB`;
        }
      }

      if (screenshotFiles.length > MAX_FEEDBACK_SCREENSHOT_COUNT) {
        return `You can attach at most ${MAX_FEEDBACK_SCREENSHOT_COUNT} screenshots.`;
      }

      if (!import.meta.env.SENTRY_DSN) {
        return "Feedback is not configured.";
      }

      const contactEmail = parseContactEmail(contactInfo);
      let messageBody = sanitizedContent;
      if (contactInfo && !contactEmail) {
        messageBody = `${sanitizedContent}\n\nContact:\n${contactInfo}`;
      }

      const attachments = [];
      for (let i = 0; i < screenshotFiles.length; i++) {
        const file = screenshotFiles[i];
        const buf = new Uint8Array(await file.arrayBuffer());
        const baseName = file.name || `screenshot-${i + 1}.png`;
        const filename =
          screenshotFiles.length > 1 ? `${i + 1}-${baseName}` : baseName;
        attachments.push({
          filename,
          contentType: file.type || "image/png",
          data: buf,
        });
      }

      const sentryHint =
        attachments.length > 0 ? { attachments } : {};

      try {
        captureFeedback(
          {
            message: messageBody,
            name: contactName || undefined,
            email: contactEmail || undefined,
            associatedEventId: eventId,
            source: "crash_report",
            url:
              typeof window !== "undefined" ? window.location.href : undefined,
            tags: {
              feedback_source: "crash_report",
            },
          },
          sentryHint,
        );
      } catch (e) {
        console.error("Crash report captureFeedback failed:", e);
        return "Could not submit feedback. Please try again.";
      }

      showSnackbarSuccess("Feedback Submitted");
      onDismiss();
      return null;
    },
    null,
  );

  return (
    <ContentDialogue
      open
      onClose={() => {
        if (isPending) {
          return;
        }
        onDismiss();
      }}
      title="Help us fix this"
      componentName="CrashReportDialogue"
      maxWidth="sm"
      fullWidth
      disableRestoreFocus
      slotProps={{
        paper: {
          sx: { zIndex: (theme) => theme.zIndex.modal + 2 },
        },
      }}
      formProps={{ action: formAction }}
      dialogueContentSx={{ textAlign: "left" }}
      dialogueActionsProps={{ sx: { px: 3, pb: 2 } }}
      actions={
        <>
          <Button type="button" disabled={isPending} onClick={onDismiss}>
            Close
          </Button>
          <CrashReportSubmitButton />
        </>
      }
    >
      <Typography
        component="div"
        color="text.primary"
        sx={{ mb: 2, textAlign: "center" }}
      >
        This error was already reported. Adding what you were doing helps us
        reproduce it faster.
        <br />
        <br />
        Use the optional contact field if you want a reply, or join the{" "}
        <Link href={DEFAULT_DISCORD_INVITE} underline="hover">
          Discord
        </Link>{" "}
        if you would like further assistance.
        {hint ? (
          <>
            <br />
            <br />
            <Typography variant="caption" color="text.secondary" component="div">
              Technical summary:{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {hint}
              </Box>
            </Typography>
          </>
        ) : null}
      </Typography>

      <Stack spacing={2} sx={{ width: "100%" }}>
        {formError ? (
          <Typography variant="body2" color="error" role="alert">
            {formError}
          </Typography>
        ) : null}
        <TextField
          multiline
          minRows={5}
          fullWidth
          label="Your feedback"
          name="response"
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          required
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
    </ContentDialogue>
  );
}

/**
 * Renders outside the top-level {@link ErrorBoundary} so it stays mounted when that boundary shows a fallback.
 * Listens for {@link openSentryCrashReportDialogue} from `crashReportEvents` and submits via {@link captureFeedback} + `associatedEventId`.
 */
export function CrashReportDialogue() {
  const [messageData, , resetDialogue] = useDialogueEventState(
    OPEN_SENTRY_CRASH_REPORT,
    () => ({
      eventId: "",
      hint: "",
    }),
  );

  if (!messageData.eventId) {
    return null;
  }

  return (
    <CrashReportSession
      key={messageData.eventId}
      eventId={messageData.eventId}
      hint={messageData.hint}
      onDismiss={resetDialogue}
    />
  );
}
