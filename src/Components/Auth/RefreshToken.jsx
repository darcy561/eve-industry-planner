import { trace } from "@firebase/performance";
import { performance } from "../../firebase";
import { decodeJwt } from "jose";
import { login } from "./MainUserAuth";
import User from "../../Classes/usersConstructor";
import refreshAccessTokenESICall from "../../Functions/EveESI/Character/refreshAccessToken";

async function getUserFromRefreshToken(rToken, isMainUser = false) {
  try {
    const t = trace(performance, "UseRefreshToken");
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
    t.stop();
    return newUser;
  } catch (err) {
    console.error(err);
    t.incrementMetric("RefreshFail", 1);
    t.putAttribute("FailError", err.name);
    t.stop();
    if (isMainUser) {
      localStorage.removeItem("Auth");
    }
    return err;
  }
}

export default getUserFromRefreshToken;
