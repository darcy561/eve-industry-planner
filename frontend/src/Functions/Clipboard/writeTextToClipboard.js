import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../Events/snackbarEvents";

/**
 * Writes text to clipboard.
 *
 * @param {string} inputTextString - The text to write to clipboard
 * @param {string} [successMessage] - what to say instead of the general wording, for a caller
 *   copying one named thing rather than a list
 * @returns {Promise<void>} Void
 */

export default async function writeTextToClipboard(
  inputTextString,
  successMessage = "Successfully Copied",
) {
  try {
    await navigator.clipboard.writeText(inputTextString);
    showSnackbarSuccess(successMessage, 1);
  } catch (err) {
    console.error(err.message);
    showSnackbarError(`Error Copying Text To Clipboard`);
  }
}
