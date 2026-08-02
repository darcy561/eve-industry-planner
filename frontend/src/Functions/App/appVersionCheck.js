/**
 * Shared app-version compare / snackbar path for app-config poll and WS nudge.
 * Outdated clients should not auto-reconnect realtime (avoid mixed-version sockets).
 *
 * "Outdated" means the advertised version is *ahead of* this SPA bake (client must refresh).
 * A client that is *ahead of* Redis advertise (new bake before advertise flip) is not outdated.
 */

import { showVersionUpdateSnackbar } from "../../Events/snackbarEvents";

const VERSION_UPDATE_NOTIFIED_KEY = "app_config_version_update_notified";
const VERSION_UPDATE_DISMISSED_KEY = "app_config_version_update_dismissed";

/** @type {string} */
let lastKnownRemoteVersion = "";

function getStoredVersion(key) {
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function setStoredVersion(key, value) {
  try {
    if (!value) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (private mode, blocked storage, etc.).
  }
}

function bakedAppVersion() {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
}

/**
 * Compare X.Y.Z-ish versions. Returns <0 if a<b, 0 if equal, >0 if a>b.
 * Non-numeric / empty segments compare as 0.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareAppVersions(a, b) {
  const pa = String(a || "")
    .trim()
    .split(/[.+-]/)
    .map((p) => parseInt(p, 10));
  const pb = String(b || "")
    .trim()
    .split(/[.+-]/)
    .map((p) => parseInt(p, 10));
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i += 1) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * @returns {boolean} true when advertised train is newer than baked SPA
 */
export function isClientAppVersionOutdated() {
  const remote = lastKnownRemoteVersion;
  const current = bakedAppVersion();
  if (!remote || !current) return false;
  return compareAppVersions(remote, current) > 0;
}

/** @returns {string} */
export function getLastKnownRemoteAppVersion() {
  return lastKnownRemoteVersion;
}

/**
 * Compare remote advertised version to baked `__APP_VERSION__`.
 * Shows the version-update snackbar only when remote is ahead of the SPA.
 * Returns whether the client is outdated after this update.
 *
 * @param {string|null|undefined} remoteVersion
 * @returns {boolean} outdated
 */
export function considerRemoteAppVersion(remoteVersion) {
  const remote =
    typeof remoteVersion === "string" ? remoteVersion.trim() : "";
  if (!remote) {
    return isClientAppVersionOutdated();
  }

  lastKnownRemoteVersion = remote;
  const current = bakedAppVersion();

  if (!current) {
    return false;
  }

  const cmp = compareAppVersions(remote, current);
  // Equal, or SPA ahead of advertise (new bake before Redis flip): not outdated.
  if (cmp <= 0) {
    setStoredVersion(VERSION_UPDATE_NOTIFIED_KEY, "");
    setStoredVersion(VERSION_UPDATE_DISMISSED_KEY, "");
    return false;
  }

  const dismissedVersion = getStoredVersion(VERSION_UPDATE_DISMISSED_KEY);
  if (dismissedVersion === remote) {
    return true;
  }

  const notifiedVersion = getStoredVersion(VERSION_UPDATE_NOTIFIED_KEY);
  if (notifiedVersion !== remote) {
    setStoredVersion(VERSION_UPDATE_NOTIFIED_KEY, remote);
    showVersionUpdateSnackbar(remote, (dismissedTargetVersion) => {
      if (!dismissedTargetVersion) {
        return;
      }
      setStoredVersion(VERSION_UPDATE_DISMISSED_KEY, dismissedTargetVersion);
    });
  }
  return true;
}
