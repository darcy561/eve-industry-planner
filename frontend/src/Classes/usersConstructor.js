import { decodeJwt } from "jose";
import refreshAccessTokenESICall from "../Functions/EveESI/Character/refreshAccessToken";
import getCharacterPublicInfo from "../Functions/EveESI/Character/getPublicData";
import {
  fetchServerJWT,
  refreshServerJWT,
} from "../Functions/Auth/serverTokens";

/**
 * User class for EVE Online character and account management.
 *
 * This class represents a user/character in EVE Online for:
 * - Character authentication and token management
 * - ESI API access token handling and refresh
 * - Character public data retrieval and caching
 * - Corporation membership tracking
 * - Account management for multi-character setups
 * - Token refresh state management
 *
 * The User class provides comprehensive character management:
 * - JWT token parsing and management
 * - Automatic token refresh with buffer time
 * - Character public data fetching and caching
 * - Corporation ID tracking
 * - Multi-character account support
 * - Token refresh state tracking
 *
 * @class User
 * @example
 * // Create user from authentication data
 * const user = new User(authData, tokenJSON, true);
 *
 * @example
 * // Refresh access token
 * const refreshResult = await user.refreshAccessToken();
 *
 * @example
 * // Get public character data
 * await user.getPublicCharacterData();
 * console.log('Corporation ID:', user.corporation_id);
 *
 * @example
 * // Remove refresh token
 * user.removeRefreshToken('ABC123', cloudAccounts);
 */
class User {
  /**
   * Creates a new User instance from authentication data.
   *
   * @param {Object} data - Authentication data object
   * @param {string} data.owner - Account owner identifier
   * @param {string} data.sub - JWT subject containing character ID
   * @param {string} data.name - Character name
   * @param {number} data.exp - Token expiration timestamp
   * @param {string} data.tier - Account tier (live for Omega, etc.)
   * @param {Object} tokenJSON - Token data object
   * @param {string} tokenJSON.access_token - Access token
   * @param {string} tokenJSON.refresh_token - Refresh token
   * @param {boolean} [isParentUser=false] - Whether this is the parent user account
   */
  constructor(data, tokenJSON, isParentUser = false) {
    if (data instanceof User) {
      Object.assign(this, data);
    } else {
      this.accountID =
        data?.owner?.replace(/[^a-zA-z0-9 ]/g, "") || "LoggedOutUser";
      this.CharacterID =
        Number(data?.sub?.match(/\w*:\w*:(\d*)/)[1]) || 94800326;
      this.CharacterHash = data?.owner || "ABC123";
      this.CharacterName = data?.name || "Example Character";
      this.aToken = tokenJSON?.access_token || "";
      this.aTokenEXP = Number(data?.exp) || 0;
      this.rToken = tokenJSON?.refresh_token || "";
      this.refreshState = 1;
      this.corporation_id = null;
      this.isOmega = data?.tier === "live" ? true : false;
      this.ParentUser = isParentUser;
      this.serverAccessToken = null;
      this.serverAccessTokenEXP = data?.serverAccessTokenEXP || 0;
      this.serverRefreshToken = null;
    }
  }
  /**
   * Gets a refresh token object for token management.
   *
   * @returns {Object} Object containing UID and CharacterHash
   */
  getRefreshTokenObject() {
    return {
      UID: this.accountID,
      CharacterHash: this.CharacterHash,
    };
  }

  /**
   * Removes a refresh token from storage.
   *
   * This method removes a refresh token either from:
   * - Cloud accounts array (if provided)
   * - Local storage AdditionalAccounts
   *
   * @param {string} tokenToRemove - Character hash of token to remove
   * @param {Array} cloudAccounts - Cloud accounts array (optional)
   */
  removeRefreshToken(tokenToRemove, cloudAccounts) {
    if (!tokenToRemove || !cloudAccounts) return;

    if (cloudAccounts) {
      this.accountRefreshTokens = this.accountRefreshTokens.filter(
        (i) => i.CharacterHash !== tokenToRemove
      );
    } else {
      try {
        const storedAccounts =
          JSON.parse(localStorage.getItem("AdditionalAccounts")) || [];
        const updatedAccounts = storedAccounts.filter(
          (i) => i.CharacterHash !== tokenToRemove
        );
        localStorage.setItem(
          "AdditionalAccounts",
          JSON.stringify(updatedAccounts)
        );
      } catch (err) {
        console.error("Failed to remove access token.", err);
      }
    }
  }

