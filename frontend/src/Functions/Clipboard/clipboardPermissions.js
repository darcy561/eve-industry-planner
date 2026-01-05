/**
 * Checks if the user has granted clipboard read permissions.
 *
 * @returns {Promise<boolean>} True if permissions are granted, false otherwise
 */

export async function checkClipboardReadPermissions() {
  try {
    try {
      return await requestClipboardPermissions();
    } catch (clipboardError) {
      // If clipboard access fails, check permissions
      const permissionStatus = await navigator.permissions.query({
        name: "clipboard-read",
      });
      if (["granted", "prompt"].includes(permissionStatus.state)) return true;
      return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Requests clipboard read permissions.
 *
 * @returns {Promise<boolean>} True if permissions are granted, false otherwise
 */

export async function requestClipboardPermissions() {
  try {
    // Try to read from clipboard - this will trigger the permission prompt
    await navigator.clipboard.readText();
    return true;
  } catch (error) {
    return false;
  }
}
