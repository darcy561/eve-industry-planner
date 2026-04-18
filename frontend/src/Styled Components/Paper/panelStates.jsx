import { Box, Alert, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";

/**
 * A fallback component that displays loading or error states for panels.
 * Shows a loading spinner with text when loading, or an error alert when there's an error.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.isLoading - Whether to show the loading state
 * @param {boolean} props.isError - Whether to show the error state
 * @param {Error} [props.error] - Error object containing error details to display
 * @param {string} [props.loadingMessage="Gathering ESI Data..."] - Caption under the loading spinner
 * @returns {JSX.Element} Panel fallback component
 *
 * @example
 * <PanelFallBack
 *   isLoading={true}
 *   isError={false}
 * />
 */
export default function PanelFallBack({
  isLoading,
  isError,
  error,
  loadingMessage = "Gathering ESI Data...",
}) {
  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 20,
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography variant="caption">{loadingMessage}</Typography>
        </Box>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ mb: 2 }}>
          Failed to load data: {error?.message || "Unknown error"}
        </Alert>
      </Box>
    );
  }
}
