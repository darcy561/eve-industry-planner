import { useFirebase } from "./useFirebase";
import { auth } from "../firebase";
import { getAnalytics, logEvent } from "firebase/analytics";
import { signInWithCustomToken } from "firebase/auth";
import {
  fetchServerJWT,
  refreshServerJWTForLogin,
} from "../Functions/Auth/serverTokens.js";
import getCharacterFromRefreshToken from "../Components/Auth/RefreshToken";
import useUsersStore from "../Zustand/usersStore";
import redirectToEveSSO from "../Components/Auth/Functions/eveSSORedirect";
import { emitUserDataUpdate } from "../Events/loginEvents";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "./React Query/useCharacterHooks";
import { buildCorporationObjectFromUserObject } from "../Functions/Corporations/buildCorporationObject";
import { runPostLoginAccountSync } from "../Components/Auth/runPostLoginAccountSync";

/**
 * Custom hook that provides user refresh functionality for EVE Online industry planning.
 *
 * This hook handles user authentication refresh:
 * - Refreshing user data from EVE SSO refresh tokens
 * - Firebase authentication token generation
 * - Character data fetching and corporation building
 * - Firebase listener setup for real-time data
 * - User state management and login completion
 * - Error handling with SSO redirect fallback
 *
 * The refresh process:
 * 1. Clears existing job snapshot data
 * 2. Refreshes user data from EVE SSO refresh token
 * 3. Generates Firebase authentication token
 * 4. Fetches public character data
 * 5. Builds corporation object from user data
 * 6. Sets up Firebase listeners for real-time updates
 * 7. Updates user state and triggers login completion
 * 8. Handles errors by redirecting to EVE SSO
 *
 * @returns {Object} Object containing user refresh functions
 * @returns {Function} returns.reloadMainUser - Reloads main user data from refresh token
 *
 * @example
 * function UserRefresher() {
 *   const { reloadMainUser } = useRefreshUser();
 *
 *   const handleRefreshUser = async (refreshToken) => {
 *     try {
 *       await reloadMainUser(refreshToken);
 *       console.log("User refreshed successfully");
 *     } catch (error) {
 *       console.error("Failed to refresh user:", error);
 *     }
 *   };
 *
 *   return <button onClick={() => handleRefreshUser(token)}>Refresh User</button>;
 * }
 */
export function useRefreshUser() {
  const {
    userJobSnapshotListener,
    userWatchlistListener,
    userGroupDataListener,
  } = useFirebase();
  const queryClient = useQueryClient();
  const { triggerCharacterDataPrefetch, prefetchMultipleCharacters } =
    useCharacterHooks();
  const { updateCharacters: updateCharactersAction } =
    useUsersStore.getState().account.actions;
  const { clearUserJobSnapshotArray, clearJobArray } =
    useUsersStore.getState().jobData.actions;

  async function reloadMainUser(refreshToken) {
    try {
      const analytics = getAnalytics();

      clearUserJobSnapshotArray();

      const refreshedCharacter = await getCharacterFromRefreshToken(refreshToken, true);
      if (refreshedCharacter instanceof Error) {
        throw refreshedCharacter;
      }

      const existingServerRefreshToken = useUsersStore.getState().account.refreshToken;
      const tokenResponse = existingServerRefreshToken
        ? await refreshServerJWTForLogin(
            existingServerRefreshToken,
            refreshedCharacter.esiAccessToken
          )
        : await fetchServerJWT(refreshedCharacter.esiAccessToken);
      useUsersStore
        .getState()
        .account.actions.applyLoginAuthResponse(
          tokenResponse,
          refreshedCharacter.CharacterHash
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

      await refreshedCharacter.getPublicCharacterData();

      await buildCorporationObjectFromUserObject(refreshedCharacter);

      updateCharactersAction([refreshedCharacter]);
      triggerCharacterDataPrefetch(queryClient, refreshedCharacter.CharacterHash);
      emitUserDataUpdate({
        eveLoginComplete: true,
        userArray: [
          {
            CharacterID: refreshedCharacter.CharacterID,
            CharacterName: refreshedCharacter.CharacterName,
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

      clearJobArray();
      logEvent(analytics, "userSignIn", {
        UID: signInResult.user.uid,
        isFirstTimeLogin: useUsersStore.getState().account.isFirstTimeLogin,
      });
    } catch (err) {
      console.error("reloadMainUser failed:", err);
      redirectToEveSSO();
    }
  }

  return {
    reloadMainUser,
  };
}
