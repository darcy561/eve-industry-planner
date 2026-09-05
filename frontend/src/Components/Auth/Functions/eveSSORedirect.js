import { getRuntimeEnv } from "../../../utils/runtime-config";

const EVE_SSO_AUTHORIZE = "https://login.eveonline.com/v2/oauth/authorize/";

/**
 * EVE Online SSO “authorize” URL. Same for main login and additional character linking;
 * the `state` value distinguishes the callback handling.
 *
 * @param {string} [state] - e.g. `"main"` or `"additional:<nonce>"` (see `additionalAccountImport.js`).
 * @returns {string}
 */
export function getEveSsoAuthorizeUrl(
  state = "main"
) {
  return `${EVE_SSO_AUTHORIZE}?response_type=code&redirect_uri=${encodeURIComponent(
    getRuntimeEnv("EVE_CALLBACK_URL")
  )}&client_id=${getRuntimeEnv("EVE_CLIENT_ID")}&scope=${getRuntimeEnv(
    "EVE_SCOPE"
  )}&state=${encodeURIComponent(state)}`;
}

export default function redirectToEveSSO() {
  window.location.href = getEveSsoAuthorizeUrl("main");
}
