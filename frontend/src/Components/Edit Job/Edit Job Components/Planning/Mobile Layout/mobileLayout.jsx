import { Grid } from "@mui/material";
import { TutorialStep1 } from "../tutorialStep1";
import { ProductionStats } from "../Standard Layout/Production Stats Panel/productionStats";
import { JobSetupPanel } from "../Standard Layout/Setup Panel/jobSetups";
import { EditJobSetup } from "../Standard Layout/Edit Setup Panel/editJobSetup";
import { AvailableBlueprintsPanel } from "../Standard Layout/Blueprint Options/blueprintPanel";
import MaterialsAndSourcingPanel from "../Standard Layout/Materials And Sourcing/materialsAndSourcingPanel";
import PlanningEconomics from "../Standard Layout/Cost Breakdown/planningEconomics";
import { SkillsPanel } from "../Standard Layout/Skills Panel/SkillsPanel";
import ArchiveJobsPanel from "../Standard Layout/Archive Jobs Panel/archiveJobsPanel";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";

export function Planning_MobileLayout_EditJob() {
  return (
    <Grid container spacing={2} sx={{ marginTop: 1 }}>
      <Grid size={{ xs: 12 }}>
        <TutorialTemplate TutorialContent={<TutorialStep1 />} />
      </Grid>
      <Grid size={{ xs: 12 }} spacing={2} container>
        <ProductionStats />
        <JobSetupPanel />
        <EditJobSetup />
        <AvailableBlueprintsPanel />
        <MaterialsAndSourcingPanel />
        <PlanningEconomics />
        <ArchiveJobsPanel />
        <SkillsPanel />
      </Grid>
    </Grid>
  );
}
