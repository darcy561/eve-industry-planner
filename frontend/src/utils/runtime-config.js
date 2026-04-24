/**
 * Runtime configuration utility
 * Reads from window.env (set at container startup via public/env.js)
 */

/**
 * Get a runtime environment variable
 * @param {string} key
 * @param {string} defaultValue
 * @returns {string}
 */
export function getEnv(key, defaultValue = "") {
  return window?.env?.[key] ?? defaultValue;
}

/**
 * Get a runtime environment variable (alias for getEnv)
 * @param {string} key
 * @param {string} defaultValue
 * @returns {string}
 */
export function getRuntimeEnv(key, defaultValue = "") {
  return getEnv(key, defaultValue);
}

/**
 * Get all runtime environment variables as an object
 * Evaluated lazily (after env.js has loaded)
 * @returns {Object}
 */
export function getEnvConfig() {
  return {
    GA4_MEASUREMENT_ID: getEnv("GA4_MEASUREMENT_ID"),
    EVE_CLIENT_ID: getEnv("EVE_CLIENT_ID"),
    EVE_CALLBACK_URL: getEnv("EVE_CALLBACK_URL"),
    EVE_SCOPE: getEnv("EVE_SCOPE"),
  };
}
