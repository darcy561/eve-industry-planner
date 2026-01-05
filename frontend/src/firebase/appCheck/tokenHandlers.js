import { onTokenChanged, getToken } from 'firebase/app-check';
import { checkNetworkConnection } from './networkUtils';

/**
 * Sets up comprehensive token change handlers for Firebase App Check.
 * 
 * This function configures robust token management for App Check:
 * - Monitors token changes and handles null tokens
 * - Implements network-aware token refresh logic
 * - Handles throttling scenarios with retry mechanisms
 * - Manages network error recovery with automatic retries
 * - Sets up visibility change handlers for token refresh
 * - Provides comprehensive error handling and logging
 * 
 * The token handling process:
 * 1. Sets up token change listener for continuous monitoring
 * 2. Handles null tokens by checking network and forcing refresh
 * 3. Implements throttling handling with 60-second retry delay
 * 4. Manages network errors with automatic retry on network recovery
 * 5. Sets up visibility change handler for token refresh on app focus
 * 
 * Error handling scenarios:
 * - `appCheck/throttled`: Implements retry with 60-second delay
 * - `appCheck/fetch-network-error`: Retries when network becomes available
 * - Null tokens: Forces token refresh after network check
 * - Visibility changes: Refreshes tokens when app becomes visible
 * 
 * @param {import('firebase/app-check').AppCheck} appCheck - The AppCheck instance to set up handlers for
 * 
 * @example
 * const appCheck = initializeAppCheck(app, config);
 * setupTokenHandlers(appCheck);
 * console.log('App Check token handlers configured');
 * 
 * @see {@link checkNetworkConnection} for network status checking
 * @see {@link initializeAppCheckWithHandlers} for complete App Check setup
 */
export const setupTokenHandlers = (appCheck) => {
  // Enhanced token change handling with network checks
  onTokenChanged(appCheck, async (token) => {
    try {
      if (!token) {
        console.warn('AppCheck token is null, checking network...');
        const isOnline = await checkNetworkConnection();
        if (!isOnline) {
          console.warn('Network not available, will retry when online');
          return;
        }
        await getToken(appCheck, true); // Force refresh
        return;
      }
    } catch (error) {
      console.error('Error in AppCheck token change handler:', error);
      if (error.code === 'appCheck/throttled') {
        console.log('AppCheck throttled, will retry after delay');
        setTimeout(async () => {
          try {
            await getToken(appCheck, true); // Force refresh
          } catch (retryError) {
            console.error('Retry failed:', retryError);
          }
        }, 60000);
      } else if (error.code === 'appCheck/fetch-network-error') {
        console.warn('Network error during token refresh, will retry when online');
        const isOnline = await checkNetworkConnection();
        if (isOnline) {
          try {
            await getToken(appCheck, true); // Force refresh
          } catch (retryError) {
            console.error('Retry after network recovery failed:', retryError);
          }
        }
      }
    }
  });

  // Handle visibility change with network check
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      try {
        const isOnline = await checkNetworkConnection();
        if (!isOnline) {
          console.warn('Network not available on visibility change, will retry when online');
          return;
        }
        await getToken(appCheck, true); // Force refresh
      } catch (error) {
        console.error('Failed to refresh AppCheck token on visibility change:', error);
      }
    }
  });
}; 