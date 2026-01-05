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
      const registerServiceWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
          });
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      };

      // Register after a short delay to ensure the page is loaded
      setTimeout(registerServiceWorker, 1000);
    }
  }, []);
};