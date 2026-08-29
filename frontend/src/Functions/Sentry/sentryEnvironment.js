/**
 * Central place for Sentry behaviour driven by the build-time `ENVIRONMENT` value
 * and optional `SENTRY_*_SAMPLE_RATE` vars (see root `.env` / `frontend/vite.config.js` `define`).
 */

/**
 * Parse a 0.0–1.0 sample rate from build-time env (string or number). Empty / invalid → default.
 * @param {unknown} raw
 * @param {number} defaultRate
 * @returns {number}
 */
export function parseSentrySampleRateEnv(raw, defaultRate = 0) {
  if (raw == null) return defaultRate;
  const s = String(raw).trim();
  if (s === "") return defaultRate;
  const n = Number(s);
  if (!Number.isFinite(n)) return defaultRate;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** @returns {string} */
export function getSentryAppEnvironment() {
  return import.meta.env.ENVIRONMENT || "production";
}

/** Local/dev builds: noisy errors suppressed in Sentry; feedback + traces can still be tested. */
export function sentryIsDevelopmentEnvironment() {
  return getSentryAppEnvironment() === "development";
}

/**
 * `beforeSend` keeps only lightweight event types in development-like environments.
 */
export function sentryBeforeSendAllowsEventInDevMode(event) {
  const t = event?.type;
  return t === "feedback" || t === "transaction";
}

/**
 * Performance / transaction sampling (`tracesSampleRate`). Default 0 for every environment.
 * Set `SENTRY_TRACES_SAMPLE_RATE` at build time (0.0–1.0), e.g. in root `.env` or Docker build-args.
 */
export function getSentryTracesSampleRate() {
  return parseSentrySampleRateEnv(import.meta.env.SENTRY_TRACES_SAMPLE_RATE, 0);
}

/**
 * Error event sampling (`sampleRate` in Sentry.init). Default 1 — all captured errors are sent unless lowered.
 * Set `SENTRY_ERROR_SAMPLE_RATE` at build time (0.0–1.0). User feedback (`captureFeedback`) is separate.
 */
export function getSentryErrorSampleRate() {
  return parseSentrySampleRateEnv(import.meta.env.SENTRY_ERROR_SAMPLE_RATE, 1);
}
