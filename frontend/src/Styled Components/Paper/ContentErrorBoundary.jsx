import { useState } from "react";
import { Box, Typography, Alert, Button } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { captureReactErrorOnce } from "../../Functions/Helper/captureReactError";
import { getSentryUsersStoreContextHints } from "../../Functions/Sentry/sentryErrorContextHints";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

/**
 * Functional error boundary that catches JavaScript errors in child components.
 * Displays a user-friendly error message with retry functionality and logs errors to Sentry in production.
 * Shows detailed error information in development mode.
 *
 * @example
 * <ContentErrorBoundary componentName="Job Planner">
 *   <JobPlannerComponent />
 * </ContentErrorBoundary>
 */
function ContentErrorFallback({ error, componentStack, onRetry }) {
  return (
    <Box
      sx={{
        p: 2,
        textAlign: "center",
      }}
    >
      <Alert
        severity="error"
        sx={{
          mb: 2,
          backgroundColor: "transparent",
          "& .MuiAlert-icon": {
            color: "error.main",
          },
        }}
      >
        <Typography variant="subtitle1" component="div" gutterBottom>
          Something went wrong loading this content
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          There was an error displaying this section. You can try refreshing the
          data.
        </Typography>
      </Alert>
      <Button
        variant="outlined"
        color="primary"
        startIcon={<RefreshIcon />}
        onClick={onRetry}
        sx={{ mb: 2 }}
      >
        Try Again
      </Button>
      {import.meta.env.ENVIRONMENT === "development" && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 1,
            fontFamily: "monospace",
            fontSize: "0.875rem",
            overflow: "auto",
            maxHeight: "200px",
            backgroundColor: "background.default",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            Error Details:
          </Typography>
          <pre style={{ margin: 0 }}>
            {error?.toString()}
            {componentStack}
          </pre>
        </Box>
      )}
    </Box>
  );
}

function ContentErrorBoundary({ children, componentName }) {
  const [componentStack, setComponentStack] = useState("");

  return (
    <ReactErrorBoundary
      onError={(error, info) => {
        const stack = info?.componentStack || "";
        setComponentStack(stack);
        captureReactErrorOnce(error, {
          level: "error",
          tags: { react_error_type: "content_error_boundary" },
          extra: {
            componentStack: stack,
            componentName: componentName || "Unknown Component",
            ...getSentryUsersStoreContextHints(),
          },
        });
      }}
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ContentErrorFallback
          error={error}
          componentStack={componentStack}
          onRetry={resetErrorBoundary}
        />
      )}
    >
      {children}
    </ReactErrorBoundary>
  );
}

export default ContentErrorBoundary;
