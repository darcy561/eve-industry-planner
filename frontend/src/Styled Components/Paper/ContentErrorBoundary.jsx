import React from 'react';
import { Box, Typography, Alert, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import * as Sentry from '@sentry/react';
import useUsersStore from '../../Zustand/usersStore';

/**
 * Error boundary component that catches JavaScript errors in child components.
 * Displays a user-friendly error message with retry functionality and logs errors to Sentry in production.
 * Shows detailed error information in development mode.
 * 
 * @class ContentErrorBoundary
 * @extends {React.Component}
 * 
 * @example
 * <ContentErrorBoundary componentName="Job Planner">
 *   <JobPlannerComponent />
 * </ContentErrorBoundary>
 */
class ContentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo,
    });

    // Log to Sentry if in production
    if (import.meta.env.ENVIRONMENT === 'production') {
      Sentry.captureException(error, {
        extra: {
          componentStack: errorInfo.componentStack,
          componentName: this.props.componentName || 'Unknown Component',
          users: useUsersStore.getState().users,
          applicationSettings: useUsersStore.getState().applicationSettings,
        },
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            p: 2,
            textAlign: 'center',
          }}
        >
          <Alert
            severity="error"
            sx={{
              mb: 2,
              backgroundColor: 'transparent',
              '& .MuiAlert-icon': {
                color: 'error.main'
              }
            }}
          >
            <Typography variant="subtitle1" component="div" gutterBottom>
              Something went wrong loading this content
            </Typography>
            <Typography variant="body2" color="text.secondary">
              There was an error displaying this section. You can try refreshing the data.
            </Typography>
          </Alert>

          <Button
            variant="outlined"
            color="primary"
            startIcon={<RefreshIcon />}
            onClick={this.handleRetry}
            sx={{ mb: 2 }}
          >
            Try Again
          </Button>

          {import.meta.env.ENVIRONMENT === 'development' && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                overflow: 'auto',
                maxHeight: '200px',
                backgroundColor: 'background.default',
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Error Details:
              </Typography>
              <pre style={{ margin: 0 }}>
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </Box>
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ContentErrorBoundary;
