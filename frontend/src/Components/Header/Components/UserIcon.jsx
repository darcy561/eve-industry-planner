import { Avatar, Box, Tooltip, Grid } from "@mui/material";

import useUsersStore from "../../../Zustand/usersStore";

export function UserIcon() {
  const parentUser = useUsersStore.getState().users.actions.findParentUser();

  return (
    <Box>
      <Grid container direction="column">
        <Grid align="center">
          <Tooltip title={parentUser.CharacterName} arrow>
            <Avatar
              alt="Account Logo"
              src={`https://images.evetech.net/characters/${parentUser.CharacterID}/portrait`}
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
