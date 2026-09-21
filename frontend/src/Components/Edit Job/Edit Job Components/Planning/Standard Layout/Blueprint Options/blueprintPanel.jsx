import { Typography, Grid } from "@mui/material";
import { ManufacturingLayout_BlueprintPanel } from "./manufacturingLayout";
import { ReactionLayout_BlueprintOptions } from "./reactionLayout";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { jobTypes } from "../../../../../../Context/defaultValues";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";

export function AvailableBlueprintsPanel() {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);

  return (
    <ContentPanel
      visible={isLoggedIn}
      title="Blueprint Library"
      componentName="Blueprint Library"
      paperSx={{ height: "auto" }}
      titleMarginBottom={2}
    >
      <LayoutSwitcher />
    </ContentPanel>
  );
}

function LayoutSwitcher() {
  const jobType = useJobDraft((job) => job.jobType);

  switch (jobType) {
    case jobTypes.manufacturing:
      return <ManufacturingLayout_BlueprintPanel />;
    case jobTypes.reaction:
      return <ReactionLayout_BlueprintOptions />;
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
