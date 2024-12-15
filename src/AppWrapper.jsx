import {
  JobStatus,
  JobArray,
  ActiveJob,
  ApiJobs,
  ArchivedJobs,
  LinkedIDs,
} from "./Context/JobContext";
import {
  FirebaseListeners,
  IsLoggedIn,
  UserJobSnapshot,
  Users,
  UserWatchlist,
} from "./Context/AuthContext";
import {
  CorpEsiData,
  EveESIStatus,
  EveIDs,
  EvePrices,
  PersonalEsiData,
  SisiDataFiles,
  SystemIndex,
} from "./Context/EveDataContext";
import {
  DataExchange,
  DialogData,
  SnackbarData,
  PageLoad,
  LoadingText,
  MultiSelectJobPlanner,
  RefreshState,
  PriceEntryList,
  MassBuildDisplay,
  JobPlannerPageTrigger,
  UserLoginUI,
  ShoppingList,
  ApplicationSettings,
} from "./Context/LayoutContext";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import App from "./App";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import * as Sentry from "@sentry/react";

export function AppWrapper() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_KEY,
    integrations: [],
  });
  return (
    <FirebaseListeners>
      <SnackbarData>
        <DialogData>
          <PageLoad>
            <LoadingText>
              <UserLoginUI>
                <RefreshState>
                  <IsLoggedIn>
                    <Users>
                      <ApplicationSettings>
                        <PersonalEsiData>
                          <CorpEsiData>
                            <LinkedIDs>
                              <UserJobSnapshot>
                                <UserWatchlist>
                                  <DataExchange>
                                    <JobPlannerPageTrigger>
                                      <ActiveJob>
                                        <JobArray>
                                          <JobStatus>
                                            <ApiJobs>
                                              <EveIDs>
                                                <EveESIStatus>
                                                  <EvePrices>
                                                    <SystemIndex>
                                                      <MultiSelectJobPlanner>
                                                        <PriceEntryList>
                                                          <ShoppingList>
                                                            <SisiDataFiles>
                                                              <MassBuildDisplay>
                                                                <ArchivedJobs>
                                                                  <LocalizationProvider
                                                                    dateAdapter={
                                                                      AdapterDateFns
                                                                    }
                                                                  >
                                                                    <DndProvider
                                                                      backend={
                                                                        HTML5Backend
                                                                      }
                                                                    >
                                                                      <App />
                                                                    </DndProvider>
                                                                  </LocalizationProvider>
                                                                </ArchivedJobs>
                                                              </MassBuildDisplay>
                                                            </SisiDataFiles>
                                                          </ShoppingList>
                                                        </PriceEntryList>
                                                      </MultiSelectJobPlanner>
                                                    </SystemIndex>
                                                  </EvePrices>
                                                </EveESIStatus>
                                              </EveIDs>
                                            </ApiJobs>
                                          </JobStatus>
                                        </JobArray>
                                      </ActiveJob>
                                    </JobPlannerPageTrigger>
                                  </DataExchange>
                                </UserWatchlist>
                              </UserJobSnapshot>
                            </LinkedIDs>
                          </CorpEsiData>
                        </PersonalEsiData>
                      </ApplicationSettings>
                    </Users>
                  </IsLoggedIn>
                </RefreshState>
              </UserLoginUI>
            </LoadingText>
          </PageLoad>
        </DialogData>
      </SnackbarData>
    </FirebaseListeners>
  );
}
