import { useContext, useEffect } from "react";
import { UserJobSnapshotContext } from "../../Context/AuthContext";
import { IsLoggedInContext } from "../../Context/AuthContext";
import { useFirebase } from "../../Hooks/useFirebase";
import { JobArrayContext } from "../../Context/JobContext";
import { trace } from "@firebase/performance";
import { performance } from "../../firebase";
import {
  PageLoadContext,
  DialogDataContext,
  UserLoginUIContext,
} from "../../Context/LayoutContext";
import { getAnalytics, logEvent } from "firebase/analytics";
import { UserLogInUI } from "./LoginUI/LoginUI";
import useCheckGlobalAppVersion from "../../Hooks/GeneralHooks/useCheckGlobalAppVersion";
import buildNewUserData from "../../Functions/Firebase/buildNewUserAccount";
import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";
import getFirebaseAuthToken from "../../Functions/Firebase/getFirebaseToken";

export function login() {
  const state = "main";
  window.location.href = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(
    import.meta.env.VITE_eveCallbackURL
  )}&client_id=${import.meta.env.VITE_eveClientID}&scope=${
    import.meta.env.VITE_eveScope
  }&state=${state}`;
}

export default function AuthMainUser() {
  const { updateJobArray } = useContext(JobArrayContext);
  const { updateIsLoggedIn } = useContext(IsLoggedInContext);
  const { updatePageLoad } = useContext(PageLoadContext);
  const { updateUserJobSnapshot } = useContext(UserJobSnapshotContext);
  const { updateDialogData } = useContext(DialogDataContext);
  const { updateUserUIData, updateLoginInProgressComplete } =
    useContext(UserLoginUIContext);
  const {
    userJobSnapshotListener,
    userWatchlistListener,
    userMaindDocListener,
    userGroupDataListener,
  } = useFirebase();
  const analytics = getAnalytics();

  useEffect(() => {
    async function processOauthCallback() {
      const urlParams = new URLSearchParams(window.location.search);
      const authCode = urlParams.get("code");
      const mode = urlParams.get("state");

      if (mode === "main") {
        await mainUserLoggin(authCode, mode);
      } else if (mode === "additional") {
        await importAccount(authCode, mode);
      }

      async function importAccount(authCode) {
        localStorage.setItem("AdditionalUser", authCode);
        window.close();
      }
      async function mainUserLoggin(authCode, mode) {
        const t = trace(performance, "MainUserLoginProcessFull");
        t.start();

        updateLoginInProgressComplete(false);
        if (!useCheckGlobalAppVersion()) {
          updateDialogData((prev) => ({
            ...prev,
            buttonText: "Close",
            id: "OutdatedAppVersion",
            open: true,
            title: "Outdated App Version",
            body: "A newer version of the application is available, refresh the page to begin using this.",
          }));
          return;
        }
        if (!authCode) return;

        const userObject = await getEveOauthToken(authCode, true);
        if (!userObject) {
          login()
        }
        let fbToken = await getFirebaseAuthToken(userObject);
        await userObject.getPublicCharacterData();
        updateUserUIData((prev) => ({
          ...prev,
          eveLoginComplete: true,
          userArray: [
            {
              CharacterID: userObject.CharacterID,
              CharacterName: userObject.CharacterName,
            },
          ],
          returnState: decodeURIComponent(
            window.location.search.match(/state=(\S*)/)[1]
          ),
        }));
        await buildNewUserData(fbToken);

        userMaindDocListener(fbToken, userObject);
        userJobSnapshotListener(userObject);
        userWatchlistListener(fbToken, userObject);
        userGroupDataListener(userObject);

        updateUserJobSnapshot([]);
        updateJobArray([]);
        updateIsLoggedIn(true);
        updatePageLoad(false);
        logEvent(analytics, "userSignIn", {
          UID: fbToken.user.uid,
        });
        t.stop();
      }
    }
    processOauthCallback();
  }, []);

  return <UserLogInUI />;
}
