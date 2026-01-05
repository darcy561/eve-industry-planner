/**
 * Escapes a string for safe use in JavaScript strings (works for both single and double quotes)
 */
export function escapeJsString(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape double quotes
    .replace(/'/g, "\\'")    // Escape single quotes
    .replace(/\n/g, "\\n")   // Escape newlines
    .replace(/\r/g, "\\r")   // Escape carriage returns
    .replace(/\t/g, "\\t");  // Escape tabs
}
