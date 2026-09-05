import DOMPurify from "dompurify";
import { showSnackbarError } from "../../Events/snackbarEvents";

/**
 * Reads text from clipboard and sanitizes it.
 *
 * @returns {Promise<string>} Sanitised text from clipboard, or null if error occurs
 */

export default async function readTextFromClipboard() {
  try {
    const importedText = await navigator.clipboard.readText();
    const sanitizedText = DOMPurify.sanitize(importedText, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
    const normalizedText = sanitizedText
      .replace(/ {2,}/g, "\t") // Convert 2+ spaces to tabs (newlines untouched)
      .replace(/\t+/g, "\t"); // Normalize multiple tabs to single tab (newlines untouched)

    return normalizedText;
  } catch (err) {
    console.error(err.message);
    showSnackbarError(`Error Reading Text From Clipboard`);
    return null;
  }
}
