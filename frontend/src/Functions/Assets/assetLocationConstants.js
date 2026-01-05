/**
 * Constants for EVE Online asset location types and flags.
 * 
 * These constants define which location types and flags are accepted
 * when processing and organizing EVE Online assets.
 */

/**
 * Set of direct location types that can be used directly without parent lookup.
 * These are top-level locations like stations and solar systems.
 * @type {Set<string>}
 */
export const acceptedDirectLocationTypes = new Set(["station", "solar_system"]);

/**
 * Set of extended location types that require parent lookup.
 * These are nested locations like items and other container types.
 * @type {Set<string>}
 */
export const acceptedExtendedLocationTypes = new Set(["item", "other"]);

/**
 * Set of accepted location flags for assets.
 * These flags indicate where assets are stored within a location (e.g., Hangar, CorpSAG1-7).
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

