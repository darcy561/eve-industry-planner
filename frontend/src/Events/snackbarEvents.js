import uuid from "react-uuid";
import { eventEmitter } from "../utils/EventSystem";

/**
 * Shows a snackbar notification with customizable message, severity, and duration.
 * Emits a snackbar event that the UI can listen to for displaying notifications.
 * 
 * @param {string} [message=""] - The message to display in the snackbar
 * @param {string} [severity="info"] - Severity level: "success", "error", "warning", "info"
 * @param {number|null} [duration=1] - Duration in seconds before auto-hide (null = no auto-hide)
 * @param {string|null} [action=null] - Action identifier for special snackbar types
 * @param {Object} [extra={}] - Additional event payload fields for specialized snackbars
 * @returns {void}
 * 
 * @example
 * showSnackbar("Operation completed successfully", "success", 3);
 * 
 * @example
 * showSnackbar("Error occurred", "error", null); // No auto-hide
 */
export function showSnackbar(
  message = "",
  severity = "info",
  duration = 1,
  action = null,
  extra = {}
) {

  eventEmitter.emit("snackbar", {
    open: true,
    message,
    severity,
    autoHideDuration: duration === null ? null : duration * 1000, // null means no auto-hide
    anchorOrigin: { vertical: "bottom", horizontal: "center" },
    direction: "up",
    variant: "filled",
    key: uuid(),
    action,
    ...extra,
  });
}

/**
 * Shows a success snackbar notification.
 * Convenience function for displaying success messages.
 * 
 * @param {string} message - The success message to display
 * @param {number} [duration=1] - Duration in seconds before auto-hide
 * @param {string} targetVersion - Remote version that triggered the notification
 * @param {Function} [onDismiss] - Optional callback invoked when user dismisses this snackbar
 * @returns {void}
 * 
 * @example
 * showSnackbarSuccess("Job created successfully!");
 */
export const showSnackbarSuccess = (message, duration = 1) => {
  showSnackbar(message, "success", duration);
};

/**
 * Shows an error snackbar notification.
 * Convenience function for displaying error messages.
 * 
 * @param {string} message - The error message to display
 * @param {number} [duration=1] - Duration in seconds before auto-hide
 * @returns {void}
 * 
 * @example
 * showSnackbarError("Failed to save job");
 */
export const showSnackbarError = (message, duration = 1) => {
  showSnackbar(message, "error", duration);
};

/**
 * Shows a warning snackbar notification.
 * Convenience function for displaying warning messages.
 * 
 * @param {string} message - The warning message to display
 * @param {number} [duration=1] - Duration in seconds before auto-hide
 * @returns {void}
 * 
 * @example
 * showSnackbarWarning("This action cannot be undone");
 */
export const showSnackbarWarning = (message, duration = 1) => {
  showSnackbar(message, "warning", duration);
};

/**
 * Shows an info snackbar notification.
 * Convenience function for displaying informational messages.
 * 
 * @param {string} message - The info message to display
 * @param {number} [duration=1] - Duration in seconds before auto-hide
 * @returns {void}
 * 
 * @example
 * showSnackbarInfo("Data refreshed successfully");
 */
export const showSnackbarInfo = (message, duration = 1) => {
  showSnackbar(message, "info", duration);
};

/**
 * Shows a version update snackbar notification.
 * Special snackbar for notifying users about app updates with refresh action.
 * 
 * @returns {void}
 * 
 * @example
 * showVersionUpdateSnackbar(); // Shows update notification with refresh action
 */
export const showVersionUpdateSnackbar = (targetVersion, onDismiss) => {
  showSnackbar(
    "New app version available! Click refresh to update.",
    "info",
    null,
    "VERSION_UPDATE",
    {
      versionUpdateTarget: targetVersion,
      onDismiss,
    }
  );
};

/**
 * Shown to the current lock holder when another session requests edit access ({@link ../Hooks/useDocumentLock.js}).
 *
 * @param {string} [message]
 * @param {{ collection?: string, docID?: string }} [scope] — Redis scope for hand-over / dismiss actions
 */
export const showDocumentLockAccessRequestSnackbar = (
  message = "Another tab requested edit access for this document.",
  scope = {}
) => {
  showSnackbar(message, "info", null, "DOCUMENT_LOCK_ACCESS_REQUEST", {
    documentLockCollection: scope.collection,
    documentLockDocID: scope.docID,
  });
};
