import GLOBAL_CONFIG from "../../global-config-app";

/**
 * Detects the user's browser locale and returns it, falling back to the default locale.
 * Uses navigator.language or navigator.languages[0] if available.
 * 
 * @returns {string} The detected locale string (e.g., "en-US", "de-DE")
 * 
 * @example
 * const locale = detectUserLocale();
 * console.log(locale); // "en-US" or user's browser locale
 */
export function detectUserLocale() {
  if (typeof window === "undefined") return GLOBAL_CONFIG.DEFAULT_LOCALE;

  return (
    navigator.language ||
    navigator.languages?.[0] ||
    GLOBAL_CONFIG.DEFAULT_LOCALE
  );
}
