import { Avatar, Box, Grid, Skeleton, Tooltip } from "@mui/material";

import useUsersStore from "../../../Zustand/usersStore";

const avatarSlotSx = {
  height: { xs: "36px", sm: "48px" },
  width: { xs: "36px", sm: "48px" },
  marginRight: { sm: "20px" },
};

export function UserIcon() {
  // Subscribe to the main character row so the avatar updates when
  // `setLoggedIn` is followed by `updateCharacters` (see applyClientSessionAfterAppTokens).
  const mainCharacter = useUsersStore((state) =>
    state.account.characters?.find((ch) => ch?.isMainCharacter),
  );
  const showPortrait =
    mainCharacter && mainCharacter.isPlaceholder !== true;

  return (
    <Box>
      <Grid container sx={{ flexDirection: "column" }}>
        <Grid align="center">
          {showPortrait ? (
            <Tooltip title={mainCharacter.CharacterName} arrow>
              <Avatar
                alt="Account Logo"
                src={`https://images.evetech.net/characters/${mainCharacter.CharacterID}/portrait`}
                sx={avatarSlotSx}
              />
            </Tooltip>
          ) : (
            <Skeleton
              variant="circular"
              animation="wave"
              aria-busy
              aria-label="Loading main character"
              sx={avatarSlotSx}
            />
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
