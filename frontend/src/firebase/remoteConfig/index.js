import { fetchAndActivate, getRemoteConfig } from "firebase/remote-config";
import { REMOTE_CONFIG_DEFAULT_VALUES } from "../../Context/defaultValues";

/**
 * Initializes and activates Firebase Remote Config with environment-specific settings.
 * 
 * This function sets up Firebase Remote Config for dynamic configuration management:
 * - Configures fetch intervals based on environment (dev vs production)
 * - Sets default configuration values for offline scenarios
 * - Fetches and activates remote configuration values
 * - Handles configuration fetch errors gracefully
 * - Provides environment-aware configuration management
 * 
 * The Remote Config initialization process:
 * 1. Creates Remote Config instance with the Firebase app
 * 2. Sets appropriate fetch intervals based on environment
 * 3. Applies default configuration values for fallback
 * 4. Fetches and activates remote configuration
 * 5. Handles errors and logs configuration issues
 * 
 * Environment-specific behavior:
 * - Development: 5-minute minimum fetch interval for testing
 * - Production: Uses Firebase default fetch intervals
 * - Default values: Applied from context for offline scenarios
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @param {boolean} isDev - Whether the app is running in development mode
 * @returns {Promise<import('firebase/remote-config').RemoteConfig>} Promise that resolves to the initialized RemoteConfig instance
 * 
 * @example
 * // Initialize Remote Config in development mode
 * const remoteConfig = await initializeRemoteConfig(firebaseApp, true);
 * console.log('Remote Config initialized for development');
 * 
 * @example
 * // Initialize Remote Config in production mode
 * const remoteConfig = await initializeRemoteConfig(firebaseApp, false);
 * console.log('Remote Config initialized for production');
 * 
 * @example
 * // Get configuration values
 * const configValue = remoteConfig.getValue('feature_flag');
 * if (configValue.asBoolean()) {
 *   console.log('Feature is enabled');
 * }
 * 
 * @see {@link REMOTE_CONFIG_DEFAULT_VALUES} for default configuration values
 */
export const initializeRemoteConfig = async (app, isDev = false) => {
  const remoteConfig = getRemoteConfig(app);
  
  if (isDev) {
    remoteConfig.settings.minimumFetchIntervalMillis = 300000; //5mins
  }
  
  remoteConfig.defaultConfig = REMOTE_CONFIG_DEFAULT_VALUES;
  
  try {
    await fetchAndActivate(remoteConfig);
  } catch (error) {
    console.error("Error fetching and activating Remote Config:", error);
  }
  
  return remoteConfig;
}; 