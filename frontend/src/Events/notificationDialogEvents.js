import uuid from "react-uuid";
import { eventEmitter } from "../utils/EventSystem";

/**
 * Displays a notification dialog with customizable title, body, and button text.
 * Emits an event to show a notification dialog to the user.
 * 
 * @param {string} [title=""] - The title of the notification dialog
 * @param {string} [body=""] - The body text of the notification dialog
 * @param {string} [buttonText="Close"] - The text for the dialog button
 * @param {string} [id] - Unique identifier for the dialog (auto-generated if not provided)
 * @returns {void}
 * 
 * @example
 * displayNotificationDialog("Success", "Operation completed successfully", "OK");
 * 
 * @example
 * displayNotificationDialog("Error", "Something went wrong", "Dismiss", "error_123");
 */
export function displayNotificationDialog(
  title = "",
  body = "",
  buttonText = "Close",
  id = uuid()
) {
  eventEmitter.emit("notificationDialog", {
    open: true,
    title,
    body,
    buttonText,
    id,
  });
}

/**
 * Displays a notification dialog for outdated app version.
 * Convenience function for showing app update notifications.
 * 
 * @returns {void}
 * 
 * @example
 * displayOutdatedAppVersionDialog(); // Shows app update notification
 */
export function displayOutdatedAppVersionDialog() {
  displayNotificationDialog(
    "Outdated App Version",
    "A newer version of the application is available, refresh the page to begin using this."
  );
}

