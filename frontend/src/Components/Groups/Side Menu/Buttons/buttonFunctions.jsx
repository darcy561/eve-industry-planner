import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import CloseIcon from "@mui/icons-material/Close";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import Polyline from "@mui/icons-material/Polyline";
import PriceCheckIcon from "@mui/icons-material/PriceCheck";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import PostAddIcon from "@mui/icons-material/PostAdd";
import { useNavigate } from "@tanstack/react-router";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import LibraryAddIcon from "@mui/icons-material/LibraryAdd";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import { passBuildCostsToParentJobs } from "../../../../Functions/Shared/passBuildCosts";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";
import buildNextMaterialsTree from "../../../../Functions/JobPlanner/buildNextMaterialsTree";
import { archiveGroupJobs } from "../../../../Functions/Groups/archiveGroupJobs.js";
import { invalidateAllBuildStatsQueries } from "../../../../Hooks/React Query/Backend/buildStats.js";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../Events/snackbarEvents";
import { displayNotificationDialog } from "../../../../Events/notificationDialogEvents";
import useUsersStore from "../../../../Zustand/usersStore";
import toggleRightDrawerColapse from "../../../SideMenu/Functions/toggleRightMenuDrawerColapse";
import { shouldExpandRightDrawer } from "../../../Tutorials/Functions/checkDisplayTutorials";
import { showShoppingList } from "../../../../Events/shoppingListEvents";
import { showPriceEntryDialog } from "../../../../Events/priceEntryEvents";
import moveItemsOnPlanner from "../../../../Functions/JobPlanner/moveItemsOnPlanner";
import closeActiveGroup from "../../../../Functions/Groups/closeGroup";
import { USER_JOB_GROUPS_COLLECTION } from "../../../../Functions/DocumentLock/documentLockCollections.js";
import {
  openGroupTemplatesApplyDialog,
  openGroupTemplatesSaveDialog,
} from "../../../../Events/groupTemplatesDialogEvents";

/** Left drawer actions still allowed when the group doc lock is read-only. */
const GROUP_LEFT_PANEL_READONLY_ALLOWED = new Set([
  "Close Group",
  "Shopping List",
  "Select All",
  "Clear Selection",
]);

