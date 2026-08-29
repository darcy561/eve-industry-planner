import { CircularProgress, Typography, Grid } from "@mui/material";

export function LoadingDisplay_WatchlistDialogue({ loadingText }) {
  return (
    <Grid align="center" size={12}>
      <CircularProgress color="primary" />
      <Typography sx={{ marginTop: "20px" }}>{loadingText}</Typography>
    </Grid>
  );
}
