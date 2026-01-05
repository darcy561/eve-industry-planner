/**
 * Checks if the network is available and returns a promise that resolves when the network is available
 * or after a timeout period.
 * 
 * This utility function provides network connectivity checking for Firebase App Check:
 * - Monitors browser's online/offline status
 * - Listens for network state changes
 * - Provides timeout mechanism to prevent indefinite waiting
 * - Returns promise-based network status checking
 * - Used by App Check token handlers for network-aware operations
 * 
 * The network checking process:
 * 1. Checks if browser reports online status
 * 2. If offline, sets up event listener for 'online' event
 * 3. Resolves immediately when network becomes available
 * 4. Times out after 5 seconds if network doesn't recover
 * 5. Cleans up event listeners to prevent memory leaks
 * 
 * @returns {Promise<boolean>} A promise that resolves to true if the network is available, false otherwise
 * 
 * @example
 * const isOnline = await checkNetworkConnection();
 * if (isOnline) {
 *   console.log('Network is available');
 *   // Proceed with network-dependent operations
 * } else {
 *   console.log('Network is not available');
 *   // Handle offline scenario
 * }
 * 
 * @example
 * // Used in App Check token handling
 * const isOnline = await checkNetworkConnection();
 * if (!isOnline) {
 *   console.warn('Network not available, will retry when online');
 *   return;
 * }
 * // Continue with token refresh
 */
export const checkNetworkConnection = () => {
  return new Promise((resolve) => {
    if (navigator.onLine) {
      resolve(true);
    } else {
      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        resolve(true);
      };
      window.addEventListener('online', handleOnline);
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('online', handleOnline);
        resolve(false);
      }, 5000);
    }
  });
}; 