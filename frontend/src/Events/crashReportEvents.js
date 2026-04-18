import { eventEmitter } from "../utils/EventSystem";

export const OPEN_SENTRY_CRASH_REPORT = "openSentryCrashReport";

/**
 * Opens the in-app crash report dialog (MUI) linked to a Sentry error event.
 * @param {{ eventId: string, hint?: string }} payload
 */
export function openSentryCrashReportDialog(payload) {
  const eventId = payload?.eventId != null ? String(payload.eventId).trim() : "";
  if (!eventId) {
    return;
  }
  eventEmitter.emit(OPEN_SENTRY_CRASH_REPORT, {
    eventId,
    hint: typeof payload.hint === "string" ? payload.hint : "",
  });
}
