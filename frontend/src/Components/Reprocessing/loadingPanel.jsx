import { Box, CircularProgress, Typography } from "@mui/material";

function DisplayLoadingPanel() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        flexGrow: 1,
        width: "100%",
        height: "100%",
      }}
    >
      <CircularProgress />
      <Typography variant="body1" sx={{ marginTop: 2 }}>
        Gathering market data...
      </Typography>
    </Box>
  );
}

export default DisplayLoadingPanel;
