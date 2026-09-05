import { captureException } from "@sentry/react";
import { openSentryCrashReportDialogue } from "../../Events/crashReportEvents";

const CAPTURED_REACT_ERROR = Symbol.for("eip.sentry.reactErrorCaptured");

/** Tag so `beforeSend` in development can allow the event (needed for `captureFeedback` + crash UI). */
export const EIP_IN_APP_CRASH_PROMPT_TAG = "eip_in_app_crash_prompt";

/**
 * Capture a React error once, even if it bubbles through
 * boundaries and root-level handlers.
 *
 * @param {unknown} error
 * @param {import("@sentry/core").CaptureContext} [context]
 * @param {{ showCrashReportPrompt?: boolean }} [options] Pass `{ showCrashReportPrompt: false }` to skip the in-app crash report dialogue.
 */
export function captureReactErrorOnce(error, context = {}, options = {}) {
  if (!error || !import.meta.env.SENTRY_DSN) {
    return false;
  }

  const alreadyCaptured = error[CAPTURED_REACT_ERROR] === true;
  if (alreadyCaptured) {
    return false;
  }

  const captureContext = {
    ...context,
    tags: {
      ...context.tags,
      [EIP_IN_APP_CRASH_PROMPT_TAG]: "1",
    },
  };

  const eventId = captureException(error, captureContext);
  try {
    error[CAPTURED_REACT_ERROR] = true;
  } catch {
    // Non-extensible error objects are rare; best effort dedupe.
  }

  const wantPrompt = options.showCrashReportPrompt !== false;
  if (
    wantPrompt &&
    import.meta.env.SENTRY_DSN &&
    typeof eventId === "string" &&
    eventId.length > 0
  ) {
    const hint =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
    // Defer past the current commit so error-boundary fallbacks paint first.
    queueMicrotask(() => {
      try {
        openSentryCrashReportDialogue({
          eventId,
          hint: hint.slice(0, 500),
        });
      } catch (e) {
        console.warn("openSentryCrashReportDialogue failed:", e);
      }
    });
  }

  return true;
}
