/**
 * Event System for EVE Industry Planner.
 */

import EventEmitter from "eventemitter3";

/**
 * Global event emitter instance for EVE Industry Planner.
 *
 * @type {EventEmitter}
 */
export const eventEmitter = new EventEmitter();

/**
 * Make eventEmitter available globally for testing and debugging.
 */
if (window) {
  window.eventEmitter = eventEmitter;
}

/**
 * Generic event subscription helper with automatic cleanup.
 *
 * @param {string} eventName - Name of the event to subscribe to
 * @param {Function} callback - Function to call when the event is emitted
 * @returns {Function} Unsubscribe function that removes the event listener
 */
export function subscribeToEvent(eventName, callback) {
  eventEmitter.on(eventName, callback);
  return () => eventEmitter.off(eventName, callback);
}

/**
 * Unsubscribe from a specific event.
 *
 * @param {string} eventName - Name of the event to unsubscribe from
 * @param {Function} callback - The specific callback function to remove
 */
export const unsubscribeFromEvent = (eventName, callback) => {
  eventEmitter.off(eventName, callback);
};
