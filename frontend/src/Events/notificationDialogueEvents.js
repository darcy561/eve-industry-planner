import { eventEmitter } from "../utils/EventSystem";

/**
 * Displays a notification dialogue with customizable title, body, and button text.
 * Emits an event to show a notification dialogue to the user.
 *
 * @param {string} [title=""] - The title of the notification dialogue
 * @param {string} [body=""] - The body text of the notification dialogue
 * @param {string} [buttonText="Close"] - The text for the dialogue button
 * @param {string} [id] - Unique identifier for the dialogue (auto-generated if not provided)
 * @returns {void}
 */
export function displayNotificationDialogue(
  title = "",
  body = "",
  buttonText = "Close",
  id = crypto.randomUUID()
) {
  eventEmitter.emit("notificationDialogue", {
    isOpen: true,
    title,
    body,
    buttonText,
    id,
  });
}

/**
 * Displays a notification dialogue for outdated app version.
 * Convenience function for showing app update notifications.
 *
 * @returns {void}
 */
export function displayOutdatedAppVersionDialogue() {
  displayNotificationDialogue(
    "Outdated App Version",
    "A newer version of the application is available, refresh the page to begin using this."
  );
}

