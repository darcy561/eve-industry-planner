import { useContext, useEffect, useMemo, useState } from "react";
import { Box, useMediaQuery } from "@mui/material";
import { Header } from "../Header";
import useSetupUnmountEventListeners from "../../Hooks/GeneralHooks/useSetupUnmountEventListeners";
import { ActiveJobContext, JobArrayContext } from "../../Context/JobContext";
import { LoadingPage } from "../loadingPage";
import { ESIOffline } from "../offlineNotification";
import { SearchBar } from "../Job Planner/Planner Components/searchbar";
import { ShoppingListDialog } from "../Dialogues/Shopping List/ShoppingList";
import { useNavigate, useParams } from "react-router-dom";
import LeftCollapseableMenuDrawer from "../SideMenu/leftMenuDrawer";
import { Footer } from "../Footer/Footer";
import CollapseableContentDrawer_Right from "../SideMenu/rightContentDrawer";
import RightSideMenuContent_GroupPage from "./Side Menu/rightSideMenuContent";
import GroupAccordionFrame from "./Accordion/AccordionFrame";
import {
  EvePricesContext,
  SystemIndexContext,
} from "../../Context/EveDataContext";
import {
  FirebaseListenersContext,
  IsLoggedInContext,
} from "../../Context/AuthContext";
import manageListenerRequests from "../../Functions/Firebase/manageListenerRequests";
import GroupNameFrame from "./Group Name/groupNameFrame";
import { MultiSelectJobPlannerContext } from "../../Context/LayoutContext";
import { useGroupPageSideMenuFunctions } from "./Side Menu/Buttons/buttonFunctions";
import getMissingJobObjects from "../../Functions/Helper/getMissingJobObjects";
import { PriceEntryDialog } from "../Dialogues/Price Entry/PriceEntryList";
import convertJobIDsToObjects from "../../Functions/Helper/convertJobIDsToObjects";
import { useInstallCostsCalc } from "../../Hooks/GeneralHooks/useInstallCostCalc";
import recalculateInstallCostsWithNewData from "../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import getMissingESIData from "../../Functions/Shared/getMissingESIData";
import PriceHistoryDialog from "../Dialogues/Price History/dialogFrame";
import MarketDataDialog from "../Dialogues/Market Data/dialogFrame";

