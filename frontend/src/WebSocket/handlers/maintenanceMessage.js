/**
 * The maintenance family: the stack entered or left a maintenance window.
 *
 * Applied directly rather than by re-reading app-config, so every connected tab
 * does not fetch at the instant the operator toggles.
 */

import { setMaintenanceMode } from "../../Functions/Endpoints/Public/appConfig.js";

/**
 * @param {Record<string, unknown>} msg
 * @returns {boolean} whether the message was well-formed
 */
export function applyMaintenanceMessage(msg) {
  if (typeof msg?.enabled !== "boolean") return false;
  setMaintenanceMode(msg.enabled);
  return true;
}
