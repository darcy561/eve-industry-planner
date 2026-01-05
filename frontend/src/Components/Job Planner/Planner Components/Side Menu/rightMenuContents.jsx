import AddNewJobSharedContentPanel from "../../../SideMenu/Shared Panels/Add New Job/AddNewJobPanel";
import TutorialTemplate from "../../../Tutorials/tutorialTemplate";
import { TutorialContent_JobPlanner } from "../tutorialPlanner";
import toggleRightDrawerColapse from "../../../SideMenu/Functions/toggleRightMenuDrawerColapse";

function RightSideMenuContent_JobPlanner(props) {
  const { state, actions } = props;

  switch (state.rightDrawerContentID) {
    case 1:
      return <AddNewJobSharedContentPanel {...props} />;

    default:
      return (
        <TutorialTemplate
          TutorialContent={<TutorialContent_JobPlanner {...props} />}
          updateExpandedMenu={(x) =>
            toggleRightDrawerColapse(
              state.rightDrawerContentID,
              state.rightDrawerContentID,
              (value) => actions.setExpandRightDrawer(value),
              state?.pageRequiresDrawerToBeOpen ?? false
            )
          }
          {...props}
        />
      );
  }
}

export default RightSideMenuContent_JobPlanner;
