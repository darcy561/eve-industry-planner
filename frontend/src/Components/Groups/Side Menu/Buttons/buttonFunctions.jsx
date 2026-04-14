import { useMemo } from "react";
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
import { ArchiveOutlined, DoneAll } from "@mui/icons-material";
import { passBuildCostsToParentJobs } from "../../../../Functions/Shared/passBuildCosts";
import uploadJobSnapshotsToFirebase from "../../../../Functions/Firebase/uploadJobSnapshots";
import manageListenerRequests from "../../../../Functions/Firebase/manageListenerRequests";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";
import useBuildJobTree from "../../../../Hooks/JobHooks/useBuildNextMaterials";
import { useArchiveGroupJobs } from "../../../../Hooks/GroupHooks/useArchiveGroupJobs";
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

export function useGroupPageSideMenuFunctions(
  state,
  actions,
  groupJobs,
  pageRequiresDrawerToBeOpen
) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { multiSelect, groupArray, userJobSnapshot } = useUsersStore((state) => state.jobData);
  const { addToMultiSelect, clearMultiSelect, replaceGroupArray, getActiveGroupObject, addRetrievedJobsToJobArray } =
    useUsersStore.getState().jobData.actions;
  const { buildNextMaterials } = useBuildJobTree();
  const { archiveGroupJobs } = useArchiveGroupJobs();
  const navigate = useNavigate();
  const activeGroupObject = getActiveGroupObject();

  const standardDialogError =
    "You will need to select at least 1 job using the checkbox's on the job cards.";

  const buttons = useMemo(() => {
    return [
      {
        displayText: "Close Group",
        icon: <CloseIcon />,
        hoverColor: "error.main",
        tooltip: "Saves and closes the group.",
        divider: true,
        onClick: async () => {
          await closeActiveGroup(groupJobs);
          navigate({ to: "/jobplanner" });
        },
      },
      {
        displayText: "Add New Jobs",
        icon: <PostAddIcon />,
        tooltip: "Adds new jobs to the group.",
        onClick: () => {
          // If clicking the same content ID, fall back to tutorial state
          if (state.rightDrawerContentID === 1) {
            // Fall back to tutorial-based state
            actions.setRightDrawerContentID(null);
            const shouldExpand = shouldExpandRightDrawer(
              pageRequiresDrawerToBeOpen
            );
            actions.setExpandRightDrawer(shouldExpand);
          } else {
            // Override tutorial logic and force open with content
            actions.setRightDrawerContentID(1);
            actions.setExpandRightDrawer(true);
          }
        },
      },
      {
        displayText: "Shopping List",
        icon: <ShoppingCartIcon />,
        tooltip:
          "Displays a shopping list of the remaining materials needed for all group jobs  or selected jobs.",
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
        onClick: async () => {
          const jobList =
            multiSelect.length > 0
              ? multiSelect
              : [...activeGroupObject.includedJobIDs];

          await buildNextMaterials(jobList, (x) =>
            actions.setSkeletonElementsToDisplay(x)
          );
        },
      },
      {
        displayText: "Build Full Tree",
        icon: <Polyline />,
        tooltip: "Adds the full item tree for all output jobs.",
        onClick: async () => {
          const jobList =
            multiSelect.length > 0
              ? multiSelect
              : [...activeGroupObject.includedJobIDs];
          await buildNextMaterials(
            jobList,
            (x) => actions.setSkeletonElementsToDisplay(x),
            true
          );
        },
      },
      {
        displayText: "Move Backwards",
        icon: <ArrowUpwardIcon />,
        tooltip: "Moves the selected jobs 1 step backwards on the planner.",
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
        icon: <DoneAll />,
        tooltip:
          "Sends the selected items costs to their parent jobs and marks the jobs as complete.",
        onClick: async () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          const group = getActiveGroupObject();
          group.addAreComplete(multiSelect);
          const { messageText, retrievedJobs } = await passBuildCostsToParentJobs(
            multiSelect
          );
          manageListenerRequests(retrievedJobs);
          if (messageText) {
            showSnackbarSuccess(messageText);
          } else {
            showSnackbarError(`No build costs imported.`, 3);
          }
          addRetrievedJobsToJobArray(retrievedJobs);
          replaceGroupArray([...groupArray]);

          if (isLoggedIn) {
            await uploadJobSnapshotsToFirebase(userJobSnapshot);
          }
        },
      },
      {
        displayText: "Select All",
        icon: <SelectAllIcon />,
        tooltip: "Selects all jobs in the group.",
        onClick: () => {
          addToMultiSelect(groupJobs.map((job) => job.jobID));
        },
      },
      {
        displayText: "Clear Selection",
        icon: <DeselectIcon />,
        tooltip: "Clears the selected jobs.",
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
        icon: <ArchiveOutlined />,
        hoverColor: "error.main",
        tooltip:
          "Archives all jobs except the output jobs and then deletes the group.",
        onClick: async () => {
          archiveGroupJobs(groupJobs);
          navigate({ to: "/jobplanner" });
        },
      },
    ];
  }, [actions, groupJobs, multiSelect, toggleRightDrawerColapse]);

  function throwDialogError(inputText = standardDialogError) {
    displayNotificationDialog("Oops", inputText);
  }

  return buttons;
}
