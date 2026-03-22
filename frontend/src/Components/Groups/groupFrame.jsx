import { useEffect, useMemo } from "react";
import {
  Box,
  useMediaQuery,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import useSetupUnmountEventListeners from "../../Hooks/GeneralHooks/useSetupUnmountEventListeners";
import { LoadingPage } from "../loadingPage";
import { SearchBar } from "../Job Planner/Planner Components/searchbar";
import { ShoppingListDialog } from "../Dialogues/Shopping List/ShoppingList";
import { useNavigate, useParams } from "@tanstack/react-router";
import LeftCollapseableMenuDrawer from "../SideMenu/leftMenuDrawer";
import CollapseableContentDrawer_Right from "../SideMenu/rightContentDrawer";
import RightSideMenuContent_GroupPage from "./Side Menu/rightSideMenuContent";
import GroupAccordionFrame from "./Accordion/AccordionFrame";
import manageListenerRequests from "../../Functions/Firebase/manageListenerRequests";
import GroupNameFrame from "./Group Name/groupNameFrame";
import { useGroupPageSideMenuFunctions } from "./Side Menu/Buttons/buttonFunctions";
import getMissingJobObjects from "../../Functions/Helper/getMissingJobObjects";
import { PriceEntryDialog } from "../Dialogues/Price Entry/PriceEntry";
import convertJobIDsToObjects from "../../Functions/Helper/convertJobIDsToObjects";
import recalculateInstallCostsWithNewData from "../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import getMissingESIData from "../../Functions/Shared/getMissingESIData";
import PriceHistoryDialog from "../Dialogues/Price History/dialogFrame";
import MarketDataDialog from "../Dialogues/Market Data/dialogFrame";
import useGroupPageReducer from "./Hooks/useGroupPageReducer";
import useUsersStore from "../../Zustand/usersStore";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import GroupPageViewSelector from "./pageViewSelector";

function GroupPageFrame() {
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const { activeGroupID, groupArray, jobArray } = useUsersStore(
    (state) => state.jobData
  );
  const {
    setActiveGroupID,
    getGroupObject,
    addRetrievedJobsToJobArray,
    clearMultiSelect,
  } = useUsersStore.getState().jobData.actions;
  const { state, actions } = useGroupPageReducer();
  const params = useParams({ from: "/group/$groupID" });
  const { groupID } = params;

  const navigate = useNavigate();
  const activeGroupObject = getGroupObject(groupID);
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const pageRequiresRightDrawerOpen = true;

  const groupJobs = useMemo(() => {
    if (!activeGroupObject) return [];
    const groupJobs = [...jobArray]
      .filter((job) => activeGroupObject.includedJobIDs.has(job.jobID))
      .sort((a, b) => a.name.localeCompare(b.name));

    return groupJobs;
  }, [jobArray, activeGroupObject]);

  useEffect(() => {
    async function retrieveGroupData() {
      try {
        // Get fresh groupArray from store to check if group still exists
        // This prevents the effect from running when closing a group
        const currentGroupArray = useUsersStore.getState().jobData.groupArray;
        const groupStillExists = currentGroupArray.some(g => g.groupID === groupID);
        if (!groupStillExists) {
          // Group was deleted/closed, navigate away
          navigate({ to: "/jobplanner" });
          return;
        }

        // Get fresh activeGroupObject from store
        const currentActiveGroupObject = getGroupObject(groupID);
        if (!currentActiveGroupObject) {
          throw new Error("Unable to find requested group");
        }

        const retrievedJobs = await getMissingJobObjects(
          currentActiveGroupObject.includedJobIDs
        );

        const allJobObjects = await convertJobIDsToObjects(
          currentActiveGroupObject.includedJobIDs,
          retrievedJobs
        );

        const { requestedMarketData, requestedSystemIndexes } =
          await getMissingESIData(allJobObjects);

        recalculateInstallCostsWithNewData(
          allJobObjects,
          requestedMarketData,
          requestedSystemIndexes
        );
        useUsersStore
          .getState()
          .worldData.actions.addMarketData(requestedMarketData);
        useUsersStore
          .getState()
          .worldData.actions.addSystemIndex(requestedSystemIndexes);

        // Only set activeGroupID if it's not already set to this group
        // This prevents unnecessary updates and race conditions
        const currentActiveGroupID = useUsersStore.getState().jobData.activeGroupID;
        if (currentActiveGroupID !== currentActiveGroupObject.groupID) {
          setActiveGroupID(currentActiveGroupObject.groupID);
        }
        clearMultiSelect();
        addRetrievedJobsToJobArray(retrievedJobs);
        manageListenerRequests(currentActiveGroupObject.includedJobIDs);
      } catch (err) {
        console.error(err);
        navigate({ to: "/jobplanner" });
      }
    }
    retrieveGroupData();
    // Depend on groupID from route params instead of groupArray
    // This way it only runs when navigating to a different group, not when groupArray updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupID]);

  useSetupUnmountEventListeners();

  const buttonOptions = useGroupPageSideMenuFunctions(
    state,
    actions,
    groupJobs,
    pageRequiresRightDrawerOpen
  );

  return (
    <DefaultPageLayout>
      {!activeGroupID ? (
        <LoadingPage />
      ) : (
        <>
          <LeftCollapseableMenuDrawer inputDrawerButtons={buttonOptions} />
          <Box
            component="main"
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              paddingX: 0,
              gap: 1,
              overflow: "hidden",
            }}
          >
            <Box sx={{ paddingX: 1 }}>
              <GroupNameFrame />
            </Box>
            {!deviceNotMobile && state.rightDrawerContentID === 1 && (
              <SearchBar actions={actions} />
            )}

            {isLoggedIn && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "right",
                  alignItems: "center",
                  paddingX: 1,
                }}
              >
                <ToggleButtonGroup
                  value={state.pageView}
                  exclusive
                  size="small"
                  onChange={(e, value) => {
                    if (value !== null) {
                      actions.setPageView(value);
                    }
                  }}
                >
                  <ToggleButton value="planner">Plannner</ToggleButton>
                  <ToggleButton value="breakdown">Breakdown</ToggleButton>
                  <ToggleButton value="scheduler">Scheduler</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                justifyContent: { xs: "center", md: "flex-start" },
                gap: 2,
                width: "100%",
                flex: 1,
                paddingX: 1,
                overflow: "hidden",
              }}
            >
              <GroupPageViewSelector
                state={state}
                actions={actions}
                groupJobs={groupJobs}
              />
            </Box>
          </Box>
          {deviceNotMobile && (
            <CollapseableContentDrawer_Right
              state={state}
              actions={actions}
              DrawerContent={
                <RightSideMenuContent_GroupPage
                  state={state}
                  actions={actions}
                  groupJobs={groupJobs}
                />
              }
            />
          )}
        </>
      )}
      <ShoppingListDialog />
      <PriceEntryDialog />
      <PriceHistoryDialog />
      <MarketDataDialog />
    </DefaultPageLayout>
  );
}

export default GroupPageFrame;
