import { showSnackbarSuccess, showSnackbarError } from "../../Events/snackbarEvents";

/**
 * Writes text to clipboard.
 * 
 * @param {string} inputTextString - The text to write to clipboard
 * @returns {Promise<void>} Void
 */

export default async function writeTextToClipboard(inputTextString) {
    try {
      await navigator.clipboard.writeText(inputTextString);
      showSnackbarSuccess(`Successfully Copied`, 1);
    } catch (err) {
      console.error(err.message);
      showSnackbarError(`Error Copying Text To Clipboard`);
    }
  }