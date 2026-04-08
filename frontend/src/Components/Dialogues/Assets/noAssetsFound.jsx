import { Typography, Grid } from "@mui/material";


export default function NoAssetsFound_AssetsDialog(props) {
  const {
    state,
    characterAssetsLoading,
    corporationAssetsLoading,
    characterAssetsError,
    corporationAssetsError,
  } = props;

  const assetsQueryLoading = state.useCorporationAssets
    ? corporationAssetsLoading
    : characterAssetsLoading;

  const assetsQueryError = state.useCorporationAssets
    ? corporationAssetsError
    : characterAssetsError;

  if (assetsQueryLoading || state.isLoading || assetsQueryError) return null;

  if (!state.topLevelAssets || state.topLevelAssets.size > 0) return null;

  return (
    <Grid container align="center">
      <Typography>No Items Found</Typography>
    </Grid>
  );
}
