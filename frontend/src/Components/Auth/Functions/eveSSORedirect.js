import { getRuntimeEnv } from "../../../utils/runtime-config";

export default function redirectToEveSSO() {
  const state = "main";
  window.location.href = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(
    getRuntimeEnv("EVE_CALLBACK_URL")
  )}&client_id=${getRuntimeEnv("EVE_CLIENT_ID")}&scope=${
    getRuntimeEnv("EVE_SCOPE")
  }&state=${state}`;
}
