import { trace } from "@firebase/performance";
import { performance } from "../../firebase";
import { decodeJwt } from "jose";
import User from "../../Classes/usersConstructor";
import refreshAccessTokenESICall from "../../Functions/EveESI/Character/refreshAccessToken";

async function getUserFromRefreshToken(rToken, isMainUser = false) {
  const t = trace(performance, "UseRefreshToken");
  try {
    t.start();
    const refreshToken = await refreshAccessTokenESICall(rToken);

    if (refreshToken instanceof Error) {
      throw refreshToken;
    }

    const decodedToken = decodeJwt(refreshToken.access_token);

    const newUser = new User(decodedToken, refreshToken, isMainUser);

    if (isMainUser) {
      localStorage.setItem("Auth", refreshToken.refresh_token);
    }
    t.incrementMetric("RefreshSuccess", 1);
    return newUser;
  } catch (err) {
    console.error(err);
    t.incrementMetric("RefreshFail", 1);
    t.putAttribute("FailError", err.name);

    if (isMainUser) {
      localStorage.removeItem("Auth");
    }
    return err;
  } finally {
    t.stop();
  }
}

export default getUserFromRefreshToken;
