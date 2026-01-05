import AddNewJobSharedContentPanel from "../../SideMenu/Shared Panels/Add New Job/AddNewJobPanel";
import OutputJobsInfoPanel from "./Panels/OutputData/OutputFrame";

function RightSideMenuContent_GroupPage(props) {
  const { state } = props;
  switch (state.rightDrawerContentID) {
    case 1:
      return <AddNewJobSharedContentPanel {...props} />;
    default:
      return <OutputJobsInfoPanel {...props} />;
  }
}

export default RightSideMenuContent_GroupPage;
