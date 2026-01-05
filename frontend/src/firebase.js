import { initializeApp } from "firebase/app";
import GLOBAL_CONFIG from "./global-config-app";
import { initializeAppCheckWithHandlers } from "./firebase/appCheck";
import { initializeAuth } from "./firebase/auth";
import { initializeFirestoreWithCache } from "./firebase/firestore";
import { initializeFunctions } from "./firebase/functions";
import { initializePerformance } from "./firebase/performance";
import { initializeAnalytics } from "./firebase/analytics";
import { initializeRemoteConfig } from "./firebase/remoteConfig";
import { initializeStorage } from "./firebase/storage";
import { initializeMessaging } from "./firebase/messaging";
import { getRuntimeEnv } from "./utils/runtime-config";

const { FIREBASE_FUNCTION_REGION } = GLOBAL_CONFIG;

/**
 * Get Firebase config dynamically from window.env
 * This ensures we read from window.env at runtime,
 * not at module load time, to avoid timing issues.
 */
function getFirebaseConfig() {
  // Helper to get and trim env values
  // In development, fall back to Vite env vars if window.env has placeholders
  const getEnvValue = (key) => {
    let value = getRuntimeEnv(key);

    // In development mode, if we get a placeholder or empty value, try Vite env vars
    if (import.meta.env.DEV) {
      const viteKey = `VITE_${key}`;
      const viteValue = import.meta.env[viteKey];

      // If window.env has a placeholder or is empty, use Vite env var if available
      const isPlaceholder =
        typeof value === "string" &&
        value.startsWith("__") &&
        value.endsWith("__");
      if ((!value || isPlaceholder) && viteValue) {
        value = viteValue;
      }
    }

    return typeof value === "string" ? value.trim() : value;
  };

  let apiKey = getEnvValue("FIREBASE_API_KEY");
  const projectId = getEnvValue("FIREBASE_PROJECT_ID");

  const config = {
    apiKey: apiKey,
    authDomain: getEnvValue("FIREBASE_AUTH_DOMAIN"),
    databaseURL: getEnvValue("FIREBASE_DATABASE_URL"),
    projectId: projectId,
    storageBucket: getEnvValue("FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnvValue("FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnvValue("FIREBASE_APP_ID"),
    measurementId: getEnvValue("FIREBASE_MEASUREMENT_ID"),
  };

  // Validate that required config values are present and not placeholders
  const isPlaceholder = (value) =>
    typeof value === "string" && value.startsWith("__") && value.endsWith("__");
  const isEmpty = (value) =>
    !value || (typeof value === "string" && value.trim().length === 0);

  // Validate API key format (should start with "AIzaSy")
  const isValidApiKeyFormat = (key) => {
    if (!key || typeof key !== "string") return false;
    // Firebase API keys typically start with "AIzaSy"
    return key.trim().startsWith("AIzaSy");
  };

  if (
    isEmpty(config.apiKey) ||
    isEmpty(config.projectId) ||
    isPlaceholder(config.apiKey) ||
    isPlaceholder(config.projectId)
  ) {
    throw new Error(
      "Firebase configuration is incomplete. Check that window.env is properly loaded with actual values (not placeholders)."
    );
  }

  if (!isValidApiKeyFormat(config.apiKey)) {
    throw new Error(
      "Firebase API key has invalid format. It should start with 'AIzaSy'. Check your FIREBASE_API_KEY environment variable."
    );
  }

  return config;
}

// Ensure window.env is available before initializing Firebase
// env.js should be loaded before this module, but we'll verify
// In development, we can fall back to Vite env vars, so this is just a warning
if (typeof window === "undefined" || !window.env) {
  if (!import.meta.env.DEV) {
    throw new Error(
      "window.env is not available. Ensure env.js is loaded before Firebase initialization."
    );
  }
}

// Export config getter function for external use if needed
// This ensures config is always read fresh from window.env
export const getFirebaseConfigExport = () => getFirebaseConfig();

// Get config once and reuse it to avoid reading multiple times
const firebaseConfigInstance = getFirebaseConfig();

// Export the config object for backwards compatibility
export const firebaseConfig = firebaseConfigInstance;

// Initialize Firebase with config read at initialization time
// This ensures we read from window.env when Firebase is actually initialized
const app = initializeApp(firebaseConfigInstance);

// Initialize Firebase services with error handling
// Some services may fail in certain contexts (service workers, unsupported browsers, etc.)

// Initialize App Check
export const appCheck = initializeAppCheckWithHandlers(app);
export const firestore = initializeFirestoreWithCache(app);
export const auth = initializeAuth(app);
export const functions = initializeFunctions(app, FIREBASE_FUNCTION_REGION);
export const storage = initializeStorage(app);

// Performance monitoring
export const performance = initializePerformance(app);

// Analytics - may fail in service workers or unsupported browsers
let analytics = null;
try {
  analytics = initializeAnalytics(app);
} catch (error) {
  // Analytics not available
}

// Messaging - requires browser support and may fail in certain contexts
let messaging = null;
try {
  // Check if browser supports required APIs
  if (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  ) {
    messaging = initializeMessaging(app);
  }
} catch (error) {
  // Messaging not available
}

// Export services (may be null if initialization failed)
export { analytics, messaging };

// Initialize Remote Config with development settings if needed
export const remoteConfig = await initializeRemoteConfig(
  app,
  import.meta.env.DEV
);

export default app;
