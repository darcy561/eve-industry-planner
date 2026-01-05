import { Box, Alert, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

export default function PanelFallBack({ isLoading, isError, error }) {
  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
        width="100%"
        height="100%"
      >
        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
          <CircularProgress />
          <Typography variant="caption">Gathering ESI Data...</Typography>
        </Box>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box width="100%" height="100%">
        <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ mb: 2 }}>
          Failed to load data: {error?.message || "Unknown error"}
        </Alert>
      </Box>
    );
  }
}
