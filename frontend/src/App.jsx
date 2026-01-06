import { SnackBarNotification } from "./Components/snackbar";
import GeneralDialog from "./Components/generalDialog";
import CssBaseline from "@mui/material/CssBaseline";
import { Outlet } from "@tanstack/react-router";
import { FeedbackIcon } from "./Components/Feedback/feedback";
import GLOBAL_CONFIG from "./global-config-app";
import { Box } from "@mui/material";
import { getBoolean } from "firebase/remote-config";
import { remoteConfig } from "./firebase";
import MaintenanceMode from "./MaintenanceMode";
import { ThemeProvider } from "./Context/ThemeContext";
import ErrorBoundary from "./Components/ErrorBoundary";
import useRefreshESITokens from "./Hooks/useRefreshESITokens";
import useCheckEveServerStatus from "./Hooks/useCheckEveServerStatus";
import useVersionCheck from "./Hooks/GeneralHooks/useVersionCheck";
import useFetchStaticDataFiles from "./Hooks/useFetchStaticDataFiles";
import { useServiceWorker } from "./Hooks/useServiceWorker";
const { ENABLE_FEEDBACK_ICON } = GLOBAL_CONFIG;

export default function App() {
  const isMaintenanceMode = getBoolean(remoteConfig, "maintenance_mode");

  useRefreshESITokens();
  useCheckEveServerStatus();
  useVersionCheck();
  useFetchStaticDataFiles();
  useServiceWorker();

  return (
    <ThemeProvider>
      <Box sx={{ display: "flex", width: "100%", height: "100%" }}>
        <CssBaseline />
        <ErrorBoundary>
          <SnackBarNotification />
          <GeneralDialog />
          {isMaintenanceMode ? <MaintenanceMode /> : <Outlet />}
          {ENABLE_FEEDBACK_ICON && !isMaintenanceMode && <FeedbackIcon />}
        </ErrorBoundary>
      </Box>
    </ThemeProvider>
  );
}