  /**
   * Sets the refresh state for token management.
   *
   * @param {number} inputStateValue - New refresh state value
   */
  setRefreshState = (inputStateValue) => {
    if (!inputStateValue) return;
    this.refreshState = inputStateValue;
  };

  /**
   * Fetches and caches public character data from EVE ESI API.
   *
   * This method retrieves public character information:
   * - Fetches character data from EVE ESI API
   * - Updates corporation_id if available
   * - Handles errors gracefully with logging
   *
   * @returns {Promise<void>}
   */
  getPublicCharacterData = async () => {
    try {
      const characterObject = await getCharacterPublicInfo(this.CharacterID);

      if (Object.keys(characterObject).length === 0) {
        throw new Error("Character data is empty");
      }
      if (characterObject.corporation_id) {
        this.corporation_id = characterObject.corporation_id;
      } else {
        console.warn("Character data is missing expected properties");
      }
    } catch (err) {
      console.error(`Failed to fetch character data: ${err.message}`);
    }
  };

  /**
   * Refreshes the access token using the refresh token.
   *
   * This method handles token refresh with:
   * - Automatic refresh when token is close to expiration (15 min buffer)
   * - JWT token parsing and validation
   * - Local storage update for parent users
   * - Error handling and state management
   *
   * @returns {Promise<number>} 1 if refreshed successfully, 0 if failed or not needed
   */
  refreshESIToken = async () => {
    try {
      const currentTimeStamp = Math.floor(Date.now() / 1000);
      // Add 15 minute buffer to ensure token is valid until next refresh cycle
      const bufferTime = 900; // 15 minutes in seconds

      if (this.aTokenEXP >= currentTimeStamp + bufferTime) return 0;
      this.refreshState = 2;
      const JWT = await refreshAccessTokenESICall(this.rToken);
      if (JWT instanceof Error) {
        throw JWT;
      }
      const { exp } = decodeJwt(JWT.access_token);

      this.aToken = JWT.access_token;
      this.aTokenEXP = Number(exp);
      this.rToken = JWT.refresh_token;
      this.refreshState = 3;
      if (this.ParentUser) {
        localStorage.setItem("Auth", JWT.refresh_token);
      }
      return 1;
    } catch (err) {
      console.error(err.message);
      return 0;
    }
  };

  requestServerToken = async () => {
    try {
      const response = await fetchServerJWT(this.aToken);
      if (response instanceof Error) throw response;
      this.serverAccessToken = response.access_token;
      // expires_at is already a Unix timestamp (seconds since epoch)
      this.serverAccessTokenEXP = response.expires_at || 0;
      this.serverRefreshToken = response.refresh_token;

      return { first_login: response.first_login };
    } catch (err) {
      throw new Error("Error requesting server token:" + err.message);
    }
  };

  refreshServerToken = async () => {
    try {
      // Early return if no server token exists yet (must call requestServerToken first)
      if (
        !this.serverRefreshToken ||
        !this.serverAccessTokenEXP ||
        this.serverAccessTokenEXP === 0
      ) {
        return;
      }
      const currentTimeStamp = Math.floor(Date.now() / 1000);
      const bufferTime = 900; // 15 minutes in seconds
      if (this.serverAccessTokenEXP >= currentTimeStamp + bufferTime) return;
      const response = await refreshServerJWT(
        this.serverRefreshToken,
        this.aToken
      );
      if (response instanceof Error) throw response;
      this.serverAccessToken = response.access_token;
      // expires_at is already a Unix timestamp (seconds since epoch)
      this.serverAccessTokenEXP = response.expires_at || 0;
      this.serverRefreshToken = response.refresh_token;
      return;
    } catch (err) {
      console.error(err.message);
      return;
    }
  };
}

export default User;
