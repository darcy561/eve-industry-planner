import { Avatar, Box, Skeleton, Tooltip } from "@mui/material";

import { characterImageUrl } from "../../../Functions/Shared/eveImage";
import { useMainCharacter } from "../../Accounts/useMainCharacter";

const avatarSlotSx = {
  height: { xs: "36px", sm: "48px" },
  width: { xs: "36px", sm: "48px" },
  marginRight: { sm: "20px" },
};

export function UserIcon() {
  // Subscribed rather than read once, so the avatar updates when `setLoggedIn` is followed by
  // `updateCharacters` (see applyClientSessionAfterAppTokens).
  const { character: mainCharacter } = useMainCharacter();
  const showPortrait = mainCharacter && mainCharacter.isPlaceholder !== true;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      {showPortrait ? (
        <Tooltip title={mainCharacter.CharacterName} arrow>
          <Avatar
            alt="Account Logo"
            src={characterImageUrl(mainCharacter.CharacterID, 96)}
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
    </Box>
  );
}
