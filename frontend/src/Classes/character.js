import getCharacterPublicInfo from "../Functions/EveESI/Character/getPublicData";

/**
 * @typedef {Object} CharacterFromSSOOptions
 * @property {Object} [jwtPayload] - Decoded ESI **access** JWT (`sub`, `owner`, `name`, `tier`)
 * @property {Object} [tokenResponse] - OAuth-style `{ refresh_token }` from SSO exchange or refresh
 * @property {boolean} [isMainCharacter=false] - Main planner character (persists refresh to local `Auth` when true)
 */

/**
 * EVE Online character identity. Access tokens are **not** here: they live in the ESI credential
 * provider, so refreshing one does not write the store and does not re-render the roster's
 *
 * @class Character
 * @example
 * const character = new Character({
 * jwtPayload: decodedAccessJwt,
 * tokenResponse: { access_token, refresh_token },
 * isMainCharacter: true,
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
    this.esiRefreshToken = tokenResponse?.refresh_token || "";
    this.corporation_id = null;
    this.isOmega = jwtPayload?.tier === "live";
    this.isMainCharacter = isMainCharacter;
  }

  /** @param {Character} other */
  _assignFromCharacter(other) {
    this.CharacterID = other.CharacterID;
    this.CharacterHash = other.CharacterHash;
    this.CharacterName = other.CharacterName;
    this.esiRefreshToken = other.esiRefreshToken;
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
        (i) => i.CharacterHash !== tokenToRemove,
      );
    } else {
      try {
        const storedAccounts =
          JSON.parse(localStorage.getItem("AdditionalAccounts")) || [];
        const updatedAccounts = storedAccounts.filter(
          (i) => i.CharacterHash !== tokenToRemove,
        );
        localStorage.setItem(
          "AdditionalAccounts",
          JSON.stringify(updatedAccounts),
        );
      } catch (err) {
        console.error("Failed to remove access token.", err);
      }
    }
  }

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
}

export default Character;
