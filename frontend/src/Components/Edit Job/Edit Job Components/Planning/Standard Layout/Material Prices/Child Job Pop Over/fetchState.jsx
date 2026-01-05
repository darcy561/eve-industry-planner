import { CircularProgress, Typography, Grid } from "@mui/material";


export function ImportingStateLayout_ChildJobPopoverFrame({
  fetchError,
  material,
}) {
  return (
    <Grid container>
      <Grid sx={{ marginBottom: "30px" }} size={12}>
        <Typography variant="body2" align="center">
          {material.name}
        </Typography>
      </Grid>
      {fetchError ? (
        <Grid sx={{ marginBottom: "20px" }} align="center" size={12}>
          <Typography variant="body2" align="center" color="error">
            Error Importing Job Data
          </Typography>
        </Grid>
      ) : (
        <Grid sx={{ marginBottom: "20px" }} align="center" size={12}>
          <CircularProgress color="primary" />
        </Grid>
      )}
    </Grid>
  );
}
