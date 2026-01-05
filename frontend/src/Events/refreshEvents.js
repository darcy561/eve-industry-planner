import { eventEmitter } from "../utils/EventSystem";

/**
 * Triggers a general refresh event to update application data.
 * Emits a refresh event that components can listen to for data updates.
 * 
 * @returns {void}
 * 
 * @example
 * triggerRefresh(); // Components listening to 'refreshTriggered' will update
 */
export function triggerRefresh() {
  eventEmitter.emit("refreshTriggered");
}

/**
 * Checks if a refresh is needed by emitting a check event.
 * Components can listen to this event to determine if they need to refresh their data.
 * 
 * @returns {void}
 * 
 * @example
 * checkRefreshNeeded(); // Components will check if they need to refresh
 */
export function checkRefreshNeeded() {
  eventEmitter.emit("checkRefreshNeeded");
}

/**
 * Notifies that a refresh operation has been completed.
 * Emits an event to inform components that refresh is finished.
 * 
 * @returns {void}
 * 
 * @example
 * notifyRefreshComplete(); // Components listening to 'refreshComplete' will be notified
 */
export function notifyRefreshComplete() {
  eventEmitter.emit("refreshComplete");
}

/**
 * Triggers a refresh of ESI data for a specific character.
 * Emits an event to refresh EVE Online ESI data for the specified character.
 * 
 * @param {string} requestedCharacterHash - Hash identifying the character to refresh ESI data for
 * @returns {void}
 * 
 * @example
 * triggerESIRefresh("character_hash_123"); // ESI data for character will be refreshed
 */
export function triggerESIRefresh(requestedCharacterHash) {
  eventEmitter.emit("refreshESIData", requestedCharacterHash);
}
