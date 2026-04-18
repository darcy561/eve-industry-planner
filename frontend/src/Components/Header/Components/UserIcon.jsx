import { Avatar, Box, Tooltip, Grid } from "@mui/material";

import useUsersStore from "../../../Zustand/usersStore";

export function UserIcon() {
  const mainCharacter = useUsersStore
    .getState()
    .account.actions.getMainCharacter();
  return (
    <Box>
      <Grid container sx={{ flexDirection: "column" }}>
        <Grid align="center">
          <Tooltip title={mainCharacter.CharacterName} arrow>
            <Avatar
              alt="Account Logo"
              src={`https://images.evetech.net/characters/${mainCharacter.CharacterID}/portrait`}
              sx={{
                height: { xs: "36px", sm: "48px" },
                width: { xs: "36px", sm: "48px" },
                marginRight: { sm: "20px" },
              }}
            />
          </Tooltip>
        </Grid>
      </Grid>
    </Box>
  );
}
