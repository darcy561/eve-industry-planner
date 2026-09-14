import { SnackBarNotification } from "./Components/snackbar";
import GeneralDialogue from "./Components/Dialogues/General/generalDialogue";
import JobDependencyTreeDialogue from "./Components/Dialogues/Job Tree/JobDependencyTreeDialogue";
import { Outlet } from "@tanstack/react-router";
import { FeedbackIcon } from "./Components/Dialogues/Feedback/feedback";
import { CrashReportDialogue } from "./Components/Dialogues/CrashReport/CrashReportDialogue";
import GLOBAL_CONFIG from "./global-config-app";
import { Box } from "@mui/material";
import MaintenanceMode from "./MaintenanceMode";
import DefaultPageLayout from "./Styled Components/defaultPageLayout";
import PageTransition, { usePageKey } from "./Components/pageTransition";
import ErrorBoundary from "./Components/ErrorBoundary";
import { useTranquilityServerStatusQuery } from "./Hooks/React Query/tranquilityServerStatus.js";
import useAppConfig from "./Hooks/App/useAppConfig";
import useMaintenanceRealtimePark from "./Hooks/App/useMaintenanceRealtimePark.js";
import useMarketClockRevalidation from "./Hooks/App/useMarketClockRevalidation.js";
import { useAccountWebSocket } from "./Realtime/useAccountWebSocket.js";
import { useAccountAffiliationQuery } from "./Hooks/React Query/accountAffiliation.js";
const { ENABLE_FEEDBACK_ICON } = GLOBAL_CONFIG;

export default function App() {
  const { maintenance_mode: isMaintenanceMode = false } = useAppConfig({
    shouldFetchOnMount: true,
    enableVersionCheck: true,
  });

  const pageKey = usePageKey(isMaintenanceMode);

  useMaintenanceRealtimePark(isMaintenanceMode);
  useAccountWebSocket();
  useTranquilityServerStatusQuery();
  useAccountAffiliationQuery();
  useMarketClockRevalidation();

  return (
    <>
      <CrashReportDialogue />
      <Box sx={{ display: "flex", width: "100%", height: "100%" }}>
        <ErrorBoundary>
          <SnackBarNotification />
          <GeneralDialogue />
          <JobDependencyTreeDialogue />
          {isMaintenanceMode ? (
            <MaintenanceMode />
          ) : (
            <DefaultPageLayout>
              <PageTransition contentKey={pageKey}>
                <Outlet />
              </PageTransition>
              {ENABLE_FEEDBACK_ICON && <FeedbackIcon />}
            </DefaultPageLayout>
          )}
        </ErrorBoundary>
      </Box>
    </>
  );
}
