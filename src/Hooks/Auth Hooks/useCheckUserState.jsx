import { useContext, useEffect } from "react";
import { IsLoggedInContext, UsersContext } from "../../Context/AuthContext";
import {
  PageLoadContext,
  UserLoginUIContext,
} from "../../Context/LayoutContext";
import { useRefreshUser } from "../useRefreshUser";
import { auth } from "../../firebase";

function useCheckUserAuthState() {
  const { users, updateUsers } = useContext(UsersContext);
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { updatePageLoad } = useContext(PageLoadContext);
  const {
    updateLoginInProgressComplete,
    updateUserDataFetch,
    updateUserJobSnapshotDataFetch,
    updateUserWatchlistDataFetch,
    updateUserGroupsDataFetch,
  } = useContext(UserLoginUIContext);
  const { reloadMainUser } = useRefreshUser();

  useEffect(() => {
    authState();
  }, []);

  async function authState() {
    if (isLoggedIn) {
      for (let user of users) {
        try {
          await user.refreshAccessToken();
        } catch (err) {
          console.error("Unable to refresh user");
        }
      }
      updateUsers((prev) => [...prev]);
      updatePageLoad(false);
    } else {
      if (!localStorage.getItem("Auth")) {
        updatePageLoad(false);
        updateLoginInProgressComplete(true);
        updateUserDataFetch(true);
        updateUserJobSnapshotDataFetch(true);
        updateUserWatchlistDataFetch(true);
        updateUserGroupsDataFetch(true);
        await auth.signOut();
      } else {
        reloadMainUser(localStorage.getItem("Auth"));
      }
    }
  }
}

export default useCheckUserAuthState;
