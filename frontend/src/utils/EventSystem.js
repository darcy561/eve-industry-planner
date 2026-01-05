/**
 * Event System for EVE Industry Planner.
 * 
 * Provides a centralized event management system using EventEmitter3 for
 * inter-component communication and application-wide event handling.
 * Supports both subscription and unsubscription patterns with automatic
 * cleanup capabilities.
 * 
 * @fileoverview Centralized event system for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import EventEmitter from "eventemitter3";

/**
 * Global event emitter instance for EVE Industry Planner.
 * 
 * Centralized event emitter that allows components and modules throughout
 * the application to communicate via events. Supports all standard EventEmitter
 * methods including on, off, emit, once, and removeAllListeners.
 * 
 * @type {EventEmitter}
 * @example
 * // Emit an event
 * eventEmitter.emit('user-login', { userId: 123, username: 'player1' });
 * 
 * // Listen to an event
 * eventEmitter.on('user-login', (data) => {
 *   console.log('User logged in:', data.username);
 * });
 */
export const eventEmitter = new EventEmitter();

/**
 * Make eventEmitter available globally for testing and debugging.
 * 
 * Attaches the eventEmitter to the window object to enable access
 * from browser console and testing environments.
 */
if (window) {
  window.eventEmitter = eventEmitter;
}

/**
 * Generic event subscription helper with automatic cleanup.
 * 
 * Subscribes to an event and returns an unsubscribe function for easy cleanup.
 * This pattern is particularly useful in React components where you need to
 * clean up event listeners when components unmount.
 * 
 * @param {string} eventName - Name of the event to subscribe to
 * @param {Function} callback - Function to call when the event is emitted
 * @returns {Function} Unsubscribe function that removes the event listener
 * 
 * @example
 * // In a React component
 * useEffect(() => {
 *   const unsubscribe = subscribeToEvent('data-updated', handleDataUpdate);
 *   return unsubscribe; // Cleanup on unmount
 * }, []);
 * 
 * @example
 * // Manual cleanup
 * const unsubscribe = subscribeToEvent('user-action', (data) => {
 *   console.log('User action:', data);
 * });
 * 
 * // Later, when you want to stop listening
 * unsubscribe();
 */
export function subscribeToEvent(eventName, callback) {
  eventEmitter.on(eventName, callback);
  return () => eventEmitter.off(eventName, callback);
}

/**
 * Unsubscribe from a specific event.
 * 
 * Removes a specific event listener from the event emitter.
 * This is a direct wrapper around EventEmitter's off method.
 * 
 * @param {string} eventName - Name of the event to unsubscribe from
 * @param {Function} callback - The specific callback function to remove
 * 
 * @example
 * const handleUpdate = (data) => console.log('Updated:', data);
 * 
 * // Subscribe
 * eventEmitter.on('data-updated', handleUpdate);
 * 
 * // Unsubscribe
 * unsubscribeFromEvent('data-updated', handleUpdate);
 */
export const unsubscribeFromEvent = (eventName, callback) => {
  eventEmitter.off(eventName, callback);
};
