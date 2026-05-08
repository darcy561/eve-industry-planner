import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";
import { MAX_FEEDBACK_LENGTH } from "./apiLimits.js";
import useUserStore from "../../../Zustand/usersStore";
import {
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  MAX_FEEDBACK_SCREENSHOT_COUNT,
  sendFeedbackToSentry,
} from "../../Sentry/feedbackSentry.js";

/** Max JSON-serialized metadata size for the feedback API (matches backend). */
const MAX_FEEDBACK_METADATA_JSON = 12000;

/**
 * Application account id from client session (Mongo/Firebase), when logged in.
 * @returns {string}
 */
function getClientAccountId() {
  try {
    const id = useUserStore.getState().account.actions.getAccountID();
    return id != null ? String(id) : "";
  } catch {
    return "";
  }
}

/**
 * Client-side debug context stored with backend feedback (not duplicated in Sentry body).
 * Does not include binary data; screenshots are only sent to Sentry.
 */
export function buildFeedbackMetadata() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {};
  }
  return {
    account_id: getClientAccountId(),
    url: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search || "",
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "",
    app_version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "",
  };
}

function shrinkMetadataIfNeeded(meta) {
  const s = JSON.stringify(meta);
  if (s.length <= MAX_FEEDBACK_METADATA_JSON) {
    return meta;
  }
  return {
    account_id: meta.account_id,
    url: meta.url,
    pathname: meta.pathname,
    viewport: meta.viewport,
    app_version: meta.app_version,
    screenshot_in_sentry: meta.screenshot_in_sentry,
    feedback_screenshot_count: meta.feedback_screenshot_count,
    truncated: "true",
  };
}

/**
 * Submits feedback to your API and to Sentry (when DSN is configured).
 * Accepts a string (legacy) or an options object.
 *
 * @param {string|{ response: string, contactName?: string, contactInfo?: string, screenshotFile?: File|null, screenshotFiles?: File[]|null }} input
 * @returns {Promise<boolean>}
 */
async function submitFeedback(input) {
  const options =
    typeof input === "string"
      ? { response: input }
      : input && typeof input === "object"
        ? input
        : null;

  if (!options?.response || typeof options.response !== "string") {
    console.error("Feedback content is required");
    return false;
  }

  const feedbackContent = options.response;

  if (feedbackContent.trim().length === 0) {
    console.error("Feedback content is required");
    return false;
  }

  if (feedbackContent.length > MAX_FEEDBACK_LENGTH) {
    console.error(
      "Feedback content too long:",
      feedbackContent.length,
      "max",
      MAX_FEEDBACK_LENGTH
    );
    return false;
  }

  const contactName = (options.contactName || "").trim();
  const contactInfo = (options.contactInfo || "").trim();

  const fromArray = Array.isArray(options.screenshotFiles)
    ? options.screenshotFiles
    : [];
  const legacySingle =
    options.screenshotFile instanceof File &&
    options.screenshotFile.size > 0
      ? [options.screenshotFile]
      : [];
  const screenshotFiles = (
    fromArray.length > 0 ? fromArray : legacySingle
  ).filter((f) => f instanceof File && f.size > 0);

  if (screenshotFiles.length > MAX_FEEDBACK_SCREENSHOT_COUNT) {
    console.error("Too many screenshots");
    return false;
  }

  for (const f of screenshotFiles) {
    if (f.size > MAX_FEEDBACK_SCREENSHOT_BYTES) {
      console.error("Screenshot exceeds maximum size");
      return false;
    }
  }

  let sentryEventId = "";
  try {
    const id = await sendFeedbackToSentry({
      screenshotFiles,
      accountId: getClientAccountId() || undefined,
    });
    if (id) {
      sentryEventId = id;
    }
  } catch (e) {
    console.error("Sentry feedback failed:", e);
    // Continue to backend so your pipeline still receives the report
  }

  const screenshotSentToSentry = Boolean(
    screenshotFiles.length > 0 &&
      sentryEventId &&
      import.meta.env.SENTRY_DSN
  );

  const metadata = shrinkMetadataIfNeeded({
    ...buildFeedbackMetadata(),
    screenshot_in_sentry: screenshotSentToSentry ? "true" : "false",
    ...(screenshotFiles.length > 0
      ? { feedback_screenshot_count: String(screenshotFiles.length) }
      : {}),
  });

  const URL = `/api/v1/feedback`;

  try {
    /** JSON only — never includes screenshot bytes (images go to Sentry only). */
    const body = {
      response: feedbackContent.trim(),
      sentry_event_id: sentryEventId,
      metadata: metadata,
      contact_name: contactName,
      contact_info: contactInfo,
    };

    const requestOptions = {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };

    const response = await fetchWithPublicHeaders(URL, requestOptions, {
      requestName: "submitFeedback",
    });

    if (!response.ok) {
      console.error(
        "Failed to submit feedback:",
        response.status,
        response.statusText
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return false;
  }
}

export default submitFeedback;
