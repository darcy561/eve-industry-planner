import { useContext } from "react";
import { useFirebase } from "./useFirebase";
import { JobArrayContext } from "../Context/JobContext";
import {
  IsLoggedInContext,
  UserJobSnapshotContext,
} from "../Context/AuthContext";
import {
  DialogDataContext,
  PageLoadContext,
  UserLoginUIContext,
} from "../Context/LayoutContext";
import { trace } from "firebase/performance";
import { performance } from "../firebase";
import { getAnalytics, logEvent } from "firebase/analytics";
import useCheckGlobalAppVersion from "./GeneralHooks/useCheckGlobalAppVersion";
import buildNewUserData from "../Functions/Firebase/buildNewUserAccount";
import getFirebaseAuthToken from "../Functions/Firebase/getFirebaseToken";
import getUserFromRefreshToken from "../Components/Auth/RefreshToken";

export function useRefreshUser() {
  const {
    userJobSnapshotListener,
    userWatchlistListener,
    userMaindDocListener,
    userGroupDataListener,
  } = useFirebase();
  const { updateJobArray } = useContext(JobArrayContext);
  const { updateIsLoggedIn } = useContext(IsLoggedInContext);
  const { updatePageLoad } = useContext(PageLoadContext);
  const { updateUserJobSnapshot } = useContext(UserJobSnapshotContext);
  const { updateDialogData } = useContext(DialogDataContext);
  const { updateUserUIData, updateLoginInProgressComplete } =
    useContext(UserLoginUIContext);

  async function reloadMainUser(refreshToken) {
    const analytics = getAnalytics();
    const t = trace(performance, "MainUserRefreshProcessFull");
    t.start();
    updateLoginInProgressComplete(false);

    if (!useCheckGlobalAppVersion) {
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

    updateUserJobSnapshot([]);

    const refreshedUser = await getUserFromRefreshToken(refreshToken, true);
    const fbToken = await getFirebaseAuthToken(refreshedUser);
    await refreshedUser.getPublicCharacterData();
    updateUserUIData((prev) => ({
      ...prev,
      eveLoginComplete: true,
      userArray: [
        {
          CharacterID: refreshedUser.CharacterID,
          CharacterName: refreshedUser.CharacterName,
        },
      ],
    }));

    await buildNewUserData(fbToken);

    userMaindDocListener(fbToken, refreshedUser);
    userJobSnapshotListener(refreshedUser);
    userWatchlistListener(fbToken, refreshedUser);
    userGroupDataListener(refreshedUser);

    updateJobArray([]);
    updateIsLoggedIn(true);
    updatePageLoad(false);
    logEvent(analytics, "userSignIn", {
      UID: fbToken.user.uid,
    });
    t.stop();
  }

  return {
    reloadMainUser,
  };
}
