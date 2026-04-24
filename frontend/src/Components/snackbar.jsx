import { useState, useEffect } from "react";
import { Alert, Snackbar, Slide, Button, Box, IconButton } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { subscribeToEvent } from "../utils/EventSystem";
import useUsersStore from "../Zustand/usersStore.js";
import { primaryHeaderRegistration } from "../Functions/DocumentLock/documentLockHeaderSelectors.js";

/** Flat icon buttons — no filled hover chip */
const plainIconBtnSx = {
  color: "inherit",
  padding: "4px",
  "&:hover": { backgroundColor: "transparent" },
  "&.Mui-focusVisible": { backgroundColor: "rgba(255,255,255,0.12)" },
};

const plainGlyphSx = { fontSize: "1.35rem", opacity: 0.95 };

/** Leading Alert icon: simple tick (ok) vs cross (problem) — no severity badge blob */
function severityGlyph(severity) {
  if (severity === "error" || severity === "warning") {
    return <CloseIcon sx={plainGlyphSx} />;
  }
  return <CheckIcon sx={plainGlyphSx} />;
}

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
            aria-label="Dismiss"
            color="inherit"
            size="small"
            disableRipple
            onClick={handleSnackbarClose}
            sx={plainIconBtnSx}
          >
            <CloseIcon sx={{ fontSize: "1.25rem" }} />
          </IconButton>
        </Box>
      );
    }
    if (snackbarData.action === "DOCUMENT_LOCK_ACCESS_REQUEST") {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
          <IconButton
            aria-label="Hand over editing"
            color="inherit"
            size="small"
            disableRipple
            onClick={() => {
              let collection = snackbarData.documentLockCollection;
              let docID = snackbarData.documentLockDocID;
              if (!collection || !docID) {
                const p = primaryHeaderRegistration(useUsersStore.getState());
                collection = p?.collection;
                docID = p?.docID;
              }
              if (collection && docID) {
                void useUsersStore
                  .getState()
                  .documentLock.actions.handOverEditAccess(collection, docID);
              }
              handleSnackbarClose({}, "handover");
            }}
            sx={plainIconBtnSx}
          >
            <CheckIcon sx={{ fontSize: "1.25rem" }} />
          </IconButton>
          <IconButton
            aria-label="Dismiss"
            color="inherit"
            size="small"
            disableRipple
            onClick={() => {
              let collection = snackbarData.documentLockCollection;
              let docID = snackbarData.documentLockDocID;
              if (!collection || !docID) {
                const p = primaryHeaderRegistration(useUsersStore.getState());
                collection = p?.collection;
                docID = p?.docID;
              }
              if (collection && docID) {
                useUsersStore
                  .getState()
                  .documentLock.actions.clearPendingAccessNotice(
                    collection,
                    docID
                  );
              }
              handleSnackbarClose({}, "dismiss");
            }}
            sx={plainIconBtnSx}
          >
            <CloseIcon sx={{ fontSize: "1.25rem" }} />
          </IconButton>
        </Box>
      );
    }
    return snackbarData.action;
  };

  const actionElement = getAction();

  const isDocLockAccess =
    snackbarData.action === "DOCUMENT_LOCK_ACCESS_REQUEST";

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
        icon={isDocLockAccess ? false : severityGlyph(snackbarData.severity)}
        onClose={
          isDocLockAccess ? undefined : handleSnackbarClose
        }
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
