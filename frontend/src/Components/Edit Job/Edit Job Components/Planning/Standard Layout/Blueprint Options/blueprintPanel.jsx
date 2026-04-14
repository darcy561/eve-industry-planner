import { Typography, Grid } from "@mui/material";
import { ManufacturingLayout_BlueprintPanel } from "./manufacturingLayout";
import { ReactionLayout_BlueprintOptions } from "./reactionLayout";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { jobTypes } from "../../../../../../Context/defaultValues";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function AvailableBlueprintsPanel(props) {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);

  return (
    <ContentPanel
      visible={isLoggedIn}
      title="Blueprint Library"
      componentName="Blueprint Library"
      paperSx={{ height: "auto" }}
      titleMarginBottom={2}
    >
      <LayoutSwitcher {...props} />
    </ContentPanel>
  );
}

function LayoutSwitcher(props) {
  const { state } = props;
  switch (state.activeJob.jobType) {
    case jobTypes.manufacturing:
      return <ManufacturingLayout_BlueprintPanel {...props} />;
    case jobTypes.reaction:
      return <ReactionLayout_BlueprintOptions {...props} />;
    default:
      return (
        <Grid align="center" size={12}>
          <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
            No Blueprints Found
          </Typography>
        </Grid>
      );
  }
}
