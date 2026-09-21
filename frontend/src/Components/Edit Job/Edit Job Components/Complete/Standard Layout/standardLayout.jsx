import { Grid } from "@mui/material";

import { TutorialStep4 } from "../tutorialStep4";
import { ExtrasPanel } from "./Extras Panel/extras";
import { JobCostSummaryPanel } from "./Job Cost Panel/jobCostSummary";
import { Complete_ButtonPanel_EditJob } from "./Button Panel/buttonLayout";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";

export function Complete_StandardLayout_EditJob() {
  return (
    <Grid container spacing={2}>
      <TutorialTemplate TutorialContent={<TutorialStep4 />} />
      <Grid
        size={{
          xs: 12,
          md: 6,
        }}
      >
        <ExtrasPanel />
      </Grid>
      <Grid
        size={{
          xs: 12,
          md: 6,
        }}
      >
        <JobCostSummaryPanel />
      </Grid>
      <Grid size={12}>
        <Complete_ButtonPanel_EditJob />
      </Grid>
    </Grid>
  );
}
