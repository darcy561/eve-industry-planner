import { Box, Paper } from "@mui/material";

function MaintenanceMode() {
  return (
    <Box
      sx={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Paper
        square
        elevation={3}
        sx={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Maintenance Mode
      </Paper>
    </Box>
  );
}

export default MaintenanceMode;
