import { useFirebase } from "./useFirebase";
import { trace } from "firebase/performance";
import { performance } from "../firebase";
import { getAnalytics, logEvent } from "firebase/analytics";
import getFirebaseAuthToken from "../Functions/Firebase/getFirebaseToken";
import getUserFromRefreshToken from "../Components/Auth/RefreshToken";
import useUsersStore from "../Zustand/usersStore";
import redirectToEveSSO from "../Components/Auth/Functions/eveSSORedirect";
import { emitUserDataUpdate } from "../Events/loginEvents";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "./React Query/useCharacterHooks";
import { buildCorporationObjectFromUserObject } from "../Functions/Corporations/buildCorporationObject";

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
 * - Performance tracing for refresh operations
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
    userMaindDocListener,
    userGroupDataListener,
  } = useFirebase();
  const queryClient = useQueryClient();
  const { triggerCharacterDataPrefetch } = useCharacterHooks();
  const {
    toggleIsLoggedIn,
    updateUserArray: updateUserArrayAction,
  } = useUsersStore.getState().users.actions;
  const { clearUserJobSnapshotArray, clearJobArray } = useUsersStore.getState().jobData.actions;

  async function reloadMainUser(refreshToken) {
    try {
      const analytics = getAnalytics();
      const t = trace(performance, "MainUserRefreshProcessFull");
      t.start();

      clearUserJobSnapshotArray();

      const refreshedUser = await getUserFromRefreshToken(refreshToken, true);
      if (refreshedUser instanceof Error) {
        throw refreshedUser;
      }

      const tokenError = await refreshedUser.requestServerToken();
      if (tokenError instanceof Error) throw tokenError;

      const fbToken = await getFirebaseAuthToken(refreshedUser);
      if (!fbToken || !fbToken.user) {
        throw new Error("Unable to Authenticate Firebase Token");
      }
      refreshedUser.accountID = fbToken.user.uid;

      await refreshedUser.getPublicCharacterData();

      await buildCorporationObjectFromUserObject(refreshedUser)

      updateUserArrayAction([refreshedUser]);
      triggerCharacterDataPrefetch(queryClient, refreshedUser.CharacterHash);
      emitUserDataUpdate({
        eveLoginComplete: true,
        userArray: [
          {
            CharacterID: refreshedUser.CharacterID,
            CharacterName: refreshedUser.CharacterName,
          },
        ],
      });

      userMaindDocListener();
      userJobSnapshotListener();
      userWatchlistListener();
      userGroupDataListener();

      clearJobArray();
      toggleIsLoggedIn();
      logEvent(analytics, "userSignIn", {
        UID: fbToken.user.uid,
      });
      t.stop();
    } catch (err) {
      console.error(err);
      redirectToEveSSO();
    }
  }

  return {
    reloadMainUser,
  };
}
