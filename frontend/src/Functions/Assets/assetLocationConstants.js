/**
 * Constants for EVE Online asset location types and flags.
 *
 * These constants define which location types and flags are accepted
 * when processing and organising EVE Online assets.
 */

/**
 * Set of direct location types that can be used directly without parent lookup.
 * These are top-level locations like stations and solar systems.
 *
 * @type {Set<string>}
 */
export const acceptedDirectLocationTypes = new Set(["station", "solar_system"]);

/**
 * Set of extended location types that require parent lookup.
 * These are nested locations like items and other container types.
 *
 * @type {Set<string>}
 */
export const acceptedExtendedLocationTypes = new Set(["item", "other"]);

/**
 * Set of accepted location flags for assets.
 * These flags indicate where assets are stored within a location (e.g., Hangar, CorpSAG1-7).
 *
 * @type {Set<string>}
 */
export const acceptedLocationFlags = new Set([
  "Hangar",
  "Unlocked",
  "AutoFit",
  "CorpSAG1",
  "CorpSAG2",
  "CorpSAG3",
  "CorpSAG4",
  "CorpSAG5",
  "CorpSAG6",
  "CorpSAG7",
  "CorporationGoalDeliveries",
]);

/**
 * Prefix used for unresolved/inaccessible location names.
 * Some values include a suffix (e.g. " - <id>"), so callers should use the helper below.
 *
 * @type {string}
 */
export const NO_ACCESS_LOCATION_NAME_PREFIX = "No Access To Location";
export const LOCATION_RESOLUTION_STATUS = {
  RESOLVED: "resolved",
  COMMUNITY: "community",
  NO_ACCESS: "no_access",
};

/**
 * Returns true when a location name represents an inaccessible location.
 *
 * @param {string | undefined | null} name
 * @returns {boolean}
 */
export function isNoAccessLocationName(name) {
  return (
    typeof name === "string" && name.startsWith(NO_ACCESS_LOCATION_NAME_PREFIX)
  );
}

/**
 * Returns true when the location object represents an inaccessible location.
 * Supports both new structured fields and legacy name-only entries.
 *
 * @param {{ name?: string, resolutionStatus?: string } | null | undefined} location
 * @returns {boolean}
 */
export function isNoAccessLocation(location) {
  if (!location || typeof location !== "object") return false;
  if (location.resolutionStatus === LOCATION_RESOLUTION_STATUS.NO_ACCESS) {
    return true;
  }
  return isNoAccessLocationName(location.name);
}

