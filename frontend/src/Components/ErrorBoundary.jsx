import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { captureReactErrorOnce } from "../Functions/Helper/captureReactError";
import { getSentryUsersStoreContextHints } from "../Functions/Sentry/sentryErrorContextHints";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, componentStack, componentName }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 2,
        textAlign: "center",
        backgroundColor: "background.paper",
      }}
    >
      <Typography variant="h4" color="error" gutterBottom>
        Something went wrong
      </Typography>
      <Typography variant="body1" gutterBottom>
        We're sorry, but something unexpected happened in the{" "}
        {componentName || "application"}. Please try refreshing the page or
        contact support if the issue persists.
      </Typography>
      <Box sx={{ mt: 2, display: "flex", gap: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => window.location.reload()}
        >
          Refresh Page
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => (window.location.href = "/")}
        >
          Return Home
        </Button>
      </Box>
      {import.meta.env.ENVIRONMENT === "development" && (
        <Box sx={{ mt: 4, textAlign: "left", maxWidth: "800px", width: "100%" }}>
          <Typography variant="body2" gutterBottom sx={{ color: "text.secondary" }}>
            Error details:
          </Typography>
          <Box
            component="pre"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              p: 2,
              backgroundColor: "background.default",
              borderRadius: 1,
              overflow: "auto",
              maxHeight: "300px",
            }}
          >
            {error?.toString()}
            {componentStack}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ErrorBoundary({ children, componentName }) {
  const [componentStack, setComponentStack] = useState("");

  return (
    <ReactErrorBoundary
      onError={(error, info) => {
        const stack = info?.componentStack || "";
        setComponentStack(stack);
        captureReactErrorOnce(error, {
          level: "error",
          tags: { react_error_type: "error_boundary" },
          extra: {
            componentStack: stack,
            ...getSentryUsersStoreContextHints(),
          },
        });
      }}
      fallbackRender={({ error }) => (
        <ErrorFallback
          error={error}
          componentStack={componentStack}
          componentName={componentName}
        />
      )}
    >
      {children}
    </ReactErrorBoundary>
  );
}

export default ErrorBoundary;
