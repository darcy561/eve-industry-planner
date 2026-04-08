import { CircularProgress, Alert, Grid } from "@mui/material";


export default function LoadingAssetDataAndError(props) {
  const {
    state,
    characterAssetsLoading,
    characterAssetsError,
    corporationAssetsLoading,
    corporationAssetsError,
  } = props;

  const assetsQueryLoading = state.useCorporationAssets
    ? corporationAssetsLoading
    : characterAssetsLoading;

  const assetsQueryError = state.useCorporationAssets
    ? corporationAssetsError
    : characterAssetsError;

  if (assetsQueryLoading) {
    return (
      <Grid align="center" size={12}>
        <CircularProgress color="primary" />
      </Grid>
    );
  }

  if (assetsQueryError) {
    return (
      <Grid align="center" size={12}>
        <Alert severity="error">Error loading assets</Alert>
      </Grid>
    );
  }

  if (state.isLoading) {
    return (
      <Grid align="center" size={12}>
        <CircularProgress color="primary" />
      </Grid>
    );
  }

  return null;
}
