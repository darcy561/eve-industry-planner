import { canonicalCharacterHashKey } from "../Functions/Auth/characterHashCanonical.js";

/**
 * Corporation class for EVE Online corporation data management.
 *
 * @class Corporation
 * @example
 * // Create corporation from user and public data
 * const corp = new Corporation(userObject, publicData, divisionsData);
 *
 * @example
 * // Add member to corporation
 * corp.addMember('ABC123');
 *
 * @example
 * // Remove member from corporation
 * corp.removeMember('ABC123');
 *
 * @example
 * // Add office locations from assets
 * corp.addOfficeLocations(officeLocationIDs);
 */
class Corporation {
  /**
   * Creates a new Corporation instance from EVE Online data.
   *
   * @param {Object} userObject - User object containing corporation information
   * @param {number} userObject.corporation_id - Corporation ID
   * @param {string} userObject.CharacterHash - Character hash
   * @param {Object} publicData - Public corporation data from EVE API
   * @param {string} [publicData.name] - Corporation name
   * @param {string} [publicData.ticker] - Corporation ticker
   * @param {number} [publicData.tax_rate] - Corporation tax rate
   * @param {number} [publicData.alliance_id] - Alliance ID
   * @param {Object} divisionsData - Corporation divisions data
   * @param {Array<Object>} [divisionsData.wallet] - Wallet divisions
   * @param {Array<Object>} [divisionsData.hangar] - Hangar divisions
   */
  constructor(userObject, publicData, divisionsData) {
    this.corporation_id = userObject.corporation_id;
    this.corporationName = publicData?.name || "Unknown Corporation";
    this.corporationTicker = publicData?.ticker || "UNKNOWN";
    this.corporationTaxRate = publicData?.tax_rate || 0;
    this.alliance_id = publicData?.alliance_id || null;
    this.officeLocations = [];
    this.wallets = divisionsData?.wallet || [];
    this.hangars = buildHangarStructure(divisionsData);
    this.members = [userObject.CharacterHash];
  }

  /**
   * Collapses duplicate member entries (e.g. from multiple `addMember` calls for the same character).
   * Order is preserved; first-seen hash string is kept per canonical key.
   */
  dedupeMembers() {
    if (!Array.isArray(this.members) || this.members.length === 0) return;
    const seen = new Set();
    this.members = this.members.filter((m) => {
      const k = canonicalCharacterHashKey(m);
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Adds a member to the corporation.
   * Idempotent: same character (by canonical hash) is not added twice.
   *
   * @param {string} characterHash - Character hash of the member to add
   */
  addMember(characterHash) {
    if (!canonicalCharacterHashKey(characterHash)) return;
    if (this.hasMember(characterHash)) return;
    this.members.push(characterHash);
  }

  /**
   * Removes a member from the corporation, by the same reading of a hash that
   * {@link Corporation#addMember} uses.
   *
   * @param {string} characterHash - Character hash of the member to remove
   */
  removeMember(characterHash) {
    const key = canonicalCharacterHashKey(characterHash);
    if (!key) return;
    this.members = this.members.filter(
      (member) => canonicalCharacterHashKey(member) !== key,
    );
  }

  /**
   * Whether a character is a member, by the same reading of a hash.
   *
   * @param {string} characterHash
   * @returns {boolean}
   */
  hasMember(characterHash) {
    const key = canonicalCharacterHashKey(characterHash);
    if (!key) return false;
    return this.members.some(
      (member) => canonicalCharacterHashKey(member) === key,
    );
  }

  /**
   * Records the stations and structures the corporation rents an office at.
   *
   * @param {Array<number>} locationIDs
   */
  addOfficeLocations(locationIDs = []) {
    this.officeLocations = [
      ...new Set([...locationIDs, ...this.officeLocations]),
    ];
  }
}

/**
 * Builds hangar structure from corporation divisions data.
 *
 * @param {Object} divisionsData - Corporation divisions data
 * @param {Array<Object>} [divisionsData.hangar] - Array of hangar division objects
 * @returns {Array<Object>} Array of structured hangar objects
 */
function buildHangarStructure(divisionsData) {
  const hangars = divisionsData?.hangar || [];
  const hangarStructure = hangars.map((hangar) => {
    return {
      ...hangar,
      assetLocationRef: `CorpSAG${hangar.division}`,
    };
  });
  hangarStructure.push({
    division: 0,
    name: "Projects",
    assetLocationRef: "CorporationGoalDeliveries",
  });

  return hangarStructure;
}

export default Corporation;
