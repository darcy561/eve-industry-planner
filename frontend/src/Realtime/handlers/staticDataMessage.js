/**
 * The staticData family: a new Static Data Export build was published.
 *
 * The build is compared against the one this page loaded with, so a client
 * already holding it does nothing. The refresh itself is spread across a window
 * rather than started here — every connected client is told at the same instant.
 */

import { getAppConfig } from "../../Functions/Endpoints/Public/appConfig.js";
import { refreshStaticDataAfterAnnouncement } from "../../Functions/Static/staticDataSync.js";

/**
 * @param {Record<string, unknown>} msg
 * @returns {boolean} whether the message was well-formed
 */
export function applyStaticDataMessage(msg) {
  const version = typeof msg?.version === "string" ? msg.version.trim() : "";
  const buildNumber =
    typeof msg?.buildNumber === "number" ? msg.buildNumber : null;
  if (version === "" && buildNumber === null) return false;

  // An announcement for the build already held is the common case on reconnect,
  // and re-reading the files for it would download what is already cached.
  if (version !== "" && version === getAppConfig().sde_build_version) {
    return true;
  }

  refreshStaticDataAfterAnnouncement();
  return true;
}
