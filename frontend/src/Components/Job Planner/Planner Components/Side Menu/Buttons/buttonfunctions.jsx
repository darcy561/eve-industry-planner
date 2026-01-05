import { useMemo } from "react";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import PriceCheckIcon from "@mui/icons-material/PriceCheck";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import PostAddIcon from "@mui/icons-material/PostAdd";
import { useJobManagement } from "../../../../../Hooks/useJobManagement";
import deleteJobsFromPlanner from "../../../../../Functions/JobPlanner/deleteMultipleJobs";
import { useNavigate } from "@tanstack/react-router";
import { displayNotificationDialog } from "../../../../../Events/notificationDialogEvents";
import toggleRightDrawerColapse from "../../../../SideMenu/Functions/toggleRightMenuDrawerColapse";
import { shouldExpandRightDrawer } from "../../../../Tutorials/Functions/checkDisplayTutorials";
import { showShoppingList } from "../../../../../Events/shoppingListEvents";
import { showPriceEntryDialog } from "../../../../../Events/priceEntryEvents";
import useUsersStore from "../../../../../Zustand/usersStore";
import moveItemsOnPlanner from "../../../../../Functions/JobPlanner/moveItemsOnPlanner";

export function useJobPlannerSideMenuFunctions(pageState, pageActions) {
  const { multiSelect, userJobSnapshot } = useUsersStore((state) => state.jobData);
  const { addToMultiSelect, clearMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const { massBuildMaterials, mergeJobsNew } =
    useJobManagement();
  const navigate = useNavigate({ from: '/jobplanner' });

  const standardDialogError =
    "You will need to select at least 1 job using the checkbox's on the job cards.";

  const buttonOptions = useMemo(() => {
    return [
      {
        displayText: "Add New Job",
        icon: <PostAddIcon />,
        tooltip: "Adds new jobs to the planner.",
        onClick: () => {
          // If clicking the same content ID, fall back to tutorial state
          if (pageState.rightDrawerContentID === 1) {
            // Fall back to tutorial-based state
            pageActions.setRightDrawerContentID(null);
            const shouldExpand = shouldExpandRightDrawer(
              pageState.pageRequiresDrawerToBeOpen
            );
            pageActions.setExpandRightDrawer(shouldExpand);
          } else {
            // Override tutorial logic and force open with content
            pageActions.setRightDrawerContentID(1);
            pageActions.setExpandRightDrawer(true);
          }
        },
      },
      {
        displayText: "New Group",
        icon: <CreateNewFolderIcon />,
        divider: true,
        tooltip:
          "Creates a new job group from the job selection you have or an empty group.",
        onClick: async () => {
          navigate({
            to: '/group/new',
            search: { includes: [...multiSelect].join(',') }
          });
        },
      },
      {
        displayText: "Shopping List",
        icon: <ShoppingCartIcon />,
        tooltip:
          "Displays a shopping list of the remaining materials needed to build all of the selected jobs.",
        onClick: () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          showShoppingList(multiSelect);
        },
      },
      {
        displayText: "Add Ingredient Jobs",
        icon: <AccountTreeIcon />,
        tooltip:
          "Sets up new jobs to build the combined ingredient totals of each selected job cards.",
        onClick: () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          massBuildMaterials(multiSelect);
          clearMultiSelect();
        },
      },
      {
        displayText: "Add Item Costs",
        icon: <PriceCheckIcon />,
        tooltip: "Input item costs for all selected jobs.",
        onClick: async () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          showPriceEntryDialog(multiSelect);
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
        displayText: "Merge Jobs",
        icon: <CallMergeIcon />,
        tooltip: "Merges the selected jobs into one.",
        onClick: () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          mergeJobsNew(multiSelect);
          clearMultiSelect();
        },
      },
      {
        displayText: "Select All",
        icon: <SelectAllIcon />,
        tooltip: "Selects all jobs on the planner.",
        onClick: () => {
          addToMultiSelect(userJobSnapshot.map((job) => job.jobID));
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
        tooltip: "Deletes the selected jobs from the planner.",
        hoverColor: "error.main",
        onClick: async () => {
          if (multiSelect.length === 0) {
            throwDialogError();
            return;
          }
          await deleteJobsFromPlanner(multiSelect);
          clearMultiSelect();
        },
      },
    ];
  }, [
    multiSelect,
    userJobSnapshot,
    toggleRightDrawerColapse,
    massBuildMaterials,
    moveItemsOnPlanner,
    standardDialogError,
  ]);

  function throwDialogError(inputText = standardDialogError) {
    displayNotificationDialog("Oops", inputText);
  }

  return buttonOptions;
}
