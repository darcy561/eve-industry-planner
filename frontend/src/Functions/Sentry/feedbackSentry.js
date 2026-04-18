import { captureFeedback, withScope } from "@sentry/react";

/** Max screenshot size sent to Sentry as an attachment (bytes). */
export const MAX_FEEDBACK_SCREENSHOT_BYTES = 2 * 1024 * 1024;

/** Max number of image attachments per feedback submission. */
export const MAX_FEEDBACK_SCREENSHOT_COUNT = 5;

/**
 * SDK requires a non-empty message; we do not send user feedback text or contact fields to Sentry.
 * Full text and contact go to your API only; correlate via sentry_event_id on the backend payload.
 */
const SENTRY_FEEDBACK_PLACEHOLDER_MESSAGE =
  "Screenshots for in-app feedback. Full message and contact details are stored with the application report.";

/**
 * Sends only screenshots to Sentry (no user message, name, or contact). Skips if no files or no DSN.
 * @see https://docs.sentry.io/platforms/javascript/guides/react/user-feedback/configuration/#bring-your-own-widget
 *
 * @param {object} params
 * @param {File[]|null|undefined} [params.screenshotFiles]
 * @param {string|null|undefined} [params.accountId] Application account id for Sentry user (same as backend metadata).
 * @returns {Promise<string|null>} Sentry event id, or null if skipped
 */
export async function sendFeedbackToSentry({
  screenshotFiles = null,
  accountId = null,
}) {
  if (!import.meta.env.SENTRY_DSN) {
    return null;
  }
  const files = (screenshotFiles || []).filter(
    (f) => f instanceof File && f.size > 0,
  );
  if (files.length === 0) {
    return null;
  }
  if (files.length > MAX_FEEDBACK_SCREENSHOT_COUNT) {
    throw new Error(
      `At most ${MAX_FEEDBACK_SCREENSHOT_COUNT} screenshots per submission`,
    );
  }

  const attachments = [];
  for (let i = 0; i < files.length; i++) {
    const screenshotFile = files[i];
    if (screenshotFile.size > MAX_FEEDBACK_SCREENSHOT_BYTES) {
      throw new Error(
        `Screenshot must be at most ${MAX_FEEDBACK_SCREENSHOT_BYTES / (1024 * 1024)} MB`,
      );
    }
    const buf = new Uint8Array(await screenshotFile.arrayBuffer());
    const baseName = screenshotFile.name || `screenshot-${i + 1}.png`;
    const filename =
      files.length > 1 ? `${i + 1}-${baseName}` : baseName;
    attachments.push({
      filename,
      contentType: screenshotFile.type || "image/png",
      data: buf,
    });
  }

  const hint = { attachments };

  const trimmedAccount =
    accountId != null && String(accountId).trim() !== ""
      ? String(accountId).trim()
      : "";

  return withScope((scope) => {
    if (trimmedAccount) {
      scope.setUser({ id: trimmedAccount, username: trimmedAccount });
    }
    return captureFeedback(
      {
        message: SENTRY_FEEDBACK_PLACEHOLDER_MESSAGE,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        source: "in_app_feedback",
        tags: {
          feedback_source: "in_app_feedback",
          full_feedback_on_backend: "true",
        },
      },
      hint,
      scope,
    );
  });
}
