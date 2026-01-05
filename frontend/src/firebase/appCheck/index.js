import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { setupTokenHandlers } from './tokenHandlers';

/**
 * Initializes Firebase App Check with ReCaptcha Enterprise provider and token handlers.
 * 
 * This function sets up Firebase App Check for security and bot protection:
 * - Configures ReCaptcha Enterprise provider for verification
 * - Enables automatic token refresh for continuous protection
 * - Sets up comprehensive token change handlers
 * - Provides network-aware token management
 * - Handles throttling and network error scenarios
 * 
 * The App Check initialization process:
 * 1. Creates App Check instance with ReCaptcha Enterprise provider
 * 2. Enables automatic token refresh for seamless operation
 * 3. Sets up token change handlers for robust error handling
 * 4. Configures network-aware token management
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @returns {import('firebase/app-check').AppCheck} The initialized AppCheck instance with handlers
 * 
 * @example
 * const appCheck = initializeAppCheckWithHandlers(firebaseApp);
 * console.log('Firebase App Check initialized with ReCaptcha Enterprise');
 * 
 * @see {@link setupTokenHandlers} for token management details
 * @see {@link checkNetworkConnection} for network handling
 */
export const initializeAppCheckWithHandlers = (app) => {
  // Try to get reCAPTCHA key from window.env first (runtime config)
  // Then fall back to legacy __RUNTIME_CONFIG__ or Vite env vars
  const recaptchaKey = (typeof window !== 'undefined' && window.env?.RECAPTCHA_KEY) ||
                       (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.RECAPTCHA_KEY) || 
                       (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.VITE_ReCaptchaKey) || 
                       import.meta.env.VITE_ReCaptchaKey;
  
  if (!recaptchaKey || recaptchaKey.startsWith('__') || recaptchaKey.trim().length === 0) {
    console.error('[App Check] reCAPTCHA key is missing or invalid:', recaptchaKey ? 'present but invalid' : 'missing');
    console.error('[App Check] Available window.env keys:', typeof window !== 'undefined' && window.env ? Object.keys(window.env) : 'N/A');
    throw new Error('reCAPTCHA key is required for App Check. Check that RECAPTCHA_KEY is set in window.env or environment variables.');
  }
  
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
    isTokenAutoRefreshEnabled: true,
  });

  // Set up token handlers
  setupTokenHandlers(appCheck);

  return appCheck;
}; 