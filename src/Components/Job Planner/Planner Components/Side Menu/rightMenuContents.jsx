import AddNewJobSharedContentPanel from "../../../SideMenu/Shared Panels/Add New Job/AddNewJobPanel";
import TutorialTemplate from "../../../Tutorials/tutorialTemplate";
import { TutorialContent_JobPlanner } from "../tutorialPlanner";

function RightSideMenuContent_JobPlanner({
  rightContentMenuContentID,
  updateRightContentMenuContentID,
  updateExpandRightContentMenu,
  setSkeletonElementsToDisplay,
  pageRequiresDrawerToBeOpen,
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
        <TutorialTemplate
          TutorialContent={TutorialContent_JobPlanner}
          updateExpandedMenu={updateExpandRightContentMenu}
        />
      );
  }
}

export default RightSideMenuContent_JobPlanner;
