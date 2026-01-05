import { List } from "@mui/material";
import { useGroupPageSideMenuFunctions } from "./Buttons/buttonFunctions";
import uuid from "react-uuid";
import { SidemenuButtonTemplate_Default } from "../../SideMenu/defaultButtonTemplate";

function SideMenuContent_GroupPage({
  expandedState,
  updateExpandRightContentMenu,
  rightContentMenuContentID,
  updateRightContentMenuContentID,
}) {
  const buttonOptions = useGroupPageSideMenuFunctions(
    updateExpandRightContentMenu,
    rightContentMenuContentID,
    updateRightContentMenuContentID
  );

  return (
    <List>
      {buttonOptions.map((option, index) => {
        return (
          <SidemenuButtonTemplate_Default
            key={`leftMenuButton-${index}`}
            buttonContent={option}
            expandedState={expandedState}
          />
        );
      })}
    </List>
  );
}

export default SideMenuContent_GroupPage;
