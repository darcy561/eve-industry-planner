import { Buffer } from "buffer";
import { decodeJwt } from "jose";
import User from "../../../Classes/usersConstructor";

async function getEveOauthToken(authCode, accountType = false) {
  try {
    if (!authCode) {
      throw new Error("Missing Auth Code");
    }
    const buffer = Buffer.from(
      `${import.meta.env.VITE_eveClientID}:${import.meta.env.VITE_eveSecretKey}`
    );
    const authHeader = `Basic ${buffer.toString("base64")}`;

    const eveTokenPromise = await fetch(
      "https://login.eveonline.com/v2/oauth/token",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          Host: "login.eveonline.com",
          "Access-Control-Allow-Origin": "*",
        },
        body: `grant_type=authorization_code&code=${authCode}`,
      }
    );

    const tokenJSON = await eveTokenPromise.json();

    const decodedToken = decodeJwt(tokenJSON.access_token);

    const newUser = new User(decodedToken, tokenJSON, accountType);
    if (accountType) {
      localStorage.setItem("Auth", tokenJSON.refresh_token);
    }
    return newUser;
  } catch (err) {
    console.log(err);
    return new Error("Unable to Authenticate SSO Token")
  } 
}
export default getEveOauthToken;
