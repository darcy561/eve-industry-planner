import { Box, Stack } from "@mui/material";
import { OutputPanel } from "./Output/outputPanel";
import { TutorialStep1 } from "../tutorialStep1";
import { SetupsPanel } from "./Setups/setupsPanel";
import { BlueprintLibraryPanel } from "./Blueprint Library/blueprintLibraryPanel";
import MaterialsAndSourcingPanel from "./Materials And Sourcing/materialsAndSourcingPanel";
import PlanningEconomics from "./Cost Breakdown/planningEconomics";
import { SkillsPanel } from "./Skills Panel/SkillsPanel";
import ArchiveJobsPanel from "./Archive Jobs Panel/archiveJobsPanel";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";

/**
 * The stage's two columns of panels.
 */
export function Planning_StandardLayout_EditJob() {
  return (
    <Stack spacing={2} sx={{ marginTop: { xs: 0, sm: 2 } }}>
      <TutorialTemplate TutorialContent={<TutorialStep1 />} />
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        <Stack spacing={2} sx={{ flex: "3 1 0", minWidth: 0 }}>
          <OutputPanel />
          <BlueprintLibraryPanel />
          <SkillsPanel />
        </Stack>
        <Stack spacing={2} sx={{ flex: "9 1 0", minWidth: 0 }}>
          <SetupsPanel />
          <MaterialsAndSourcingPanel />
          <PlanningEconomics />
          <ArchiveJobsPanel />
        </Stack>
      </Box>
    </Stack>
  );
}
