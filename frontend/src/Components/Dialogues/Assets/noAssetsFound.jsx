import { Typography, Grid } from "@mui/material";


export default function NoAssetsFound_AssetsDialog({ state }) {
  if (!state.topLevelAssets || state.topLevelAssets.size > 0) return null;

  return (
    <Grid container align="center">
      <Typography>No Items Found</Typography>
    </Grid>
  );
}
