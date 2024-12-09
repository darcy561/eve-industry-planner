import { getToken } from "firebase/app-check";
import { appCheck } from "../firebase";

async function sendAppCheckTokenToSW() {
  if (navigator.serviceWorker.controller) {
    const token = await getToken(appCheck);

    navigator.serviceWorker.controller.postMessage({
      type: "SET_APP_CHECK_TOKEN",
      token: token.token,
    });
  }
}
export default sendAppCheckTokenToSW;
