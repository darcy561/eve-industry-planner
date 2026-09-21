import { Grid, Stack } from "@mui/material";
import { ProductionStats } from "./Production Stats Panel/productionStats";
import { TutorialStep1 } from "../tutorialStep1";
import { JobSetupPanel } from "./Setup Panel/jobSetups";
import { EditJobSetup } from "./Edit Setup Panel/editJobSetup";
import { AvailableBlueprintsPanel } from "./Blueprint Options/blueprintPanel";
import MaterialsAndSourcingPanel from "./Materials And Sourcing/materialsAndSourcingPanel";
import PlanningEconomics from "./Cost Breakdown/planningEconomics";
import { SkillsPanel } from "./Skills Panel/SkillsPanel";
import ArchiveJobsPanel from "./Archive Jobs Panel/archiveJobsPanel";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";

/**
 * The stage's two columns of panels.
 *
 * Panels are stacked rather than laid out by a Masonry. A masonry exists to pack
 * items of different heights into several columns without leaving gaps; at one
 * column there is nothing to pack, and the measuring it does to find out is not
 * free — it positions every child absolutely and re-measures the whole column
 * whenever any one of them changes height. Opening a material's drawer moved
 * every panel beneath it.
 */
export function Planning_StandardLayout_EditJob() {
  return (
    <Grid container sx={{ marginTop: { xs: 0, sm: 2 } }}>
      <Grid size={12} sx={{ marginBottom: 2 }}>
        <TutorialTemplate TutorialContent={<TutorialStep1 />} />
      </Grid>
      <Grid size={3}>
        <Stack spacing={2}>
          <ProductionStats />
          <EditJobSetup />
          <AvailableBlueprintsPanel />
          <SkillsPanel />
        </Stack>
      </Grid>
      <Grid size={9}>
        <Stack spacing={2}>
          <JobSetupPanel />
          <MaterialsAndSourcingPanel />
          <PlanningEconomics />
          <ArchiveJobsPanel />
        </Stack>
      </Grid>
    </Grid>
  );
}
