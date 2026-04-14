/**
 * Global Debounce Hook
 * 
 * Provides a singleton debounce system with a single global timer.
 * Multiple components can register different functions with keys,
 * and when the timer fires, all pending functions execute together.
 * 
 * @fileoverview Global debounce hook with key-based function registration
 * @author EVE Industry Planner Team
 */

import { useCallback, useRef } from 'react';

// Global singletons for the debounced functions
const globalFunctions = new Map(); // Map<key, {function, timeoutRef}>

/**
 * Creates a singleton debounced function for a specific key.
 * Each key gets its own independent timer.
 * 
 * @param {string} key - Unique key to identify this debounced function
 * @param {Function} callback - The function to debounce
 * @param {number} delay - The delay in milliseconds (default: 1000ms)
 * @returns {Function} The shared debounced function for this key
 */
function createGlobalDebouncedFunction(key, callback, delay = 1000) {
  // If we already have a singleton for this key, return it
  if (globalFunctions.has(key)) {
    const existing = globalFunctions.get(key);
    // Update the callback if it changed
    existing.function = callback;
    return existing.debouncedFunction;
  }

  // Create new singleton for this key
  const timeoutRef = { current: null };
  const debouncedFunction = (...args) => {
    // Clear the previous timeout for this key
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set a new timeout for this key
    timeoutRef.current = setTimeout(async () => {
      try {
        await callback(...args);
      } catch (error) {
        console.error(`Debounced function '${key}' failed:`, error);
      }
    }, delay);
  };

  // Store the singleton for this key
  globalFunctions.set(key, {
    function: callback,
    debouncedFunction: debouncedFunction,
    timeoutRef: timeoutRef
  });

  return debouncedFunction;
}

/**
 * Custom hook that provides a global debounced function identified by a key.
 * 
 * This hook creates a SINGLETON debounced function that is shared across ALL
 * components using the same key. Each key gets its own independent timer.
 * 
 * @param {string} key - Unique key to identify this debounced function
 * @param {Function} callback - The function to debounce
 * @param {number} delay - The delay in milliseconds (default: 1000ms)
 * @returns {Function} The shared debounced function for this key
 * 
 * @example
 * // Using predefined keys (recommended)
 * import { DEBOUNCE_KEYS } from '../../Context/debounceKeys';
 * import { saveApplicationSettings } from '../../Functions/Endpoints/Pirivate/userDocument';
 *
 * function ComponentA() {
 *   const debouncedSaveSettings = useGlobalDebounce(
 *     DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
 *     async () => await saveApplicationSettings(),
 *     1000
 *   );
 *   
 *   const handleChange = (value) => {
 *     updateSetting(value);
 *     debouncedSaveSettings(); // Resets timer for this key only
 *   };
 * }
 */
export function useGlobalDebounce(key, callback, delay = 1000) {
  // Store the callback in a ref to avoid recreating the debounced function
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Get or create the debounced function for this key
  const debouncedFunction = useCallback(() => {
    return createGlobalDebouncedFunction(key, callbackRef.current, delay)();
  }, [key, delay]);

  return debouncedFunction;
}