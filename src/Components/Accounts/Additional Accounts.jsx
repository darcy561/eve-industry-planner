import {
  Button,
  FormControlLabel,
  FormGroup,
  Grid,
  Paper,
  Skeleton,
  Switch,
  Typography,
} from "@mui/material";
import { useContext, useState } from "react";
import { UsersContext } from "../../Context/AuthContext";
import { ApiJobsContext } from "../../Context/JobContext";
import { useFirebase } from "../../Hooks/useFirebase";
import { AccountEntry } from "./AccountEntry";
import { getAnalytics, logEvent } from "firebase/analytics";
import { useAccountManagement } from "../../Hooks/useAccountManagement";
import { useCorporationObject } from "../../Hooks/Account Management Hooks/Corporation Objects/useCorporationObject";
import { useHelperFunction } from "../../Hooks/GeneralHooks/useHelperFunctions";
import { ApplicationSettingsContext } from "../../Context/LayoutContext";
import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";

export function AdditionalAccounts({ parentUserIndex }) {
  const { users, updateUsers } = useContext(UsersContext);
  const { apiJobs, updateApiJobs } = useContext(ApiJobsContext);
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );
  const { updateMainUserDoc } = useFirebase();
  const { checkUserClaims, updateApiArray, updateUserEsiData } =
    useAccountManagement();
  const [skeletonVisible, toggleSkeleton] = useState(false);
  const { sendSnackbarNotificationSuccess, sendSnackbarNotificationError } =
    useHelperFunction();
  const { updateCorporationObject } = useCorporationObject();
  const analytics = getAnalytics();

  const handleAdd = async () => {
    toggleSkeleton(true);
    window.open(
      `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(
        import.meta.env.VITE_eveCallbackURL
      )}&client_id=${import.meta.env.VITE_eveClientID}&scope=${
        import.meta.env.VITE_eveScope
      }&state=additional`,
      "_blank"
    );
    window.addEventListener("storage", importNewAccount);
    setTimeout(() => {
      if (!localStorage.getItem("AdditionalUser")) {
        window.removeEventListener("storage", importNewAccount);
        toggleSkeleton(false);
      }
    }, 180000);
    // 3 mins
  };

  const importNewAccount = async () => {
    try {
      if (!localStorage.getItem("AdditionalUser")) return;

      const authCode = localStorage.getItem("AdditionalUser");
      const newUser = await getEveOauthToken(authCode, false);

      if (newUser instanceof Error) {
        throw newUser;
      }

      if (users.some((u) => u.CharacterHash === newUser.CharacterHash)) {
        localStorage.removeItem("AdditionalUser");
        sendSnackbarNotificationError(`Duplicate Account`, 3);
        toggleSkeleton(false);
        return;
      }

      let newUserArray = [...users];
      let esiObjectsArray = [];
      let newApiArray = [...apiJobs];
      await newUser.getPublicCharacterData();
      esiObjectsArray.push(await newUser.getCharacterESIData());
      localStorage.removeItem("AdditionalUser");
      newUserArray.push(newUser);
      await checkUserClaims(newUserArray);
      if (applicationSettings.cloudAccounts) {
        newUserArray[parentUserIndex].accountRefreshTokens.push({
          CharacterHash: newUser.CharacterHash,
          rToken: newUser.rToken,
        });
      } else {
        let accountArray = JSON.parse(
          localStorage.getItem(
            `${newUserArray[parentUserIndex].CharacterHash} AdditionalAccounts`
          )
        );
        if (accountArray === null) {
          accountArray = [];
          accountArray.push({
            CharacterHash: newUser.CharacterHash,
            rToken: newUser.rToken,
          });
          localStorage.setItem(
            `${newUserArray[parentUserIndex].CharacterHash} AdditionalAccounts`,
            JSON.stringify(accountArray)
          );
        } else {
          accountArray.push({
            CharacterHash: newUser.CharacterHash,
            rToken: newUser.rToken,
          });
          localStorage.setItem(
            `${newUserArray[parentUserIndex].CharacterHash} AdditionalAccounts`,
            JSON.stringify(accountArray)
          );
        }
      }
      updateUserEsiData(esiObjectsArray);
      updateCorporationObject(esiObjectsArray);
      newApiArray = updateApiArray(newApiArray, newUserArray, esiObjectsArray);
      updateUsers(newUserArray);
      updateApiJobs(newApiArray);
      if (applicationSettings.cloudAccounts) {
        updateMainUserDoc();
      }
      logEvent(analytics, "Link Character", {
        UID: newUserArray[parentUserIndex].accountID,
        newHash: newUser.CharacterHash,
        cloudAccount: applicationSettings.cloudAccounts,
      });
      sendSnackbarNotificationSuccess(`${newUser.CharacterName} Imported`, 3);
      toggleSkeleton(false);
    } catch (err) {
      localStorage.removeItem("AdditionalUser");
      sendSnackbarNotificationError(`${err.message}`, 3);
      toggleSkeleton(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ padding: "20px" }} square={true}>
      <Grid container>
        <Grid item xs={12}>
          <Typography variant="h6" align="center" color="primary">
            Additional Accounts
          </Typography>
        </Grid>
        <Grid item xs={12} sx={{ marginTop: "10px", marginBottom: "20px" }}>
          <Typography sx={{ typography: { xs: "caption", sm: "body1" } }}>
            Additional accounts can be linked allowing you to import the ESI
            data in alongside your main accounts data. Additional accounts can
            be added and removed at any time.{<br />}
            {<br />}
            By default the additional accounts that you choose to link are only
            stored in the browser where they were added. If you wanted to make
            these accounts available on all other devices then you will need to
            enable to option to store the accounts in the cloud.
          </Typography>
        </Grid>
        <Grid container item xs={12}>
          <Grid item xs={0} sm={3} md={7} />
          <Grid item xs={6} sm={5} md={3}>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={applicationSettings.cloudAccounts}
                    color="primary"
                    onChange={(e) => {
                      const newAppliacationSettings =
                        applicationSettings.toggleCloudAccounts();
                      const newUsersArray = [...users];

                      const parentUser = newUsersArray.find(
                        (i) => i.ParentUser
                      );

                      parentUser.toggleCloudAccounts(e.target.checked);

                      updateUsers(newUsersArray);
                      updateApplicationSettings(newAppliacationSettings);

                      updateMainUserDoc(newAppliacationSettings);
                    }}
                  />
                }
                label={
                  <Typography
                    sx={{ typography: { xs: "caption", sm: "body2" } }}
                  >
                    Store Accounts In Cloud
                  </Typography>
                }
                labelPlacement="start"
              />
            </FormGroup>
          </Grid>
          <Grid
            container
            item
            xs={6}
            sm={4}
            md={2}
            justifyContent="center"
            alignItems="center"
          >
            <Button
              variant="contained"
              size="small"
              disabled={skeletonVisible}
              onClick={handleAdd}
            >
              Add Account
            </Button>
          </Grid>
        </Grid>
        <Grid container item xs={12} sx={{ marginTop: "20px" }}>
          {users.map((user) => {
            if (user.ParentUser) return null;
            return (
              <AccountEntry
                key={user.CharacterHash}
                user={user}
                parentUserIndex={parentUserIndex}
              />
            );
          })}
          {skeletonVisible && (
            <Grid
              container
              item
              xs={12}
              align="center"
              alignItems="center"
              sx={{ marginTop: "10px", marginLeft: "10px" }}
            >
              <Grid item xs={2} sm={1} align="left">
                <Skeleton variant="circular" width={40} height={40} />
              </Grid>
              <Grid item xs={8} sm={9}>
                <Skeleton variant="text" />
              </Grid>
              <Grid item xs={1}>
                <Skeleton
                  variant="circular"
                  width={30}
                  height={30}
                  align="center"
                />
              </Grid>
              <Grid item xs={1}>
                <Skeleton
                  variant="circular"
                  width={30}
                  height={30}
                  align="center"
                />
              </Grid>
            </Grid>
          )}
        </Grid>
      </Grid>
    </Paper>
  );
}
