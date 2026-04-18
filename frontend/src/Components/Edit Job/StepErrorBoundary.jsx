import { useState } from "react";
import { Box, Typography, Alert } from "@mui/material";
import { captureReactErrorOnce } from "../../Functions/Helper/captureReactError";
import {
  getSentryEditJobStateHints,
  getSentryUsersStoreContextHints,
} from "../../Functions/Sentry/sentryErrorContextHints";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

function StepErrorFallback({ error, componentStack, currentStep }) {
  return (
    <Box
      sx={{
        p: 2,
        my: 2,
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
          Error at the {currentStep} stage
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          There was an error loading this stage. You can still navigate between
          stages.
        </Typography>
      </Alert>
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

function StepErrorBoundary({ children, currentStep, state }) {
  const [componentStack, setComponentStack] = useState("");

  return (
    <ReactErrorBoundary
      onError={(error, info) => {
        const stack = info?.componentStack || "";
        setComponentStack(stack);
        captureReactErrorOnce(error, {
          level: "error",
          tags: { react_error_type: "step_error_boundary" },
          extra: {
            componentStack: stack,
            currentStep,
            ...getSentryEditJobStateHints(state),
            ...getSentryUsersStoreContextHints(),
          },
        });
      }}
      fallbackRender={({ error }) => (
        <StepErrorFallback
          error={error}
          componentStack={componentStack}
          currentStep={currentStep}
        />
      )}
    >
      {children}
    </ReactErrorBoundary>
  );
}

export default StepErrorBoundary;