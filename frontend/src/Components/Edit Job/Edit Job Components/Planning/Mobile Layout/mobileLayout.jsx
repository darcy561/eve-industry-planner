import { Grid } from "@mui/material";
import { TutorialStep1 } from "../tutorialStep1";
import { OutputPanel } from "../Standard Layout/Output/outputPanel";
import { SetupsPanel } from "../Standard Layout/Setups/setupsPanel";
import { BlueprintLibraryPanel } from "../Standard Layout/Blueprint Library/blueprintLibraryPanel";
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
        <OutputPanel />
        <SetupsPanel />
        <BlueprintLibraryPanel />
        <MaterialsAndSourcingPanel />
        <PlanningEconomics />
        <ArchiveJobsPanel />
        <SkillsPanel />
      </Grid>
    </Grid>
  );
}
