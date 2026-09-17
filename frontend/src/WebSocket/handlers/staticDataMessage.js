/**
 * The staticData family: a new Static Data Export build was published.
 *
 * The build is compared against the one this page is holding, so a client
 * already on it does nothing. The refresh itself is spread across a window
 * rather than started here — every connected client is told at the same instant.
 */

import { getAppConfig } from "../../Functions/Endpoints/Public/appConfig.js";
import { heldStaticDataBuildVersion } from "../../Functions/Helper/getCachedData.js";
import { refreshStaticDataAfterAnnouncement } from "../../Functions/Static/staticDataSync.js";

/**
 * What this page is holding: the cache's own answer, and app-config's only until
 * the first refresh has given one. app-config reports the build the server held
 * when it was last fetched, which stops being what this client holds the moment
 * the client acts on an announcement.
 *
 * @returns {string}
 */
function currentBuildVersion() {
  return heldStaticDataBuildVersion() ?? getAppConfig().sde_build_version ?? "";
}

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
  if (version !== "" && version === currentBuildVersion()) {
    return true;
  }

  refreshStaticDataAfterAnnouncement();
  return true;
}
