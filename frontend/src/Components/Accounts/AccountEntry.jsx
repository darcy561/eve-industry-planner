import { IconButton, Paper, Stack, Typography, Grid } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import BusinessIcon from "@mui/icons-material/Business";
import { alpha } from "@mui/material/styles";
import { showSnackbarError } from "../../Events/snackbarEvents";
import refreshAccountSessionGrants from "../../Functions/Auth/refreshAccountSessionGrants.js";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleDebouncedUserAccountDocumentSave } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import { updateLocalRefreshTokens } from "../../Functions/Auth/buildAccountData.js";
import { deleteCloudStoredEsiRefreshTokens } from "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";

export function AccountEntry({ character }) {
  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.userCloudAccounts,
  );
  const getCorporation = useUsersStore(
    (state) => state.account.actions.getCorporation,
  );
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
    await refreshAccountSessionGrants();

    showSnackbarError(`${characterName} Removed`);
  }

  const corporation =
    getCorporation(character?.corporation_id ?? character?.CorporationID) ??
    null;
  const corporationName = corporation?.corporationName || "No corporation";
  const corporationId = corporation?.corporation_id;

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
          <EveImageAvatar
            alt={`${character.CharacterName} portrait`}
            character={character.CharacterID}
            size={42}
          />
          <Stack spacing={0.1} sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {character.CharacterName}
            </Typography>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ minWidth: 0, alignItems: "center" }}
            >
              {corporationId ? (
                <EveImageAvatar
                  alt={`${corporationName} logo`}
                  corporation={corporationId}
                  size={18}
                  variant="rounded"
                />
              ) : (
                <BusinessIcon sx={{ fontSize: 17, color: "text.disabled" }} />
              )}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {corporationName}
              </Typography>
            </Stack>
          </Stack>
          <IconButton
            color="error"
            aria-label={`Remove ${character.CharacterName}`}
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
