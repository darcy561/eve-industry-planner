import { Grid } from "@mui/material";
import { TutorialStep1 } from "../tutorialStep1";
import { ProductionStats } from "../Standard Layout/Production Stats Panel/productionStats";
import { JobSetupPanel } from "../Standard Layout/Setup Panel/jobSetups";
import { EditJobSetup } from "../Standard Layout/Edit Setup Panel/editJobSetup";
import { AvailableBlueprintsPanel } from "../Standard Layout/Blueprint Options/blueprintPanel";
import { RawResourceList } from "../Standard Layout/Resources Panel/ResourcePanel";
import { MaterialCostPanel } from "../Standard Layout/Material Prices/materialPricePanel";
import { SkillsPanel } from "../Standard Layout/Skills Panel/SkillsPanel";
import ArchiveJobsPanel from "../Standard Layout/Archive Jobs Panel/archiveJobsPanel";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";

export function Planning_MobileLayout_EditJob(props) {
  const { state } = props;
  return (
    <Grid container spacing={2} sx={{ marginTop: 1 }}>
      <Grid size={{ xs: 12 }}>
        <TutorialTemplate TutorialContent={<TutorialStep1 state={state} />} />
      </Grid>
      <Grid size={{ xs: 12 }} spacing={2} container>
        <ProductionStats {...props} />
        <JobSetupPanel {...props} />
        <EditJobSetup {...props} />
        <AvailableBlueprintsPanel {...props} />
        <RawResourceList {...props} />
        <MaterialCostPanel {...props} />
        <ArchiveJobsPanel {...props} />
        <SkillsPanel {...props} />
      </Grid>
    </Grid>
  );
}
