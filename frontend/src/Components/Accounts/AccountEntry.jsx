import { Avatar, IconButton, Paper, Typography, Grid } from "@mui/material";

import CloseIcon from "@mui/icons-material/Close";
import { showSnackbarError } from "../../Events/snackbarEvents";
import checkUserClaims from "../../Functions/Auth/checkUserClaims";
import useUsersStore from "../../Zustand/usersStore";
import { saveUserAccountDocument } from "../../Functions/Endpoints/Pirivate/userDocument";
import { useQueryClient } from "@tanstack/react-query";
import { useGlobalDebounce } from "../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../Context/debounceKeys";

export function AccountEntry({ character }) {
  const characters = useUsersStore((state) => state.account.characters);
  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.userCloudAccounts
  );
  const { removeCharacter } = useUsersStore.getState().account.actions;
  const { removeCharacterFromCorporations } =
    useUsersStore.getState().account.actions;
  const { removeLinkedCharacterRefreshToken } =
    useUsersStore.getState().account.actions;
  const queryClient = useQueryClient();

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await saveUserAccountDocument();
    },
    2000
  );

  async function handleRemoveUser(character) {
    removeCharacter(character);
    removeLinkedCharacterRefreshToken(character.CharacterHash);
    removeCharacterFromCorporations(character.CharacterHash);

    queryClient.removeQueries({
      predicate: (query) => query.queryKey.includes(character.CharacterHash)
    })

    if (cloudAccounts) {
      debouncedSaveSettings();
    }
    await checkUserClaims(characters);

    showSnackbarError(`${character.CharacterName} Removed`);
  }

  return (
    <Grid container sx={{ marginBottom: "10px" }} size={12}>
      <Paper elevation={3} square={true} sx={{ width: "100%" }}>
        <Grid
          container
          direction="row"
          size={12}
          sx={{
            justifyContent: "center",
            alignItems: "center",
            padding: "10px"
          }}>
          <Grid
            size={{
              xs: 2,
              sm: 1
            }}>
            <Avatar
              alt={`${character.CharacterName} portrait`}
              src={`https://images.evetech.net/characters/${character.CharacterID}/portrait`}
            />
          </Grid>
          <Grid
            size={{
              xs: 9,
              sm: 10
            }}>
            <Typography sx={{ typography: { xs: "caption", sm: "body1" } }}>
              {character.CharacterName}
            </Typography>
          </Grid>
          <Grid align="center" size={1}>
            <IconButton
              color="error"
              onClick={() => {
                handleRemoveUser(character);
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
