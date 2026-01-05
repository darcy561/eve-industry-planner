import { Avatar, IconButton, Paper, Typography, Grid } from "@mui/material";

import CloseIcon from "@mui/icons-material/Close";
import { getAnalytics, logEvent } from "firebase/analytics";
import { showSnackbarError } from "../../Events/snackbarEvents";
import checkUserClaims from "../../Functions/Auth/checkUserClaims";
import useUsersStore from "../../Zustand/usersStore";
import uploadApplicationSettingsToFirebase from "../../Functions/Firebase/uploadApplicationSettings";
import { useQueryClient } from "@tanstack/react-query";
import { useGlobalDebounce } from "../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../Context/debounceKeys";

export function AccountEntry({ user }) {
  const users = useUsersStore((state) => state.users.userArray);
  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.cloudAccounts
  );
  const { removeUser, removeAccountRefreshToken, removeCharacterFromCorporationObjects, findParentUser } = useUsersStore.getState().users.actions;
  const analytics = getAnalytics();
  const queryClient = useQueryClient();

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await uploadApplicationSettingsToFirebase();
    },
    2000
  );

  async function handleRemoveUser(user) {
    removeUser(user);
    removeAccountRefreshToken(user.CharacterHash);
    removeCharacterFromCorporationObjects(user.CharacterHash);

    queryClient.removeQueries({
      predicate: (query) => query.queryKey.includes(user.CharacterHash)
    })

    if (cloudAccounts) {
      debouncedSaveSettings();
    }
    await checkUserClaims(users);

    logEvent(analytics, "Remove Link Character", {
      UID: findParentUser().accountID,
      RemovedHash: user.CharacterHash,
      cloudAccount: cloudAccounts,
    });
    
    showSnackbarError(`${user.CharacterName} Removed`);
  }

  return (
    <Grid container sx={{ marginBottom: "10px" }} size={12}>
      <Paper elevation={3} square={true} sx={{ width: "100%" }}>
        <Grid
          container
          sx={{
            padding: "10px",
          }}
          direction="row"
          justifyContent="center"
          alignItems="center"
          size={12}>
          <Grid
            size={{
              xs: 2,
              sm: 1
            }}>
            <Avatar
              alt={`${user.CharacterName} portrait`}
              src={`https://images.evetech.net/characters/${user.CharacterID}/portrait`}
            />
          </Grid>
          <Grid
            size={{
              xs: 9,
              sm: 10
            }}>
            <Typography sx={{ typography: { xs: "caption", sm: "body1" } }}>
              {user.CharacterName}
            </Typography>
          </Grid>
          <Grid align="center" size={1}>
            <IconButton
              color="error"
              onClick={() => {
                handleRemoveUser(user);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Grid>
        </Grid>
      </Paper>
    </Grid>
  );
}
