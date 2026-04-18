import { SnackBarNotification } from "./Components/snackbar";
import GeneralDialog from "./Components/Dialogues/General/generalDialog";
import CssBaseline from "@mui/material/CssBaseline";
import { Outlet } from "@tanstack/react-router";
import { FeedbackIcon } from "./Components/Dialogues/Feedback/feedback";
import { CrashReportDialog } from "./Components/Dialogues/CrashReport/CrashReportDialog";
import GLOBAL_CONFIG from "./global-config-app";
import { Box } from "@mui/material";
import MaintenanceMode from "./MaintenanceMode";
import { ThemeProvider } from "./Context/ThemeContext";
import ErrorBoundary from "./Components/ErrorBoundary";
import useRefreshESITokens from "./Hooks/useRefreshESITokens";
import useCheckEveServerStatus from "./Hooks/useCheckEveServerStatus";
import useVersionCheck from "./Hooks/GeneralHooks/useVersionCheck";
import useFetchStaticDataFiles from "./Hooks/useFetchStaticDataFiles";
import useAppConfig from "./Hooks/GeneralHooks/useAppConfig";
const { ENABLE_FEEDBACK_ICON } = GLOBAL_CONFIG;

export default function App() {
  const { maintenance_mode: isMaintenanceMode = false } = useAppConfig();

  useRefreshESITokens();
  useCheckEveServerStatus();
  useVersionCheck();
  useFetchStaticDataFiles();

  return (
    <ThemeProvider>
      <CrashReportDialog />
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
