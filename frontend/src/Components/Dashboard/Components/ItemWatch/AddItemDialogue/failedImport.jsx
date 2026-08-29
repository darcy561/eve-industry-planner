import { Typography, Grid } from "@mui/material";

export function FailedImport_WatchlistDialogue() {
  return (
    <Grid size={12}>
      <Typography color="error" sx={{ marginTop: "20px" }}>
        Error Importing Job Data
      </Typography>
    </Grid>
  );
}
