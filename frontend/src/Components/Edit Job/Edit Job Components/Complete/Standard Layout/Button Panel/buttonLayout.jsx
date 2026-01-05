import { Grid } from "@mui/material";

import { SellGroupJobButton } from "./sellGroupJob";
import { MarkAsCompleteButton } from "./markAsComplete";
import { PassBuildCostsButton } from "./passBuildCosts";
import { ArchiveJobButton } from "./archiveJobButton";

export function Complete_ButtonPanel_EditJob(props) {
  return (
    <Grid container justifyContent="flex-end">
      <SellGroupJobButton {...props} />
      <MarkAsCompleteButton {...props} />
      <PassBuildCostsButton {...props} />
      <ArchiveJobButton {...props} />
    </Grid>
  );
}
