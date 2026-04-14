import { Typography, Grid } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import { LARGE_TEXT_FORMAT } from "../../Context/defaultValues";

export function AccountInfo() {
  return (
    <ContentPanel
      title="Main Account"
      componentName="Account Info"
      paperSx={{ overflow: "hidden" }}
    >
      <Grid container size={12}>
        <Grid size={3}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Character Name:
          </Typography>
        </Grid>
        <Grid align="right" size={9}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            {useUsersStore.getState().account.actions.getMainCharacterName()}
          </Typography>
        </Grid>
        <Grid size={3}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Account ID:
          </Typography>
        </Grid>
        <Grid align="right" size={9}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            {useUsersStore.getState().account.actions.getAccountID()}
          </Typography>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