export function useGroupPageSideMenuFunctions(
  state,
  actions,
  groupJobs,
  pageRequiresDrawerToBeOpen,
  groupReadOnly = false,
) {
  const { multiSelect } = useUsersStore((state) => state.jobData);
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const {
    addToMultiSelect,
    clearMultiSelect,
    updateModifiedGroups,
    queueJobGroupWritesAndSchedule,
    getActiveGroupObject,
  } = useUsersStore.getState().jobData.actions;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeGroupObject = getActiveGroupObject();

  const standardDialogError =
    "You will need to select at least 1 job using the checkbox's on the job cards.";

  const buttons = useMemo(() => {
    const roOff = (label) =>
      groupReadOnly && !GROUP_LEFT_PANEL_READONLY_ALLOWED.has(label);

    return [
      {
        displayText: "Close Group",
        icon: <CloseIcon />,
        hoverColor: "error.main",
        tooltip: "Saves and closes the group.",
        divider: true,
        disabled: roOff("Close Group"),
        onClick: async () => {
          const groupID = activeGroupObject?.groupID;
          await closeActiveGroup(groupJobs);
          if (groupID) {
            await useUsersStore
              .getState()
              .documentLock.actions.yieldDocumentLockOnLeave(
                USER_JOB_GROUPS_COLLECTION,
                groupID
              );
          }
          navigate({ to: "/jobplanner" });
        },
      },
      {
        displayText: "Add New Jobs",
        icon: <PostAddIcon />,
        tooltip: "Adds new jobs to the group.",
        disabled: roOff("Add New Jobs"),
        onClick: () => {
          // If clicking the same content ID, fall back to tutorial state
          if (state.rightDrawerContentID === 1) {
            // Fall back to tutorial-based state
            actions.setRightDrawerContentID(null);
            const shouldExpand = shouldExpandRightDrawer(
              pageRequiresDrawerToBeOpen,
            );
            actions.setExpandRightDrawer(shouldExpand);
          } else {
            // Override tutorial logic and force open with content
            actions.setRightDrawerContentID(1);
            actions.setExpandRightDrawer(true);
          }
        },
      },
      ...(isLoggedIn
        ? [
            {
              displayText: "Save as template",
              icon: <LibraryAddIcon />,
              tooltip:
                "Save this group's job layout and setups as a reusable template.",
              disabled: roOff("Save as template"),
              onClick: () => {
                if (!groupJobs?.length) {
                  displayNotificationDialog(
                    "No jobs",
                    "Add jobs to this group before saving a template.",
                  );
                  return;
                }
                openGroupTemplatesSaveDialog({
                  contextGroupId: activeGroupObject?.groupID ?? null,
                });
              },
            },
            {
              displayText: "Apply template…",
              icon: <LibraryBooksIcon />,
              tooltip: "Create jobs from a saved group template.",
              disabled: roOff("Apply template…"),
              onClick: () => {
                openGroupTemplatesApplyDialog({
                  contextGroupId: activeGroupObject?.groupID ?? null,
                });
              },
            },
          ]
        : []),
      {
        displayText: "Shopping List",
        icon: <ShoppingCartIcon />,
        tooltip:
          "Displays a shopping list of the remaining materials needed for all group jobs  or selected jobs.",
        disabled: roOff("Shopping List"),
        onClick: () => {
          const jobList =
            multiSelect.length > 0
              ? multiSelect
              : [...activeGroupObject.includedJobIDs];
          showShoppingList(jobList);
        },
      },
      {
        displayText: "Add Item Costs",
        icon: <PriceCheckIcon />,
        tooltip:
          "Input item costs for all selected jobs or all jobs in the group.",
        disabled: roOff("Add Item Costs"),
        onClick: async () => {
          const jobList =
            multiSelect.length > 0
              ? multiSelect
              : [...activeGroupObject.includedJobIDs];

          showPriceEntryDialog(jobList);
        },
      },
      {
        displayText: "Build Child Jobs",
        icon: <AccountTreeIcon />,
        tooltip:
          "Adds the next ingrediants of all of the jobs or just the selected jobs.",
        disabled: roOff("Build Child Jobs"),
        onClick: async () => {
          const jobList =
            multiSelect.length > 0
              ? multiSelect
              : [...activeGroupObject.includedJobIDs];

          await buildNextMaterialsTree(
            jobList,
            (x) => actions.setSkeletonElementsToDisplay(x),
            queryClient,
          );
        },
      },
      {
        displayText: "Build Full Tree",
        icon: <Polyline />,
        tooltip: "Adds the full item tree for all output jobs.",
        disabled: roOff("Build Full Tree"),
        onClick: async () => {
          const jobList =
            multiSelect.length > 0
              ? multiSelect
              : [...activeGroupObject.includedJobIDs];
          await buildNextMaterialsTree(
            jobList,
            (x) => actions.setSkeletonElementsToDisplay(x),
            queryClient,
            true,
          );
        },
      },
      {
        displayText: "Move Backwards",
        icon: <ArrowUpwardIcon />,
        tooltip: "Moves the selected jobs 1 step backwards on the planner.",
        disabled: roOff("Move Backwards"),
        onClick: () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          moveItemsOnPlanner(multiSelect, "backward");
        },
      },
      {
        displayText: "Move Forwards",
        icon: <ArrowDownwardIcon />,
        tooltip: "Moves the selected jobs 1 step forwards on the planner.",
        disabled: roOff("Move Forwards"),
        onClick: () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          moveItemsOnPlanner(multiSelect, "forward");
        },
      },
      {
        displayText: "Send Item Costs",
        icon: <DoneAllIcon />,
        tooltip:
          "Sends the selected items costs to their parent jobs and marks the jobs as complete.",
        disabled: roOff("Send Item Costs"),
        onClick: async () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          const group = getActiveGroupObject();
          group.addAreComplete(multiSelect);
          const { messageText } = await passBuildCostsToParentJobs(multiSelect);
          if (messageText) {
            showSnackbarSuccess(messageText);
          } else {
            showSnackbarError(`No build costs imported.`, 3);
          }
          if (group?.groupID) {
            updateModifiedGroups(group);
            queueJobGroupWritesAndSchedule(group.groupID);
          }
        },
      },
      {
        displayText: "Select All",
        icon: <SelectAllIcon />,
        tooltip: "Selects all jobs in the group.",
        disabled: roOff("Select All"),
        onClick: () => {
          addToMultiSelect(groupJobs.map((job) => job.jobID));
        },
      },
      {
        displayText: "Clear Selection",
        icon: <DeselectIcon />,
        tooltip: "Clears the selected jobs.",
        disabled: roOff("Clear Selection"),
        onClick: () => {
          clearMultiSelect();
        },
      },
      {
        displayText: "Delete",
        icon: <DeleteSweepIcon />,
        hoverColor: "error.main",
        tooltip: "Deletes the selected jobs from the group.",
        divider: true,
        disabled: roOff("Delete"),
        onClick: async () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          await deleteJobsFromPlanner(multiSelect);
          clearMultiSelect();
        },
      },
      {
        displayText: "Archive Group Jobs",
        icon: <ArchiveOutlinedIcon />,
        hoverColor: "error.main",
        tooltip:
          "Archives all jobs except the output jobs and then deletes the group.",
        disabled: roOff("Archive Group Jobs"),
        onClick: async () => {
          const didArchiveOnServer = await archiveGroupJobs(groupJobs);
          if (didArchiveOnServer) {
            invalidateAllBuildStatsQueries(queryClient);
          }
          navigate({ to: "/jobplanner" });
        },
      },
    ];
  }, [
    actions,
    groupJobs,
    multiSelect,
    queryClient,
    toggleRightDrawerColapse,
    groupReadOnly,
    isLoggedIn,
  ]);

  function throwDialogError(inputText = standardDialogError) {
    displayNotificationDialog("Oops", inputText);
  }

  return buttons;
}
