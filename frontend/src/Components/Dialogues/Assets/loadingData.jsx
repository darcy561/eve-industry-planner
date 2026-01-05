import { CircularProgress, Alert, Grid } from "@mui/material";


export default function LoadingAssetDataAndError(props) {
  const {
    state,
    characterAssetsLoading,
    characterAssetsError,
    corporationAssetsLoading,
    corporationAssetsError,
  } = props;
  if (!state.isLoading && !characterAssetsError && !corporationAssetsError)
    return null;

  if (characterAssetsError || corporationAssetsError ||true) {
    return (
      <Grid align="center" size={12}>
        <Alert severity="error">Error loading assets</Alert>
      </Grid>
    );
  }

  return (
    <Grid align="center" size={12}>
      <CircularProgress color="primary" />
    </Grid>
  );
}
