import { PlannerAccordion } from "./Planner Components/accordion";
import { SearchBar } from "./Planner Components/searchbar";
import { Box, useMediaQuery } from "@mui/material";
import { ShoppingListDialog } from "../Dialogues/Shopping List/ShoppingList";
import { PriceEntryDialog } from "../Dialogues/Price Entry/PriceEntry";
import { MassBuildFeedback } from "./Planner Components/massBuildInfo";
import LeftCollapseableMenuDrawer from "../SideMenu/leftMenuDrawer";
import CollapseableContentDrawer_Right from "../SideMenu/rightContentDrawer";
import RightSideMenuContent_JobPlanner from "./Planner Components/Side Menu/rightMenuContents";
import { useJobPlannerSideMenuFunctions } from "./Planner Components/Side Menu/Buttons/buttonfunctions";
import useJobPlannerReducer from "./Hooks/useJobPlannerReducer";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";

function JobPlanner() {
  const { state: pageState, actions: pageActions } = useJobPlannerReducer();
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const buttonOptions = useJobPlannerSideMenuFunctions(pageState, pageActions);


  return (
    <DefaultPageLayout>
      <LeftCollapseableMenuDrawer inputDrawerButtons={buttonOptions} />
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
        <CollapseableContentDrawer_Right
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
      <ShoppingListDialog />
      <MassBuildFeedback />
      <PriceEntryDialog />
    </DefaultPageLayout>
  );
}

export default JobPlanner;
