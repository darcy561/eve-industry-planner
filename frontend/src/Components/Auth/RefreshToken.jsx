import { decodeJwt } from "jose";
import Character from "../../Classes/character";
import refreshAccessTokenESICall from "../../Functions/EveESI/Character/refreshAccessToken";

async function getCharacterFromRefreshToken(esiRefreshToken, isMainCharacter = false) {
  try {
    const refreshToken = await refreshAccessTokenESICall(esiRefreshToken);

    if (refreshToken instanceof Error) {
      throw refreshToken;
    }

    const decodedToken = decodeJwt(refreshToken.access_token);

    const newCharacter = new Character({
      jwtPayload: decodedToken,
      tokenResponse: refreshToken,
      isMainCharacter,
    });

    if (isMainCharacter) {
      localStorage.setItem("Auth", refreshToken.refresh_token);
    }
    return newCharacter;
  } catch (err) {
    console.error(err);

    if (isMainCharacter) {
      localStorage.removeItem("Auth");
    }
    return err;
  }
}

export default getCharacterFromRefreshToken;
