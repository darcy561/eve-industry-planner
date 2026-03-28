import { useEffect, useRef } from "react";
import { useFirebase } from "../../Hooks/useFirebase";
import { trace } from "@firebase/performance";
import { performance, auth } from "../../firebase";
import { getAnalytics, logEvent } from "firebase/analytics";
import { signInWithCustomToken } from "firebase/auth";
import { UserLogInUI } from "./LoginUI/LoginUI";
import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";
import getFirebaseTokenViaApi from "../../Functions/Migration/getFirebaseTokenViaApi";
import useUsersStore from "../../Zustand/usersStore";
import redirectToEveSSO from "./Functions/eveSSORedirect";
import { useNavigate } from "@tanstack/react-router";
import { useRefreshUser } from "../../Hooks/useRefreshUser";
import { useLoginState } from "../../Hooks/useLoginState";
import {
  emitLoginComplete,
  emitUserDataUpdate,
} from "../../Events/loginEvents";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "../../Hooks/React Query/useCharacterHooks";
import { buildCorporationObjectFromUserObject } from "../../Functions/Corporations/buildCorporationObject";

export default function AuthMainUser() {
  const {
    userJobSnapshotListener,
    userWatchlistListener,
    userMaindDocListener,
    userGroupDataListener,
  } = useFirebase();
  const {
    toggleIsLoggedIn,
    updateUserArray: updateUserArrayAction,
    setIsFirstTimeLogin,
  } = useUsersStore.getState().users.actions;
  const { clearJobArray, clearUserJobSnapshotArray } =
    useUsersStore.getState().jobData.actions;
  const { reloadMainUser } = useRefreshUser();
  const { isLoginComplete, completedSteps } = useLoginState();
  const queryClient = useQueryClient();
  const { triggerCharacterDataPrefetch } = useCharacterHooks();
  const analytics = getAnalytics();
  const navigate = useNavigate({ from: "/auth" });
  const hasNavigated = useRef(false);

  useEffect(() => {
    async function processOauthCallback() {
      const urlParams = new URLSearchParams(window.location.search);
      const authCode = urlParams.get("code");
      const state = urlParams.get("state");

      if (state === "additional") {
        // Store the auth code for additional account import
        localStorage.setItem("AdditionalUser", authCode);
        window.close();
        return;
      }

      // Store the original path for post-login redirect
      if (state && state !== "additional") {
        localStorage.setItem("originalPath", state);
      }

      // Check if we have an existing auth token
      const existingAuth = localStorage.getItem("Auth");
      if (existingAuth) {
        // If there's a state parameter, preserve it for redirect after reload
        if (state && state !== "additional") {
          localStorage.setItem("originalPath", state);
        }
        await reloadMainUser(existingAuth);
        return;
      }
      if (authCode) {
        await mainUserLogin(authCode);
      } else {
        redirectToEveSSO();
      }

      async function mainUserLogin(authCode) {
        try {
          const t = trace(performance, "MainUserLoginProcessFull");
          t.start();

          const userObject = await getEveOauthToken(authCode, true);
          if (!userObject) {
            throw new Error("Unable to Authenticate SSO Token");
          }

          const tokenResponse = await userObject.requestServerToken();
          if (tokenResponse instanceof Error) throw tokenResponse;

          // Use Firebase token from login response when available (single request); otherwise fetch separately
          const firebaseToken = tokenResponse.firebase_token
            ? tokenResponse.firebase_token
            : (await getFirebaseTokenViaApi(userObject.serverAccessToken))
                ?.access_token;
          if (!firebaseToken) {
            throw new Error("Unable to Authenticate Firebase Token");
          }
          const signInResult = await signInWithCustomToken(auth, firebaseToken);

          if (!signInResult || !signInResult.user) {
            throw new Error("Unable to Authenticate Firebase Token");
          }

          userObject.accountID = signInResult.user.uid;

          // Check if this is a first-time login (from combined response or Mongo)
          const isFirstTimeLogin =
            tokenResponse.firebase_first_login ??
            tokenResponse.first_login ??
            false;

          // Store the first-time login state
          setIsFirstTimeLogin(isFirstTimeLogin);

          await userObject.getPublicCharacterData();

          await buildCorporationObjectFromUserObject(userObject);

          updateUserArrayAction([userObject]);
          triggerCharacterDataPrefetch(queryClient, userObject.CharacterHash);

          emitUserDataUpdate({
            eveLoginComplete: true,
            userArray: [
              {
                CharacterID: userObject.CharacterID,
                CharacterName: userObject.CharacterName,
              },
            ],
          });

          userMaindDocListener();
          userJobSnapshotListener();
          userWatchlistListener();
          userGroupDataListener();

          clearUserJobSnapshotArray([]);
          clearJobArray([]);
          toggleIsLoggedIn();
          logEvent(analytics, "userSignIn", {
            UID: signInResult.user.uid,
            isFirstTimeLogin: isFirstTimeLogin,
          });
          t.stop();
        } catch (err) {
          console.error(err.message);
          redirectToEveSSO();
        }
      }
    }
    processOauthCallback();
  }, []);

  // Check if all events are complete before redirecting
  useEffect(() => {
    if (!hasNavigated.current && isLoginComplete()) {
      hasNavigated.current = true;
      emitLoginComplete();

      // Navigate back to auth route to trigger redirect logic
      // The originalPath cleanup will happen in the auth route after redirect is determined

      // Get the originalPath from localStorage to pass as state parameter
      const originalPath = localStorage.getItem("originalPath");
      if (originalPath) {
        navigate({ to: "/auth", search: { state: originalPath } });
      } else {
        navigate({ to: "/auth" });
      }
    }
  }, [isLoginComplete, navigate]);

  return <UserLogInUI />;
}
