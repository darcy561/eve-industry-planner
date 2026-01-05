import { eventEmitter } from "../utils/EventSystem";
import uuid from "react-uuid";

/**
 * Login step constants for tracking authentication progress.
 * @readonly
 * @enum {string}
 */
export const LOGIN_STEPS = {
  CHARACTER_DATA: 'characterData',
  JOB_PLANNER: 'jobPlanner',
  GROUP_DATA: 'groupData',
  WATCHLIST_DATA: 'watchlistData'
};

/**
 * Emits a login error event for a specific step.
 * Notifies components about authentication errors during the login process.
 * 
 * @param {string} step - The login step where the error occurred (use LOGIN_STEPS constants)
 * @param {Error|string} error - The error object or error message
 * @returns {void}
 * 
 * @example
 * emitLoginError(LOGIN_STEPS.CHARACTER_DATA, "Failed to fetch character data");
 * 
 * @example
 * emitLoginError(LOGIN_STEPS.JOB_PLANNER, new Error("Network timeout"));
 */
export function emitLoginError(step, error) {
  eventEmitter.emit("loginError", step, error);
}

/**
 * Emits a login step completion event.
 * Notifies components that a specific login step has been completed successfully.
 * 
 * @param {string} step - The completed login step (use LOGIN_STEPS constants)
 * @returns {void}
 * 
 * @example
 * emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA); // Character data loaded successfully
 * 
 * @example
 * emitLoginStepComplete(LOGIN_STEPS.JOB_PLANNER); // Job planner data loaded successfully
 */
export function emitLoginStepComplete(step) {
  eventEmitter.emit("loginStepComplete", {
    step,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emits a login completion event.
 * Notifies components that the entire login process has been completed successfully.
 * 
 * @returns {void}
 * 
 * @example
 * emitLoginComplete(); // All login steps completed successfully
 */
export function emitLoginComplete() {
  eventEmitter.emit("loginComplete", {
    timestamp: new Date().toISOString()
  });
}

/**
 * Emits a user data update event.
 * Notifies components about changes to user data during the login process.
 * 
 * @param {Object} userData - The updated user data object
 * @returns {void}
 * 
 * @example
 * emitUserDataUpdate({ characterName: "John Doe", corporationID: 123456 });
 */
export function emitUserDataUpdate(userData) {
  eventEmitter.emit("userDataUpdate", {
    userData,
    timestamp: new Date().toISOString()
  });
} 