import { Buffer } from "buffer";

async function refreshAccessTokenESICall(refreshToken) {
  try {
    const buffer = Buffer.from(
      `${import.meta.env.VITE_eveClientID}:${import.meta.env.VITE_eveSecretKey}`
    );
    const authHeader = `Basic ${buffer.toString("base64")}`;

    const response = await fetch("https://login.eveonline.com/v2/oauth/token", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "login.eveonline.com",
      },
      body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
    });

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error refreshing access token: ${err}`);
    return err;
  }
}

export default refreshAccessTokenESICall;
