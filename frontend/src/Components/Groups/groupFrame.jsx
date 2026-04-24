import { useEffect, useMemo, useState } from "react";
import { Box, useMediaQuery, ToggleButtonGroup, ToggleButton } from "@mui/material";
import useWarnBeforeUnload from "../../Hooks/GeneralHooks/useWarnBeforeUnload";
import { SearchBar } from "../Job Planner/Planner Components/searchbar";
import { ShoppingListDialog } from "../Dialogues/Shopping List/ShoppingList";
import { useNavigate, useParams } from "@tanstack/react-router";
import LeftCollapseableMenuDrawer from "../SideMenu/leftMenuDrawer";
import CollapseableContentDrawer_Right from "../SideMenu/rightContentDrawer";
import RightSideMenuContent_GroupPage from "./Side Menu/rightSideMenuContent";
import GroupNameFrame from "./Group Name/groupNameFrame";
import { useGroupPageSideMenuFunctions } from "./Side Menu/Buttons/buttonFunctions";
import getMissingJobObjects from "../../Functions/Helper/getMissingJobObjects";
import { PriceEntryDialog } from "../Dialogues/Price Entry/PriceEntry";
import recalculateInstallCostsWithNewData from "../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import getMissingESIData from "../../Functions/Shared/getMissingESIData";
import PriceHistoryDialog from "../Dialogues/Price History/dialogFrame";
import MarketDataDialog from "../Dialogues/Market Data/dialogFrame";
import useGroupPageReducer from "./Hooks/useGroupPageReducer";
import useUsersStore from "../../Zustand/usersStore";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import { LoadingPage } from "../loadingPage";
import GroupPageViewSelector from "./pageViewSelector";
import { useDocumentLock } from "../../Hooks/DocumentLock/useDocumentLock.js";
import { USER_JOB_GROUPS_COLLECTION } from "../../Functions/DocumentLock/documentLockCollections.js";
import { useRegisterHeaderDocumentLockUI } from "../../Hooks/DocumentLock/useRegisterHeaderDocumentLockUI.js";
import { selectDocumentLockReadOnly } from "../../Functions/DocumentLock/documentLockSelectors.js";
import { useJobPlannerJobLockSync } from "../../Hooks/DocumentLock/useJobPlannerJobLockSync.js";

function GroupPageFrame() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { activeGroupID, groupArray, jobArray } = useUsersStore(
    (state) => state.jobData
  );
  const {
    setActiveGroupID,
    getGroupObject,
    clearMultiSelect,
  } = useUsersStore.getState().jobData.actions;
  const { state, actions } = useGroupPageReducer();
  const params = useParams({ from: "/group/$groupID" });
  const { groupID } = params;

  const groupReadOnly = useUsersStore((s) =>
    selectDocumentLockReadOnly(s, USER_JOB_GROUPS_COLLECTION, groupID ?? "")
  );

  useJobPlannerJobLockSync();

  const navigate = useNavigate();
  const activeGroupObject = getGroupObject(groupID);
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const [loadHelperText, setLoadHelperText] = useState("Loading group…");

  const pageRequiresRightDrawerOpen = true;

  const groupJobs = useMemo(() => {
    if (!activeGroupObject) return [];
    const groupJobs = [...jobArray]
      .filter((job) => activeGroupObject.includedJobIDs.has(job.jobID))
      .sort((a, b) => a.name.localeCompare(b.name));

    return groupJobs;
  }, [jobArray, activeGroupObject]);

  useEffect(() => {
    function onRemoteGroupDeleted(/** @type {CustomEvent<{ groupID?: string }>} */ ev) {
      if (ev?.detail?.groupID === groupID) {
        navigate({ to: "/jobplanner" });
      }
    }
    window.addEventListener("eip-group-deleted-remotely", onRemoteGroupDeleted);
    return () => {
      window.removeEventListener("eip-group-deleted-remotely", onRemoteGroupDeleted);
    };
  }, [groupID, navigate]);

  useEffect(() => {
    let cancelled = false;
    const hint = (text) => {
      if (!cancelled) setLoadHelperText(text);
    };

    async function retrieveGroupData() {
      hint("Loading group…");
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

        hint("Loading jobs…");
        await getMissingJobObjects(currentActiveGroupObject.includedJobIDs);

        hint("Preparing job data…");
        const allJobObjects = await useUsersStore
          .getState()
          .jobData.actions.jobsFromIdsOrObjects(
            currentActiveGroupObject.includedJobIDs
          );

        hint("Gathering market data…");
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
      } catch (err) {
        console.error(err);
        navigate({ to: "/jobplanner" });
      }
    }
    retrieveGroupData();
    return () => {
      cancelled = true;
    };
    // Depend on groupID from route params instead of groupArray
    // This way it only runs when navigating to a different group, not when groupArray updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupID]);

  useWarnBeforeUnload();

  const buttonOptions = useGroupPageSideMenuFunctions(
    state,
    actions,
    groupJobs,
    pageRequiresRightDrawerOpen,
    groupReadOnly
  );

  const isGroupReady = activeGroupID === groupID;

  useDocumentLock(USER_JOB_GROUPS_COLLECTION, groupID, Boolean(isLoggedIn && isGroupReady), {
    pendingAccessRequestMessage:
      "Another tab requested edit access for this group.",
  });

  useRegisterHeaderDocumentLockUI({
    collection: USER_JOB_GROUPS_COLLECTION,
    docID: groupID,
    enabled: Boolean(isLoggedIn && isGroupReady),
    readOnlyMessage:
      "This group is being edited in another session (read-only).",
  });

  return (
    <DefaultPageLayout>
      {!isGroupReady ? (
        <LoadingPage
          variant="simple"
          helperText={loadHelperText}
        />
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
                groupReadOnly={groupReadOnly}
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
