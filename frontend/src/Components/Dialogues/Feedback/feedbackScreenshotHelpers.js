import {
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  MAX_FEEDBACK_SCREENSHOT_COUNT,
} from "../../../Functions/Sentry/feedbackSentry.js";

export function newScreenshotId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @param {File[]} picked
 * @param {number} currentCount
 * @returns {{ entries: { id: string, file: File }[], errorMessage: string | null }}
 */
export function buildScreenshotAdditions(picked, currentCount) {
  const entries = [];
  let room = MAX_FEEDBACK_SCREENSHOT_COUNT - currentCount;
  let errorMessage = null;

  if (room <= 0) {
    return {
      entries: [],
      errorMessage: `You can attach at most ${MAX_FEEDBACK_SCREENSHOT_COUNT} screenshots.`,
    };
  }

  for (const f of picked) {
    if (!(f instanceof File) || f.size <= 0) {
      continue;
    }
    if (f.type && !f.type.startsWith("image/")) {
      errorMessage = "Only image files are allowed.";
      continue;
    }
    if (f.size > MAX_FEEDBACK_SCREENSHOT_BYTES) {
      errorMessage = `Each screenshot must be at most ${MAX_FEEDBACK_SCREENSHOT_BYTES / (1024 * 1024)} MB`;
      continue;
    }
    if (room <= 0) {
      errorMessage = `You can attach at most ${MAX_FEEDBACK_SCREENSHOT_COUNT} screenshots.`;
      break;
    }
    entries.push({ id: newScreenshotId(), file: f });
    room -= 1;
  }

  return { entries, errorMessage };
}