function GroupPageFrame({ colorMode }) {
  const { activeGroup, updateActiveGroup } = useContext(ActiveJobContext);
  const { jobArray, updateJobArray, groupArray } = useContext(JobArrayContext);
  const { evePrices, updateEvePrices } = useContext(EvePricesContext);
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);
  const { firebaseListeners, updateFirebaseListeners } = useContext(
    FirebaseListenersContext
  );
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { updateMultiSelectJobPlanner } = useContext(
    MultiSelectJobPlannerContext
  );
  const [expandRightContentMenu, updateExpandRightContentMenu] =
    useState(false);
  const [rightContentMenuContentID, updateRightContentMenuContentID] =
    useState(null);
  const [skeletonElementsToDisplay, setSkeletonElementsToDisplay] = useState(0);
  const [highlightedItems, updateHighlightedItem] = useState(new Set());
  const [isPriceHistoryDialogOpen, setIsPriceHistoryDialogOpen] =
    useState(false);
  const [priceHistoryTypeID, setPriceHistoryTypeID] = useState(null);
  const [isMarketDataDialogOpen, setIsMarketDataDialogOpen] = useState(false);
  const [marketDataTypeID, setMarketDataTypeID] = useState(null);
  const { calculateInstallCostFromJob } = useInstallCostsCalc();
  const { groupID } = useParams();

  const navigate = useNavigate();
  const activeGroupObject = groupArray.find((i) => i.groupID === groupID);
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
        if (!activeGroupObject) {
          throw new Error("Unable to find requested group");
        }

        const retrievedJobs = await getMissingJobObjects(
          activeGroupObject.includedJobIDs,
          jobArray
        );

        const allJobObjects = await convertJobIDsToObjects(
          activeGroupObject.includedJobIDs,
          jobArray,
          retrievedJobs
        );

        const { requestedMarketData, requestedSystemIndexes } =
          await getMissingESIData(allJobObjects, evePrices, systemIndexData);

        recalculateInstallCostsWithNewData(
          allJobObjects,
          calculateInstallCostFromJob,
          requestedMarketData,
          requestedSystemIndexes
        );

        updateEvePrices((prev) => ({
          ...prev,
          ...requestedMarketData,
        }));
        updateSystemIndexData((prev) => ({
          ...prev,
          ...requestedSystemIndexes,
        }));
        updateActiveGroup(activeGroupObject.groupID);
        updateMultiSelectJobPlanner([]);
        updateJobArray((prev) => {
          const existingIDs = new Set(prev.map(({ jobID }) => jobID));
          return [
            ...prev,
            ...retrievedJobs.filter(({ jobID }) => !existingIDs.has(jobID)),
          ];
        });
        manageListenerRequests(
          activeGroupObject.includedJobIDs,
          updateJobArray,
          updateFirebaseListeners,
          firebaseListeners,
          isLoggedIn
        );
      } catch (err) {
        console.error(err);
        navigate("/jobplanner");
      }
    }
    retrieveGroupData();
  }, [groupArray]);

  useSetupUnmountEventListeners();

  const buttonOptions = useGroupPageSideMenuFunctions(
    groupJobs,
    updateExpandRightContentMenu,
    rightContentMenuContentID,
    updateRightContentMenuContentID,
    setSkeletonElementsToDisplay,
    pageRequiresRightDrawerOpen
  );

  if (!activeGroup) return <LoadingPage />;

  return (
    <>
      <Header colorMode={colorMode} />

      <ShoppingListDialog />
      <PriceEntryDialog />
      {isPriceHistoryDialogOpen && (
        <PriceHistoryDialog
          isOpen={isPriceHistoryDialogOpen}
          setIsOpen={setIsPriceHistoryDialogOpen}
          typeID={priceHistoryTypeID}
          setTypeID={setPriceHistoryTypeID}
        />
      )}
      {isMarketDataDialogOpen && (
        <MarketDataDialog
          isOpen={isMarketDataDialogOpen}
          setIsOpen={setIsMarketDataDialogOpen}
          typeID={marketDataTypeID}
          setTypeID={setPriceHistoryTypeID}
        />
      )}
      <LeftCollapseableMenuDrawer inputDrawerButtons={buttonOptions} />
      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          paddingTop: 10,
          paddingX: 2,
          gap: 2,
        }}
      >
        <ESIOffline />
        <GroupNameFrame />
        {!deviceNotMobile && rightContentMenuContentID === 1 && (
          <SearchBar
            updateRightContentMenuContentID={updateRightContentMenuContentID}
            setSkeletonElementsToDisplay={setSkeletonElementsToDisplay}
          />
        )}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: { xs: "center", md: "flex-start" },
            gap: 2,
            width: "100%",
            flex: 1,
          }}
        >
          <GroupAccordionFrame
            skeletonElementsToDisplay={skeletonElementsToDisplay}
            groupJobs={groupJobs}
            highlightedItems={highlightedItems}
          />
        </Box>
        <Footer />
      </Box>
      {deviceNotMobile && (
        <CollapseableContentDrawer_Right
          DrawerContent={
            <RightSideMenuContent_GroupPage
              groupJobs={groupJobs}
              rightContentMenuContentID={rightContentMenuContentID}
              updateRightContentMenuContentID={updateRightContentMenuContentID}
              updateExpandRightContentMenu={updateExpandRightContentMenu}
              setSkeletonElementsToDisplay={setSkeletonElementsToDisplay}
              highlightedItems={highlightedItems}
              updateHighlightedItem={updateHighlightedItem}
              pageRequiresDrawerToBeOpen={pageRequiresRightDrawerOpen}
              setIsPriceHistoryDialogOpen={setIsPriceHistoryDialogOpen}
              setPriceHistoryTypeID={setPriceHistoryTypeID}
              setIsMarketDataDialogOpen={setIsMarketDataDialogOpen}
              setMarketDataTypeID={setMarketDataTypeID}
            />
          }
          expandRightContentMenu={expandRightContentMenu}
          updateExpandRightContentMenu={updateExpandRightContentMenu}
          pageRequiresDrawerToBeOpen={pageRequiresRightDrawerOpen}
        />
      )}
    </>
  );
}

export default GroupPageFrame;
