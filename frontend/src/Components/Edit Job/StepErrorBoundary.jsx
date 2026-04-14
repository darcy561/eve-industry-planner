import React from 'react';
import { Box, Typography, Alert } from '@mui/material';
import * as Sentry from '@sentry/react';
import useUsersStore from '../../Zustand/usersStore';

class StepErrorBoundary extends React.Component {
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
          currentStep: this.props.currentStep,
          activeJob: this.props.state.activeJob,
          jobModified: this.props.state.jobModified,
          temporaryChildJobs: this.props.state.temporaryChildJobs,
          esiDataToLink: this.props.state.esiDataToLink,
          parentChildToEdit: this.props.state.parentChildToEdit,
          isLoading: this.props.state.isLoading,
          users: useUsersStore.getState().users,
          applicationSettings: useUsersStore.getState().applicationSettings,
        },
      });
    }
  }

  render() {
    if (this.state.hasError) {
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
              backgroundColor: 'transparent',
              '& .MuiAlert-icon': {
                color: 'error.main'
              }
            }}
          >
            <Typography variant="subtitle1" component="div" gutterBottom>
              Error at the {this.props.currentStep} stage
            </Typography>
            <Typography variant="body2" color="text.secondary">
              There was an error loading this stage. You can still navigate between stages.
            </Typography>
          </Alert>

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

export default StepErrorBoundary; 