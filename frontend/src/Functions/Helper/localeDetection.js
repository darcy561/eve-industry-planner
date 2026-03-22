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
  if (typeof window === "undefined") {
    return normalizeLocaleForIntl(GLOBAL_CONFIG.DEFAULT_LOCALE);
  }

  return normalizeLocaleForIntl(
    navigator.language ||
    navigator.languages?.[0] ||
    GLOBAL_CONFIG.DEFAULT_LOCALE
  );
}


export function normalizeLocaleForIntl(locale) {
  const fallbackLocale = "en-US";

  if (typeof locale !== "string" || locale.trim() === "") {
    return fallbackLocale;
  }

  // Convert common POSIX/ICU locale forms (e.g. en_US@posix) into BCP-47.
  const normalized = locale.trim().replace(/_/g, "-").split("@")[0];

  if (!normalized) {
    return fallbackLocale;
  }

  try {
    return Intl.getCanonicalLocales(normalized)[0] || fallbackLocale;
  } catch {
    return fallbackLocale;
  }
}
