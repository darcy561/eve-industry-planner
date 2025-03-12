import AddNewJobSharedContentPanel from "../../SideMenu/Shared Panels/Add New Job/AddNewJobPanel";
import OutputJobsInfoPanel from "./Panels/OutputData/OutputFrame";

function RightSideMenuContent_GroupPage({
  groupJobs,
  rightContentMenuContentID,
  updateRightContentMenuContentID,
  updateExpandRightContentMenu,
  setSkeletonElementsToDisplay,
  highlightedItems,
  updateHighlightedItem,
  pageRequiresDrawerToBeOpen,
  setIsPriceHistoryDialogOpen,
  setPriceHistoryTypeID,
  setIsMarketDataDialogOpen,
  setMarketDataTypeID,
}) {
  switch (rightContentMenuContentID) {
    case 1:
      return (
        <AddNewJobSharedContentPanel
          hideContentPanel={updateExpandRightContentMenu}
          contentID={rightContentMenuContentID}
          updateContentID={updateRightContentMenuContentID}
          setSkeletonElementsToDisplay={setSkeletonElementsToDisplay}
          pageRequiresDrawerToBeOpen={pageRequiresDrawerToBeOpen}
        />
      );
    default:
      return (
        <OutputJobsInfoPanel
          groupJobs={groupJobs}
          highlightedItems={highlightedItems}
          updateHighlightedItem={updateHighlightedItem}
          setIsPriceHistoryDialogOpen={setIsPriceHistoryDialogOpen}
          setPriceHistoryTypeID={setPriceHistoryTypeID}
          setIsMarketDataDialogOpen={setIsMarketDataDialogOpen}
          setMarketDataTypeID={setMarketDataTypeID}
        />
      );
  }
}

export default RightSideMenuContent_GroupPage;
