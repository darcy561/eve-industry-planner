import { Grid, Stack } from "@mui/material";
import { RawResourceList } from "./Resources Panel/ResourcePanel";
import { ProductionStats } from "./Production Stats Panel/productionStats";
import { TutorialStep1 } from "../tutorialStep1";
import { JobSetupPanel } from "./Setup Panel/jobSetups";
import { EditJobSetup } from "./Edit Setup Panel/editJobSetup";
import { AvailableBlueprintsPanel } from "./Blueprint Options/blueprintPanel";
import { MaterialCostPanel } from "./Material Prices/materialPricePanel";
import { SkillsPanel } from "./Skills Panel/SkillsPanel";
import ArchiveJobsPanel from "./Archive Jobs Panel/archiveJobsPanel";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";
import { ExtrasPanel } from "../../Complete/Standard Layout/Extras Panel/extras";

export function Planning_StandardLayout_EditJob(props) {
  const { state } = props;
  return (
    <Grid container sx={{ marginTop: { xs: 0, sm: 2 } }}>
      <Grid size={12} sx={{ marginBottom: 2 }}>
        <TutorialTemplate TutorialContent={<TutorialStep1 state={state} />} />
      </Grid>
      <Grid size={3}>
        <Stack spacing={2}>
          <ProductionStats {...props} />
          <EditJobSetup {...props} />
          <AvailableBlueprintsPanel {...props} />
          <SkillsPanel {...props} />
        </Stack>
      </Grid>
      <Grid size={9}>
        <Stack spacing={2}>
          <JobSetupPanel {...props} />
          <RawResourceList {...props} />
          <MaterialCostPanel {...props} />
          <ExtrasPanel {...props} />
          <ArchiveJobsPanel {...props} />
        </Stack>
      </Grid>
    </Grid>
  );
}
