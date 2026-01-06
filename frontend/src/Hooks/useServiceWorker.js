import { useEffect } from 'react';

/**
 * Custom hook that registers a service worker for the application.
 * 
 * This hook:
 * - Checks if service workers are supported by the browser
 * - Registers the service worker with a 1-second delay to ensure page load
 * - Handles registration errors gracefully with console logging
 * - Runs only once on component mount (empty dependency array)
 * 
 * The service worker is registered from '/sw.js' with root scope ('/')
 * to enable offline functionality and caching capabilities.
 * 
 * @returns {void} This hook doesn't return any value, but registers the service worker
 * 
 * @example
 * function App() {
 *   useServiceWorker(); // Registers service worker on app start
 *   return <div>App content</div>;
 * }
 */
export const useServiceWorker = () => {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // First, unregister any existing service workers
      const unregisterServiceWorkers = async () => {
        try {
          // Get all service worker registrations
          const registrations = await navigator.serviceWorker.getRegistrations();
          
          // Unregister all service workers
          await Promise.all(
            registrations.map((registration) => registration.unregister())
          );
          
          if (registrations.length > 0) {
            console.log(`Unregistered ${registrations.length} service worker(s)`);
          }
        } catch (error) {
          console.error('Service Worker unregistration failed:', error);
        }
      };

      // Original registration code (currently disabled)
      const registerServiceWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
          });
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      };

      // Unregister existing service workers after a short delay
      setTimeout(unregisterServiceWorkers, 1000);
      
      // Original registration (commented out - uncomment to re-enable)
      // setTimeout(registerServiceWorker, 1000);
    }
  }, []);
};