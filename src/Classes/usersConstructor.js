import { decodeJwt } from "jose";
import refreshAccessTokenESICall from "../Functions/EveESI/Character/refreshAccessToken";
import getCharacterPublicInfo from "../Functions/EveESI/Character/getPublicData";
import { trace } from "firebase/performance";
import { performance } from "../firebase";
import requiredCharacterESICalls from "../Functions/EveESI/esiCallStack";

class User {
  constructor(decodedToken, tokenJSON, isParentUser = false) {
    this.accountID = decodedToken.owner.replace(/[^a-zA-z0-9 ]/g, "");
    this.CharacterID = Number(decodedToken.sub.match(/\w*:\w*:(\d*)/)[1]);
    this.CharacterHash = decodedToken.owner;
    this.CharacterName = decodedToken.name;
    this.aToken = tokenJSON.access_token;
    this.aTokenEXP = Number(decodedToken.exp);
    this.rToken = tokenJSON.refresh_token;
    this.refreshState = 1;
    this.corporation_id = null;
    this.isOmega = decodedToken.tier === "live" ? true : false;
    if (isParentUser) {
      this.ParentUser = isParentUser;
      this.linkedJobs = new Set();
      this.linkedOrders = new Set();
      this.linkedTrans = new Set();
      this.settings = null;
      this.accountRefreshTokens = [];
    }
  }
  getRefreshTokenObject() {
    return {
      UID: this.accountID,
      CharacterHash: this.CharacterHash,
    };
  }

  toggleCloudAccounts = (isChecked = false) => {
    if (!this.ParentUser) return;
    const localStorageKey = `${this.CharacterHash} AdditionalAccounts`;
    if (isChecked) {
      const storedAccounts =
        JSON.parse(localStorage.getItem(localStorageKey)) || [];
      this.accountRefreshTokens = storedAccounts;
      localStorage.removeItem(localStorageKey);
    } else {
      localStorage.setItem(
        localStorageKey,
        JSON.stringify(this.accountRefreshTokens)
      );
      this.accountRefreshTokens = [];
    }
  };
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
        console.error("Failed to remove access token.");
        console.log(err);
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
        console.log("Character data is missing expected properties");
      }
    } catch (err) {
      console.log(`Failed to fetch character data: ${err.message}`);
    }
  };

  refreshAccessToken = async () => {
    try {
      const currentTimeStamp = Math.floor(Date.now() / 1000);
      if (this.aTokenEXP >= currentTimeStamp) return 0;
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
      console.error(err.message)
      return 0;
    }
  };

  getCharacterESIData = async () => {
    try {
      const fbTrace = trace(performance, "CharacterESICalls");
      fbTrace.start();
      const resultObject = {
        owner: this.CharacterHash,
        corporation_id: this.corporation_id,
      };

      const esiResults = await Promise.all(
        Object.values(requiredCharacterESICalls).map((call) => call(this))
      );

      Object.keys(requiredCharacterESICalls).forEach((key, index) => {
        resultObject[key] = esiResults[index];
      });

      fbTrace.stop();
      return resultObject;
    } catch (err) {
      console.error(`Error fetching character ESI data: ${err}`);
      return {
        owner: this.CharacterHash,
        corporation_id: this.corporation_id,
      };
    }
  };
}

export default User;
