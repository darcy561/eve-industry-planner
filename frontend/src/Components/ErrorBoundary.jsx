import React from "react";
import { Box, Button, Typography } from "@mui/material";
import * as Sentry from "@sentry/react";
import useUsersStore from "../Zustand/usersStore";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo,
    });

    // Log to Sentry if in production
    if (process.env.ENVIRONMENT === "production") {
      Sentry.captureException(error, {
        extra: {
          componentStack: errorInfo.componentStack,
          users: useUsersStore.getState().users,
          applicationSettings: useUsersStore.getState().applicationSettings,
        }
      });
    }
  }

  render() {
    if (this.state.hasError) {
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
            backgroundColor: "background.paper"
          }}
        >
          <Typography variant="h4" color="error" gutterBottom>
            Something went wrong
          </Typography>
          <Typography variant="body1" gutterBottom>
            We're sorry, but something unexpected happened in the {this.props.componentName || 'application'}.
            Please try refreshing the page or contact support if the issue persists.
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
              onClick={() => window.location.href = "/"}
            >
              Return Home
            </Button>
          </Box>
          {process.env.ENVIRONMENT === "development" && (
            <Box sx={{ mt: 4, textAlign: "left", maxWidth: "800px", width: "100%" }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
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
                  maxHeight: "300px"
                }}
              >
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </Box>
            </Box>
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
