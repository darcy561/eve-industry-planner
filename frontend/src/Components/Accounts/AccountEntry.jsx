import { Avatar, IconButton, Paper, Stack, Typography, Grid } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import BusinessIcon from "@mui/icons-material/Business";
import { alpha } from "@mui/material/styles";
import { showSnackbarError } from "../../Events/snackbarEvents";
import checkUserClaims from "../../Functions/Auth/checkUserClaims";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleDebouncedUserAccountDocumentSave } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import { updateLocalRefreshTokens } from "../../Functions/Auth/buildAccountData.js";
import { deleteCloudStoredEsiRefreshTokens } from "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js";

export function AccountEntry({ character, appearance = "default" }) {
  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.userCloudAccounts
  );
  const getCorporation = useUsersStore((state) => state.account.actions.getCorporation);
  const { removeCharacter } = useUsersStore.getState().account.actions;
  const { removeCharacterFromCorporations } =
    useUsersStore.getState().account.actions;
  const queryClient = useQueryClient();

  async function handleRemoveUser(character) {
    const characterHash = character?.CharacterHash || "";
    const characterName = character?.CharacterName || "Character";
    removeCharacter(character);
    removeCharacterFromCorporations(characterHash);

    queryClient.removeQueries({
      predicate: (query) => query.queryKey.includes(characterHash),
    });

    if (cloudAccounts) {
      const saved = await deleteCloudStoredEsiRefreshTokens([characterHash]);
      if (!saved) {
        showSnackbarError("Failed to update linked character tokens on server");
      }
      scheduleDebouncedUserAccountDocumentSave();
    } else {
      updateLocalRefreshTokens(useUsersStore.getState().account.characters);
    }
    await checkUserClaims();

    showSnackbarError(`${characterName} Removed`);
  }

  const corporation =
    getCorporation(character?.corporation_id ?? character?.CorporationID) ?? null;
  const corporationName = corporation?.corporationName || "No corporation";
  const corporationId = corporation?.corporation_id;

  if (appearance === "firstLogin") {
    return (
      <Grid container size={12} sx={{ mb: 1.25, justifyContent: "center" }}>
        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            width: "100%",
            maxWidth: 760,
            borderRadius: 2,
            borderColor: (theme) => alpha(theme.palette.primary.main, 0.16),
            p: 1.25,
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Avatar
              alt={`${character.CharacterName} portrait`}
              src={`https://images.evetech.net/characters/${character.CharacterID}/portrait?size=128`}
              sx={{ width: 42, height: 42 }}
            />
            <Stack spacing={0.1} sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body1"
                sx={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {character.CharacterName}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
                {corporationId ? (
                  <Avatar
                    alt={`${corporationName} logo`}
                    src={`https://images.evetech.net/corporations/${corporationId}/logo?size=32`}
                    sx={{ width: 18, height: 18 }}
                    variant="rounded"
                  />
                ) : (
                  <BusinessIcon sx={{ fontSize: 17, color: "text.disabled" }} />
                )}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {corporationName}
                </Typography>
              </Stack>
            </Stack>
            <IconButton
              color="error"
              onClick={() => {
                handleRemoveUser(character);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        </Paper>
      </Grid>
    );
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
