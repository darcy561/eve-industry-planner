import { CircularProgress, Typography, Grid } from "@mui/material";

export function AssetsPage_Loading() {
  return (
    <Grid align="center">
      <CircularProgress color={"primary"} />
      <Typography>Gathering Location Data...</Typography>
    </Grid>
  );
}
