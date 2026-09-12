/**
 * Prefix used for unresolved/inaccessible location names.
 * Some values include a suffix (e.g. " - <id>"), so callers should use the helper below.
 *
 * @type {string}
 */
export const NO_ACCESS_LOCATION_NAME_PREFIX = "No Access To Location";

/**
 * What a place is called when nothing can name it — ESI answered and had no name for the id.
 *
 * Distinct from a refusal, which says the account cannot see the place and is worth saying in those
 * words. This one says only that the place has no name to give.
 *
 * @type {string}
 */
export const UNNAMED_LOCATION_LABEL = "Unknown Location";

/**
 * What a place is called when the lookup for it did not settle.
 *
 * Distinct from both a refusal and an unnamed answer: nothing has been established about this place
 * at all, and asking again may name it. Only a surface that shows what it could not resolve says
 * this — the place is still where the assets are.
 *
 * @type {string}
 */
export const UNRESOLVED_LOCATION_LABEL = "Name unavailable";

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

/**
 * Sentinel location an item sits at once it has been moved to asset safety.
 *
 * @type {number}
 */
export const ASSET_SAFETY_LOCATION_ID = 2004;

/**
 * The first id EVE gives to something spawned into the world rather than defined by the universe:
 * a player structure, an assembled ship, a container.
 *
 * @type {number}
 */
const SPAWNED_ITEM_FLOOR = 1000000000000;

/**
 * Location flags only a ship files things in.
 *
 * Fitting slots and bays, and the holds a hull carries — cargo included. A structure's own modules
 * carry the `Structure` prefix and are excluded, and so is `RigSlot`, which an Upwell structure has
 * as well as a ship. Nothing here is a flag a station, a structure or a container uses.
 *
 * Deliberately not the list `assembledShipIds` keeps: that one answers "is this item an assembled
 * ship", and admitting `Cargo` to it would take containers with it. This one answers "is the thing
 * holding this a ship", which is asked only of a holder the asset set does not contain.
 *
 * @type {string[]}
 */
const SHIP_HOLD_PREFIXES = [
  "HiSlot",
  "MedSlot",
  "LoSlot",
  "SubSystemSlot",
  "SubSystemBay",
  "DroneBay",
  "FighterBay",
  "FighterTube",
  "FrigateEscapeBay",
  "Specialized",
  "Cargo",
  "FleetHangar",
  "ShipHangar",
  "BoosterBay",
  "ExpeditionHold",
  "MobileDepotHold",
  "MoonMaterialBay",
  "QuafeBay",
  "Wardrobe",
  "AutoFit",
  "HiddenModifiers",
];

/**
 * Whether a flag says the thing holding this is a ship.
 *
 * @param {string} [flag]
 * @returns {boolean}
 */
export function isShipHoldFlag(flag = "") {
  if (flag.startsWith("Structure")) return false;
  return SHIP_HOLD_PREFIXES.some((prefix) => flag.startsWith(prefix));
}

/**
 * What a resolved `location_id` refers to.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const LOCATION_KIND = Object.freeze({
  ASSET_SAFETY: "assetSafety",
  SHIP: "ship",
  REGION: "region",
  CONSTELLATION: "constellation",
  SYSTEM: "system",
  ABYSSAL_SYSTEM: "abyssalSystem",
  CELESTIAL: "celestial",
  STARGATE: "stargate",
  STATION: "station",
  STATION_FOLDER: "stationFolder",
  STRUCTURE: "structure",
  UNKNOWN: "unknown",
});

/**
 * Classifies a location id by its range, per EVE's published id ranges.
 *
 * A row's `location_type` cannot do this on its own: a player structure arrives as `"item"`, the
 * same value a container carries, so telling them apart means walking the chain to find where it
 * ends. The range answers it from the id alone.
 *
 * Only a spawned item — an id at or above a million million — is a structure. Everything below that
 * and outside a documented range is `UNKNOWN`, which is the point of classifying at all: an id
 * treated as a structure on the strength of matching nothing else is asked of every linked
 * character and refused by all of them, which is what a ship in space used to cost.
 *
 * This answers what a *place* is. The ids of characters, corporations, alliances and factions fall
 * outside every range here and read as `UNKNOWN`; {@link nameSource} is what knows those can
 * still be named.
 *
 * `SHIP` is not decided here: a ship's item id sits in the same range as a structure's, and only the
 * flag of the thing filed inside it tells the two apart. {@link buildAssetNodes} settles that.
 *
 * @see https://developers.eveonline.com/docs/guides/id-ranges/
 * @param {number} locationId
 * @returns {string} one of {@link LOCATION_KIND}
 */
export function resolveLocationKind(locationId) {
  if (locationId === ASSET_SAFETY_LOCATION_ID)
    return LOCATION_KIND.ASSET_SAFETY;
  if (locationId >= SPAWNED_ITEM_FLOOR) return LOCATION_KIND.STRUCTURE;
  if (locationId >= 10000000 && locationId < 20000000)
    return LOCATION_KIND.REGION;
  if (locationId >= 20000000 && locationId < 30000000) {
    return LOCATION_KIND.CONSTELLATION;
  }
  // Abyssal systems are their own kind because an asset there is reached differently, but every
  // other subdivision of the system range — New Eden, wormhole, void, hidden — is a system.
  if (locationId >= 32000000 && locationId < 33000000) {
    return LOCATION_KIND.ABYSSAL_SYSTEM;
  }
  if (locationId >= 30000000 && locationId < 40000000)
    return LOCATION_KIND.SYSTEM;
  if (locationId >= 40000000 && locationId < 50000000)
    return LOCATION_KIND.CELESTIAL;
  if (locationId >= 50000000 && locationId < 60000000)
    return LOCATION_KIND.STARGATE;
  // Stations and outposts. Above them sit the station folders — containers for a station's offices
  // rather than places, and not entities ESI will name. The band between the two, 64M to 65.9M, is
  // unlabelled in EVE's table, so it is left unknown rather than assumed to be either.
  if (locationId >= 60000000 && locationId < 64000000)
    return LOCATION_KIND.STATION;
  if (locationId >= 66000000 && locationId < 70000000) {
    return LOCATION_KIND.STATION_FOLDER;
  }
  return LOCATION_KIND.UNKNOWN;
}
