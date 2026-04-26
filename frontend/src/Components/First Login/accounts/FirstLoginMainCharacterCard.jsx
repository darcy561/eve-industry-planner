import { Avatar, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import useUsersStore from "../../../Zustand/usersStore";

const cardSx = {
  p: { xs: 2, sm: 2.5 },
  borderRadius: 2,
  border: "1px solid",
  borderColor: (theme) => alpha(theme.palette.primary.main, 0.14),
  bgcolor: (theme) =>
    alpha(
      theme.palette.background.paper,
      theme.palette.mode === "dark" ? 0.5 : 0.88,
    ),
};

/**
 * First-login summary of the SSO main character (no account ID).
 */
export function FirstLoginMainCharacterCard() {
  const main = useUsersStore((state) =>
    state.account.characters?.find((ch) => ch?.isMainCharacter),
  );
  const name =
    main?.CharacterName ??
    useUsersStore.getState().account.actions.getMainCharacterName() ??
    "—";
  const characterId = main?.CharacterID;

  return (
    <Paper variant="outlined" sx={cardSx}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "center", sm: "flex-start" } }}
      >
        <Avatar
          alt={name ? `${name} portrait` : "Main character portrait"}
          src={
            characterId != null
              ? `https://images.evetech.net/characters/${characterId}/portrait?size=256`
              : undefined
          }
          sx={{
            width: 112,
            height: 112,
            boxShadow: (theme) =>
              `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}`,
          }}
        />
        <Stack spacing={1} sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <Typography variant="subtitle2" color="primary">
            Main character
          </Typography>
          <Typography variant="h6" component="p" sx={{ fontWeight: 600 }}>
            {name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This is your primary login character. This is the account that all
            job data will be associated with. Linking additional characters will
            give you access to their ESI data from within this account. If you
            login to the application with one of these accounts it will treated
            as a separate account. Characters can be linked to multiple
            accounts.
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}
