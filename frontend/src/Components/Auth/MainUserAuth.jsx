import { useEffect, useRef } from "react";
import { useFirebase } from "../../Hooks/useFirebase";
import { auth } from "../../firebase";
import { getAnalytics, logEvent } from "firebase/analytics";
import { signInWithCustomToken } from "firebase/auth";
import { UserLogInUI } from "./LoginUI/LoginUI";
import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";
import { fetchServerJWT } from "../../Functions/Auth/serverTokens.js";
import useUsersStore from "../../Zustand/usersStore";
import redirectToEveSSO from "./Functions/eveSSORedirect";
import { useNavigate } from "@tanstack/react-router";
import { useRefreshUser } from "../../Hooks/useRefreshUser";
import { useLoginState } from "../../Hooks/useLoginState";
import {
  emitLoginComplete,
  emitUserDataUpdate,
  LOGIN_STEPS,
} from "../../Events/loginEvents";
import { getRedirectPathAfterAuth } from "../../utils/routeUtils";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "../../Hooks/React Query/useCharacterHooks";
import { buildCorporationObjectFromUserObject } from "../../Functions/Corporations/buildCorporationObject";
import { runPostLoginAccountSync } from "./runPostLoginAccountSync";

export default function AuthMainUser() {
  const {
    userJobSnapshotListener,
    userWatchlistListener,
    userGroupDataListener,
  } = useFirebase();
  const { updateCharacters: updateCharactersAction } =
    useUsersStore.getState().account.actions;
  const { clearJobArray, clearUserJobSnapshotArray } =
    useUsersStore.getState().jobData.actions;
  const { reloadMainUser } = useRefreshUser();
  const { completedSteps } = useLoginState();
  const queryClient = useQueryClient();
  const { triggerCharacterDataPrefetch, prefetchMultipleCharacters } =
    useCharacterHooks();
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

          const userObject = await getEveOauthToken(authCode, true);
          if (!userObject) {
            throw new Error("Unable to Authenticate SSO Token");
          }

          const tokenResponse = await fetchServerJWT(userObject.esiAccessToken);
          useUsersStore
            .getState()
            .account.actions.applyLoginAuthResponse(
              tokenResponse,
              userObject.CharacterHash
            );

          const firebaseToken = tokenResponse.firebase_token;
          if (!firebaseToken) {
            throw new Error(
              "Login response missing firebase_token (server must include it from /api/v1/auth/login)"
            );
          }
          const signInResult = await signInWithCustomToken(auth, firebaseToken);

          if (!signInResult || !signInResult.user) {
            throw new Error("Unable to Authenticate Firebase Token");
          }

          useUsersStore.getState().account.actions.setLoggedIn(true);

          await userObject.getPublicCharacterData();

          await buildCorporationObjectFromUserObject(userObject);

          updateCharactersAction([userObject]);
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

          await runPostLoginAccountSync({
            queryClient,
            prefetchMultipleCharacters,
            userDocument: tokenResponse.user_document,
          });

          userJobSnapshotListener();
          userWatchlistListener();
          userGroupDataListener();

          clearUserJobSnapshotArray([]);
          clearJobArray([]);
          logEvent(analytics, "userSignIn", {
            UID: signInResult.user.uid,
            isFirstTimeLogin: useUsersStore.getState().account.isFirstTimeLogin,
          });
        } catch (err) {
          console.error(err.message);
          redirectToEveSSO();
        }
      }
    }
    processOauthCallback();
  }, []);

  // When all login steps complete, navigate to the post-auth destination.
  // Do not navigate to `/auth` here: we are already on `/auth`, so that is often a no-op and
  // `beforeLoad` on `/auth` never re-runs (it is what redirects logged-in users away).
  useEffect(() => {
    const allStepsDone = Object.values(LOGIN_STEPS).every((step) =>
      completedSteps.has(step)
    );
    if (!hasNavigated.current && allStepsDone) {
      hasNavigated.current = true;
      emitLoginComplete();

      const originalPath = localStorage.getItem("originalPath");
      if (originalPath) {
        localStorage.removeItem("originalPath");
      }
      const redirectPath = getRedirectPathAfterAuth(originalPath, "/dashboard");
      navigate({ to: redirectPath });
    }
  }, [completedSteps, navigate]);

  return <UserLogInUI />;
}
