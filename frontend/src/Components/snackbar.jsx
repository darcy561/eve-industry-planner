import { useState, useEffect } from "react";
import { Alert, Snackbar, Slide, Button, Box, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { subscribeToEvent } from "../utils/EventSystem";

const initialState = {
  open: false,
  message: "",
  severity: "info",
  autoHideDuration: 1000,
  anchorOrigin: { vertical: "bottom", horizontal: "center" },
  direction: "up",
  variant: "filled",
  key: null,
  action: null,
};

export function SnackBarNotification() {
  const [snackbarData, setSnackbarData] = useState(initialState);

  useEffect(() => {
    const unsubscribe = subscribeToEvent("snackbar", (data) => {
      setSnackbarData(data);
    });
    return () => unsubscribe();
  }, []);

  const triggerVersionDismiss = () => {
    if (
      snackbarData.action === "VERSION_UPDATE" &&
      typeof snackbarData.onDismiss === "function"
    ) {
      snackbarData.onDismiss(snackbarData.versionUpdateTarget);
    }
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    triggerVersionDismiss();
    setSnackbarData((prev) => ({
      ...prev,
      open: false,
    }));
  };

  const slideTransition = (props) => {
    return <Slide {...props} direction={snackbarData.direction} />;
  };

  if (!snackbarData.open) {
    return null;
  }

  const getAction = () => {
    if (snackbarData.action === "VERSION_UPDATE") {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              window.location.reload();
            }}
          >
            Refresh
          </Button>
          <IconButton
            color="inherit"
            size="small"
            onClick={handleSnackbarClose}
            sx={{ padding: 0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      );
    }
    return snackbarData.action;
  };

  const actionElement = getAction();

  return (
    <Snackbar
      anchorOrigin={snackbarData.anchorOrigin}
      autoHideDuration={snackbarData.autoHideDuration}
      key={snackbarData.key}
      open={snackbarData.open}
      onClose={handleSnackbarClose}
      slots={{
        transition: slideTransition
      }}
    >
      <Alert
        onClose={handleSnackbarClose}
        severity={snackbarData.severity}
        sx={{ width: "100%" }}
        variant={snackbarData.variant}
        action={actionElement}
      >
        {snackbarData.message}
      </Alert>
    </Snackbar>
  );
}
