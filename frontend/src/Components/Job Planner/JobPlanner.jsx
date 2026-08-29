import { PlannerAccordion } from "./Planner Components/accordion";
import { SearchBar } from "./Planner Components/searchbar";
import { Box, useMediaQuery } from "@mui/material";
import { ShoppingListDialogue } from "../Dialogues/Shopping List/ShoppingList";
import { PriceEntryDialogue } from "../Dialogues/Price Entry/PriceEntry";
import ApplyGroupTemplateDialogue from "../Dialogues/Group Templates/ApplyGroupTemplateDialogue";
import { MassBuildFeedback } from "./Planner Components/massBuildInfo";
import LeftCollapsibleMenuDrawer from "../SideMenu/leftMenuDrawer";
import CollapsibleContentDrawer_Right from "../SideMenu/rightContentDrawer";
import RightSideMenuContent_JobPlanner from "./Planner Components/Side Menu/rightMenuContents";
import { useJobPlannerSideMenuFunctions } from "./Planner Components/Side Menu/Buttons/buttonfunctions";
import useJobPlannerReducer from "./Hooks/useJobPlannerReducer";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import { useJobPlannerPageLockSync } from "../../Hooks/DocumentLock/useJobPlannerPageLockSync.js";

function JobPlanner() {
  const { state: pageState, actions: pageActions } = useJobPlannerReducer();
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  useJobPlannerPageLockSync();

  const buttonOptions = useJobPlannerSideMenuFunctions(pageState, pageActions);

  return (
    <DefaultPageLayout>
      <LeftCollapsibleMenuDrawer inputDrawerButtons={buttonOptions} />
      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          paddingX: 0,
          gap: 1,
        }}
      >
        {!deviceNotMobile && pageState.rightDrawerContentID === 1 && (
          <SearchBar actions={pageActions} />
        )}

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: { xs: "center", md: "flex-start" },
            width: "100%",
            flex: 1,
          }}
        >
          <PlannerAccordion
            skeletonElementsToDisplay={pageState.skeletonElementsToDisplay}
          />
        </Box>
      </Box>
      {deviceNotMobile && (
        <CollapsibleContentDrawer_Right
          state={pageState}
          actions={pageActions}
          DrawerContent={
            <RightSideMenuContent_JobPlanner
              state={pageState}
              actions={pageActions}
            />
          }
        />
      )}
      <ShoppingListDialogue />
      <MassBuildFeedback />
      <PriceEntryDialogue />
      <ApplyGroupTemplateDialogue />
    </DefaultPageLayout>
  );
}

export default JobPlanner;
