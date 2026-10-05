import { useEffect, useMemo, useRef } from "react";
import {
  Box,
  useMediaQuery,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import useWarnBeforeUnload from "../../Hooks/GeneralHooks/useWarnBeforeUnload";
import { SearchBar } from "../Job Planner/Planner Components/searchbar";
import { ShoppingListDialogue } from "../Dialogues/Shopping List/ShoppingList";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import LeftCollapsibleMenuDrawer from "../SideMenu/leftMenuDrawer";
import CollapsibleContentDrawer_Right from "../SideMenu/rightContentDrawer";
import RightSideMenuContent_GroupPage from "./Side Menu/rightSideMenuContent";
import GroupNameFrame from "./Group Name/groupNameFrame";
import { useGroupPageSideMenuFunctions } from "./Side Menu/Buttons/buttonFunctions";
import { PriceEntryDialogue } from "../Dialogues/Price Entry/PriceEntry";
import PriceHistoryDialogue from "../Dialogues/Price History/dialogueFrame";
import MarketDataDialogue from "../Dialogues/Market Data/dialogueFrame";
import useGroupPageReducer from "./Hooks/useGroupPageReducer";
import useUsersStore from "../../Zustand/usersStore";
import { LoadingPage } from "../loadingPage";
import GroupPageViewSelector from "./pageViewSelector";
import { useDocumentLock } from "../../Hooks/DocumentLock/useDocumentLock.js";
import { USER_JOB_GROUPS_COLLECTION } from "../../Functions/DocumentLock/documentLockCollections.js";
import { useRegisterHeaderDocumentLockUI } from "../../Hooks/DocumentLock/useRegisterHeaderDocumentLockUI.js";
import {
  useGroupLockReadOnly,
  useGroupCanEdit,
} from "../../Hooks/DocumentLock/useDocumentLockState.js";
import { useJobPlannerJobLockSync } from "../../Hooks/DocumentLock/useJobPlannerJobLockSync.js";
import { parseGroupPageViewSearchParam } from "../../Functions/Groups/groupPageViewSearch";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { AppEvent } from "../../analytics/appEventNames";
import SaveGroupTemplateDialogue from "../Dialogues/Group Templates/SaveGroupTemplateDialogue";
import ApplyGroupTemplateDialogue from "../Dialogues/Group Templates/ApplyGroupTemplateDialogue";

function GroupPageFrame() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { activeGroupID, jobArray } = useUsersStore((state) => state.jobData);
  const { getGroupObject, clearMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const params = useParams({ from: "/group/$groupID" });
  const { groupID } = params;
  const search = useSearch({ from: "/group/$groupID" });
  const { state, actions } = useGroupPageReducer(search.pageView);

  useEffect(() => {
    const pv = parseGroupPageViewSearchParam(search.pageView);
    if (pv && pv !== state.pageView) {
      actions.setPageView(pv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.pageView, state.pageView]);

  const groupReadOnly = useGroupLockReadOnly(groupID);
  const groupCanEdit = useGroupCanEdit(groupID);

  useJobPlannerJobLockSync();

  const navigate = useNavigate({ from: "/group/$groupID" });
  const activeGroupObject = getGroupObject(groupID);
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
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
    function onRemoteGroupDeleted(
      /** @type {CustomEvent<{ groupID?: string }>} */ ev,
    ) {
      if (ev?.detail?.groupID === groupID) {
        navigate({ to: "/jobplanner" });
      }
    }
    window.addEventListener("eip-group-deleted-remotely", onRemoteGroupDeleted);
    return () => {
      window.removeEventListener(
        "eip-group-deleted-remotely",
        onRemoteGroupDeleted,
      );
    };
  }, [groupID, navigate]);

  useEffect(() => {
    clearMultiSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupID]);

  useWarnBeforeUnload();

  const buttonOptions = useGroupPageSideMenuFunctions(
    state,
    actions,
    groupJobs,
    pageRequiresRightDrawerOpen,
    groupCanEdit,
  );

  const isGroupReady = activeGroupID === groupID;
  const groupLockEnabled = Boolean(
    isLoggedIn && groupID && activeGroupObject && isGroupReady,
  );

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
    <>
      {/* The route loads the group, so this is not the entry wait: it covers the
          frame between a group being closed and the navigation away landing. */}
      {!isGroupReady ? (
        <LoadingPage variant="simple" helperText="Loading group…" />
      ) : (
        <>
          <LeftCollapsibleMenuDrawer inputDrawerButtons={buttonOptions} />
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
            <CollapsibleContentDrawer_Right
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
      <ShoppingListDialogue />
      <PriceEntryDialogue />
      <PriceHistoryDialogue />
      <MarketDataDialogue />
      <ApplyGroupTemplateDialogue />
      <SaveGroupTemplateDialogue />
    </>
  );
}

export default GroupPageFrame;
