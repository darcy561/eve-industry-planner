import { CircularProgress, Typography, Alert, Grid } from "@mui/material";

import { LARGE_TEXT_FORMAT } from "../../../Context/defaultValues";

export function LoadingDataDisplay_ShoppingListDialog({ state, allCharacterAssetsError, corporationAssetsError }) {
  if (!state.isLoading && !allCharacterAssetsError && !corporationAssetsError) return null;

  // Show error if there are any asset errors
  if (allCharacterAssetsError || corporationAssetsError) {
    return (
      <Grid container>
        <Grid align="center" sx={{ marginTop: "20px" }} size={12}>
          <Alert severity="error" sx={{ maxWidth: "500px" }}>
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              Error loading assets
            </Typography>
            {allCharacterAssetsError && (
              <Typography sx={{ marginTop: "10px" }}>
                Character Assets: {allCharacterAssetsError.message || "Failed to load character assets"}
              </Typography>
            )}
            {corporationAssetsError && (
              <Typography sx={{ marginTop: "10px" }}>
                Corporation Assets: {corporationAssetsError.message || "Failed to load corporation assets"}
              </Typography>
            )}
          </Alert>
        </Grid>
      </Grid>
    );
  }

  // Show loading spinner
  return (
    <Grid container>
      <Grid align="center" size={12}>
        <CircularProgress color="primary" />
      </Grid>
    </Grid>
  );
}
