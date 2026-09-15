import { Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import useUsersStore from "../../Zustand/usersStore";
import { appShellNestedCardSx } from "../../Context/appShell";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";

/**
 * The character an account signs in as.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.children] - shown under the description
 */
export function MainCharacterCard({ children }) {
  const main = useUsersStore((state) =>
    state.account.characters?.find((ch) => ch?.isMainCharacter),
  );
  const fallbackName = useUsersStore((state) =>
    state.account.actions.getMainCharacterName(),
  );
  const name = main?.CharacterName ?? fallbackName ?? "—";
  const characterId = main?.CharacterID;

  return (
    /* Outlined, because the shared card sx names a border colour and leaves the
       border itself to the surface. */
    <Paper
      variant="outlined"
      component={Stack}
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={[
        appShellNestedCardSx,
        {
          p: { xs: 2, sm: 2.5 },
          alignItems: { xs: "center", sm: "flex-start" },
        },
      ]}
    >
      <EveImageAvatar
        alt={`${name} portrait`}
        character={characterId ?? undefined}
        size={112}
        sx={{
          boxShadow: (theme) =>
            `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}`,
        }}
      />
      <Stack spacing={1} sx={{ textAlign: { xs: "center", sm: "left" } }}>
        <Typography variant="h6" component="p" sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your primary login character, and the account every job belongs to.
          Linking further characters brings their ESI data in here. Signing in
          as one of those characters instead opens a separate account, and a
          character can be linked to more than one.
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}
