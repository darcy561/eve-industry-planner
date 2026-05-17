import { decodeJwt } from "jose";
import refreshEsiAccessTokenViaSsoRefreshEndpoint from "../Functions/EveESI/Character/refreshAccessToken";
import refreshEsiAccessTokenFromServerStoredCredential from "../Functions/EveESI/Character/refreshCloudStoredEsiAccessToken";
import getCharacterPublicInfo from "../Functions/EveESI/Character/getPublicData";
import useUsersStore from "../Zustand/usersStore";

/**
 * @typedef {Object} CharacterFromSSOOptions
 * @property {Object} [jwtPayload] - Decoded ESI **access** JWT (`sub`, `owner`, `name`, `exp`, `tier`)
 * @property {Object} [tokenResponse] - OAuth-style `{ access_token, refresh_token }` from SSO exchange or refresh
 * @property {boolean} [isMainCharacter=false] - Main planner character (persists refresh to local `Auth` when true)
 */

/**
 * EVE Online character model built from ESI OAuth tokens.
 *
 * @class Character
 * @example
 * const character = new Character({
 *   jwtPayload: decodedAccessJwt,
 *   tokenResponse: { access_token, refresh_token },
 *   isMainCharacter: true,
 * });
 */
class Character {
  /**
   * @param {Character|CharacterFromSSOOptions} [options] - Another `Character` to clone, or a single options bag (see {@link CharacterFromSSOOptions}). Omit or pass `{}` for the logged-out placeholder row.
   */
  constructor(options = {}) {
    if (options instanceof Character) {
      this._assignFromCharacter(options);
      return;
    }

    const {
      jwtPayload = {},
      tokenResponse = {},
      isMainCharacter = false,
    } = options;

    const subMatch = jwtPayload?.sub?.match(/\w*:\w*:(\d*)/);
    this.CharacterID = Number(subMatch?.[1]) || 94800326;
    this.CharacterHash = jwtPayload?.owner || "ABC123";
    this.CharacterName = jwtPayload?.name || "Example Character";
    this.esiAccessToken = tokenResponse?.access_token || "";
    this.esiAccessTokenEXP = Number(jwtPayload?.exp) || 0;
    this.esiRefreshToken = tokenResponse?.refresh_token || "";
    this.refreshState = 1;
    this.corporation_id = null;
    this.isOmega = jwtPayload?.tier === "live";
    this.isMainCharacter = isMainCharacter;
  }

  /** @param {Character} other */
  _assignFromCharacter(other) {
    this.CharacterID = other.CharacterID;
    this.CharacterHash = other.CharacterHash;
    this.CharacterName = other.CharacterName;
    this.esiAccessToken = other.esiAccessToken;
    this.esiAccessTokenEXP = other.esiAccessTokenEXP;
    this.esiRefreshToken = other.esiRefreshToken;
    this.refreshState = other.refreshState;
    this.corporation_id = other.corporation_id;
    this.isOmega = other.isOmega;
    this.isMainCharacter = other.isMainCharacter;
    this.accountRefreshTokens = other.accountRefreshTokens;
    this.isPlaceholder = other.isPlaceholder;
  }

  /**
   * Default row for an empty `account.characters` list (before SSO).
   * @param {Pick<CharacterFromSSOOptions, "isMainCharacter">} [options]
   * @returns {Character}
   */
  static placeholder(options = {}) {
    const { isMainCharacter = true } = options;
    const inst = new Character({ isMainCharacter });
    inst.isPlaceholder = true;
    return inst;
  }

  getRefreshTokenObject() {
    return {
      CharacterHash: this.CharacterHash,
    };
  }

  /**
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

  setRefreshState = (inputStateValue) => {
    if (!inputStateValue) return;
    this.refreshState = inputStateValue;
  };

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
   * Refreshes the **ESI access JWT** (CCP), not the planner app session.
   * Dispatches to server-stored vs client-held OAuth refresh (`esi_oauth_storage` / settings).
   *
   * Buffer is **660 s (11 min)** — see `tokenActions.refreshServerToken` for planner session cadence.
   *
   * @returns {Promise<number>} 1 if refreshed, 0 if skipped or failed
   */
  refreshEsiAccessTokenIfNeeded = async () => {
    try {
      if (this.isPlaceholder) {
        return 0;
      }
      const currentTimeStamp = Math.floor(Date.now() / 1000);
      const bufferTime = 660;

      if (this.esiAccessTokenEXP >= currentTimeStamp + bufferTime) return 0;
      this.refreshState = 2;
      const cloudAccounts =
        !!useUsersStore.getState().applicationSettings.userCloudAccounts;
      const JWT = cloudAccounts
        ? await refreshEsiAccessTokenFromServerStoredCredential(this.CharacterHash)
        : await refreshEsiAccessTokenViaSsoRefreshEndpoint(this.esiRefreshToken);
      if (JWT instanceof Error) {
        throw JWT;
      }
      const { exp } = decodeJwt(JWT.access_token);

      this.esiAccessToken = JWT.access_token;
      this.esiAccessTokenEXP = Number(exp);
      if (!cloudAccounts) {
        this.esiRefreshToken = JWT.refresh_token ?? "";
      } else {
        this.esiRefreshToken = "";
      }
      this.refreshState = 3;
      if (this.isMainCharacter && !cloudAccounts && JWT.refresh_token) {
        localStorage.setItem("Auth", JWT.refresh_token);
      }
      return 1;
    } catch (err) {
      console.error(err.message);
      return 0;
    }
  };
}

export default Character;
