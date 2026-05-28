import { useEffect, useMemo, useRef, useState } from "react";
import { Box, useMediaQuery, ToggleButtonGroup, ToggleButton } from "@mui/material";
import useWarnBeforeUnload from "../../Hooks/GeneralHooks/useWarnBeforeUnload";
import { SearchBar } from "../Job Planner/Planner Components/searchbar";
import { ShoppingListDialog } from "../Dialogues/Shopping List/ShoppingList";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import LeftCollapseableMenuDrawer from "../SideMenu/leftMenuDrawer";
import CollapseableContentDrawer_Right from "../SideMenu/rightContentDrawer";
import RightSideMenuContent_GroupPage from "./Side Menu/rightSideMenuContent";
import GroupNameFrame from "./Group Name/groupNameFrame";
import { useGroupPageSideMenuFunctions } from "./Side Menu/Buttons/buttonFunctions";
import getMissingJobObjects from "../../Functions/Helper/getMissingJobObjects";
import { PriceEntryDialog } from "../Dialogues/Price Entry/PriceEntry";
import { recalculateInstallCostsWithNewData } from "../../Functions/Installation Costs/installCosts";
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
import { useGroupLockReadOnly } from "../../Hooks/DocumentLock/useDocumentLockState.js";
import { useJobPlannerJobLockSync } from "../../Hooks/DocumentLock/useJobPlannerJobLockSync.js";
import { parseGroupPageViewSearchParam } from "../../Functions/Groups/groupPageViewSearch";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { AppEvent } from "../../analytics/appEventNames";
import SaveGroupTemplateDialog from "../Dialogues/Group Templates/SaveGroupTemplateDialog";
import ApplyGroupTemplateDialog from "../Dialogues/Group Templates/ApplyGroupTemplateDialog";

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
  const params = useParams({ from: "/group/$groupID" });
  const { groupID } = params;
  const search = useSearch({ from: "/group/$groupID" });
  const { state, actions } = useGroupPageReducer(search.pageView);

  useEffect(() => {
    const pv = parseGroupPageViewSearchParam(search.pageView);
    if (pv && pv !== state.pageView) {
      actions.setPageView(pv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions object is recreated each render
  }, [search.pageView, state.pageView]);

  const groupReadOnly = useGroupLockReadOnly(groupID);

  useJobPlannerJobLockSync();

  const navigate = useNavigate({ from: "/group/$groupID" });
  const activeGroupObject = getGroupObject(groupID);
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const [loadHelperText, setLoadHelperText] = useState("Loading group…");
  const lastTrackedPageView = useRef(null);

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
  const groupLockEnabled = Boolean(isLoggedIn && groupID && activeGroupObject);

  useEffect(() => {
    if (!isGroupReady) return;
    if (lastTrackedPageView.current === state.pageView) return;
    lastTrackedPageView.current = state.pageView;
    if (state.pageView === "planner") {
      trackAppEvent(AppEvent.GROUP_TAB_PLANNER);
      return;
    }
    if (state.pageView === "jobTree") {
      trackAppEvent(AppEvent.GROUP_TAB_JOB_TREE);
      return;
    }
    if (state.pageView === "breakdown") {
      trackAppEvent(AppEvent.GROUP_TAB_BREAKDOWN);
      return;
    }
    if (state.pageView === "scheduler") {
      trackAppEvent(AppEvent.GROUP_TAB_SCHEDULER);
    }
  }, [isGroupReady, state.pageView]);

  useDocumentLock(USER_JOB_GROUPS_COLLECTION, groupID, groupLockEnabled, {
    releaseOnUnmount: false,
    cascadeMemberJobScopesOnGrant: true,
    pendingAccessRequestMessage:
      "Another tab requested edit access for this group.",
    becameOwnerVacantMessage:
      "You now hold the edit lock for this group — this tab is the editor.",
    lostOwnerMessage:
      "This tab is now read-only for this group — another session holds the edit lock.",
    extendNudgeMessage:
      "This group's edit session is about to end — renew now while this tab is visible.",
    passiveViewerMessage: (count) =>
      count === 1
        ? "Another session is viewing this group — you still hold the edit lock."
        : `${count} other sessions are viewing this group — you still hold the edit lock.`,
  });

  useRegisterHeaderDocumentLockUI({
    collection: USER_JOB_GROUPS_COLLECTION,
    docID: groupID,
    enabled: groupLockEnabled,
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
                  justifyContent: { xs: "flex-start", sm: "flex-end" },
                  alignItems: "center",
                  paddingX: 1,
                  width: "100%",
                  minWidth: 0,
                  overflowX: "auto",
                  overflowY: "hidden",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <ToggleButtonGroup
                  value={state.pageView}
                  exclusive
                  size="small"
                  sx={{ flexShrink: 0 }}
                  onChange={(e, value) => {
                    if (value !== null) {
                      actions.setPageView(value);
                      navigate({
                        to: "/group/$groupID",
                        params: { groupID },
                        search: { pageView: value },
                        replace: true,
                      });
                    }
                  }}
                >
                  <ToggleButton value="planner">Planner</ToggleButton>
                  <ToggleButton value="jobTree">Job tree</ToggleButton>
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
                routeGroupID={groupID}
                focusJobId={search.focusJobId}
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
      <ApplyGroupTemplateDialog />
      <SaveGroupTemplateDialog />
    </DefaultPageLayout>
  );
}

export default GroupPageFrame;
