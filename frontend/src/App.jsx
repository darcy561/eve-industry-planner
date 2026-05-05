import { SnackBarNotification } from "./Components/snackbar";
import GeneralDialog from "./Components/Dialogues/General/generalDialog";
import JobDependencyTreeDialog from "./Components/Dialogues/Job Tree/JobDependencyTreeDialog";
import CssBaseline from "@mui/material/CssBaseline";
import { Outlet } from "@tanstack/react-router";
import { FeedbackIcon } from "./Components/Dialogues/Feedback/feedback";
import { CrashReportDialog } from "./Components/Dialogues/CrashReport/CrashReportDialog";
import GLOBAL_CONFIG from "./global-config-app";
import { Box } from "@mui/material";
import MaintenanceMode from "./MaintenanceMode";
import { ThemeProvider } from "./Context/ThemeContext";
import ErrorBoundary from "./Components/ErrorBoundary";
import useRefreshESITokens from "./Hooks/App/useRefreshESITokens";
import useCheckEveServerStatus from "./Hooks/App/useCheckEveServerStatus";
import useFetchStaticDataFiles from "./Hooks/App/useFetchStaticDataFiles";
import useAppConfig from "./Hooks/App/useAppConfig";
import { useAccountWebSocket } from "./Realtime/useAccountWebSocket.js";
const { ENABLE_FEEDBACK_ICON } = GLOBAL_CONFIG;

export default function App() {
  const { maintenance_mode: isMaintenanceMode = false } = useAppConfig({
    shouldFetchOnMount: true,
    enableVersionCheck: true,
  });

  useRefreshESITokens();
  useAccountWebSocket();
  useCheckEveServerStatus();
  useFetchStaticDataFiles();

  return (
    <ThemeProvider>
      <CrashReportDialog />
      <Box sx={{ display: "flex", width: "100%", height: "100%" }}>
        <CssBaseline />
        <ErrorBoundary>
          <SnackBarNotification />
          <GeneralDialog />
          <JobDependencyTreeDialog />
          {isMaintenanceMode ? <MaintenanceMode /> : <Outlet />}
          {ENABLE_FEEDBACK_ICON && !isMaintenanceMode && <FeedbackIcon />}
        </ErrorBoundary>
      </Box>
    </ThemeProvider>
  );
}
